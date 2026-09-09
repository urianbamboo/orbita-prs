import "../loadEnv.js";
import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { getState, doSync } from "../state.js";
import { upsertHints, heartbeat, listAgents } from "../shepherd/store.js";
import type { PrScope, ShepherdAgent, ShepherdHint } from "@orbita-prs/shared";

// ─── Auth helper ──────────────────────────────────────────────────────────────

const SHEPHERD_TOKEN = process.env["SHEPHERD_INGEST_TOKEN"];
const SHEPHERD_ALLOW_ANON = process.env["SHEPHERD_ALLOW_ANON"] === "1";
const MANUAL_SYNC_MIN_MS = Math.max(
  1_000,
  Number(process.env["PR_ORBIT_MANUAL_SYNC_MIN_MS"] ?? "30000") || 30_000,
);
let lastManualSyncAt = 0;

function checkShepherdAuth(authHeader: string | undefined): "ok" | "disabled" | "unauthorized" {
  if (!SHEPHERD_TOKEN) return SHEPHERD_ALLOW_ANON ? "ok" : "disabled";

  if (!authHeader?.startsWith("Bearer ")) return "unauthorized";
  const provided = authHeader.slice(7);

  try {
    const providedBuffer = createHash("sha256").update(provided).digest();
    const expectedBuffer = createHash("sha256").update(SHEPHERD_TOKEN).digest();
    return timingSafeEqual(providedBuffer, expectedBuffer) ? "ok" : "unauthorized";
  } catch {
    return "unauthorized";
  }
}

function shepherdAuthStatus(
  authHeader: string | undefined,
): { status: "ok" } | { status: "error"; code: 401 | 503; message: string } {
  const result = checkShepherdAuth(authHeader);
  if (result === "ok") return { status: "ok" };
  if (result === "disabled") {
    return {
      status: "error",
      code: 503,
      message: "Shepherd ingest is disabled until SHEPHERD_INGEST_TOKEN is configured",
    };
  }
  return { status: "error", code: 401, message: "Unauthorized" };
}

// ─── Route registration ────────────────────────────────────────────────────────

export async function registerApiRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /api/state?scope=mine|org ─────────────────────────────────────────
  app.get<{ Querystring: { scope?: string } }>("/api/state", async (request, reply) => {
    const raw   = request.query.scope;
    const scope: PrScope = raw === "org" ? "org" : "mine";
    return reply.send(getState(scope));
  });

  // ── GET /api/prs/:owner/:repo/:number ─────────────────────────────────────
  app.get<{ Params: { owner: string; repo: string; number: string } }>(
    "/api/prs/:owner/:repo/:number",
    async (request, reply) => {
      const { owner, repo, number } = request.params;
      const prNumber = parseInt(number, 10);

      // Find in state (works for both mock and live mode)
      const state = getState("org");
      const pr    = state.prs.find(
        (p) => p.owner === owner && p.repoKey === repo && p.number === prNumber,
      );
      if (!pr) return reply.status(404).send({ error: "PR not found" });
      return reply.send(pr);
    },
  );

  // ── POST /api/sync ─────────────────────────────────────────────────────────
  app.post("/api/sync", async (request, reply) => {
    if (request.headers["x-orbita-action"] !== "sync") {
      return reply.status(403).send({ error: "Missing X-Orbita-Action: sync header" });
    }
    const now = Date.now();
    const retryAfterMs = MANUAL_SYNC_MIN_MS - (now - lastManualSyncAt);
    if (retryAfterMs > 0) {
      return reply
        .status(429)
        .header("Retry-After", String(Math.ceil(retryAfterMs / 1000)))
        .send({ error: "Manual sync rate limited", retryAfterMs });
    }
    lastManualSyncAt = now;
    doSync().catch(console.error);
    return reply.send({ ok: true, message: "Sync iniciada" });
  });

  // ── Shepherd: POST /api/shepherds/:agentId/heartbeat ─────────────────────
  app.post<{
    Params: { agentId: string };
    Body:   { displayName?: string; ownerLogin?: string };
  }>(
    "/api/shepherds/:agentId/heartbeat",
    {
      schema: {
        params: {
          type: "object",
          required: ["agentId"],
          additionalProperties: false,
          properties: {
            agentId: { type: "string", minLength: 1, maxLength: 100, pattern: "^[A-Za-z0-9_.-]+$" },
          },
        },
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            displayName: { type: "string", minLength: 1, maxLength: 100 },
            ownerLogin: { type: "string", minLength: 1, maxLength: 100 },
          },
        },
      },
    },
    async (request, reply) => {
      const auth = shepherdAuthStatus(request.headers["authorization"]);
      if (auth.status === "error") {
        return reply.status(auth.code).send({ error: auth.message });
      }
      const { agentId } = request.params;
      const { displayName = agentId, ownerLogin } = request.body ?? {};
      const meta: ShepherdAgent = { id: agentId, displayName, ownerLogin };
      if (!heartbeat(agentId, meta)) {
        return reply.status(429).send({ error: "Shepherd agent capacity reached" });
      }
      return reply.send({ ok: true, agentId, at: new Date().toISOString() });
    },
  );

  // ── Shepherd: PUT /api/shepherds/:agentId/hints ───────────────────────────
  app.put<{
    Params: { agentId: string };
    Body:   { agent: ShepherdAgent; hints: ShepherdHint[] };
  }>(
    "/api/shepherds/:agentId/hints",
    {
      schema: {
        params: {
          type: "object",
          required: ["agentId"],
          additionalProperties: false,
          properties: {
            agentId: { type: "string", minLength: 1, maxLength: 100, pattern: "^[A-Za-z0-9_.-]+$" },
          },
        },
        body: {
          type: "object",
          required: ["agent", "hints"],
          additionalProperties: false,
          properties: {
            agent: {
              type: "object",
              required: ["id", "displayName"],
              additionalProperties: false,
              properties: {
                id: { type: "string", minLength: 1, maxLength: 100 },
                displayName: { type: "string", minLength: 1, maxLength: 100 },
                ownerLogin: { type: "string", minLength: 1, maxLength: 100 },
              },
            },
            hints: {
              type: "array",
              maxItems: 500,
              items: {
                type: "object",
                required: ["agent", "owner", "repo", "number", "activity", "label", "updatedAt"],
                additionalProperties: false,
                properties: {
                  agent: {
                    type: "object",
                    required: ["id", "displayName"],
                    additionalProperties: false,
                    properties: {
                      id: { type: "string", minLength: 1, maxLength: 100 },
                      displayName: { type: "string", minLength: 1, maxLength: 100 },
                      ownerLogin: { type: "string", minLength: 1, maxLength: 100 },
                    },
                  },
                  owner: { type: "string", minLength: 1, maxLength: 100, pattern: "^[A-Za-z0-9_.-]+$" },
                  repo: { type: "string", minLength: 1, maxLength: 100, pattern: "^[A-Za-z0-9_.-]+$" },
                  number: { type: "integer", minimum: 1 },
                  activity: {
                    type: "string",
                    enum: ["idle", "watching", "adjusting", "awaiting_approval", "merging", "blocked"],
                  },
                  label: { type: "string", minLength: 1, maxLength: 200 },
                  updatedAt: { type: "string", format: "date-time" },
                  detailUrl: { type: "string", maxLength: 2048, format: "uri" },
                  sha: { type: "string", maxLength: 128 },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const auth = shepherdAuthStatus(request.headers["authorization"]);
      if (auth.status === "error") {
        return reply.status(auth.code).send({ error: auth.message });
      }
      const { agentId } = request.params;
      const { agent, hints } = request.body ?? {};
      if (!agent || !Array.isArray(hints)) {
        return reply.status(400).send({ error: "Body must include agent and hints[]" });
      }
      if (agent.id !== agentId || hints.some((hint) => hint.agent.id !== agentId)) {
        return reply.status(400).send({ error: "agent.id must match the agentId path parameter" });
      }
      const count = upsertHints(agentId, hints, agent);
      return reply.send({ ok: true, agentId, count, at: new Date().toISOString() });
    },
  );

  // ── Shepherd: GET /api/shepherds ──────────────────────────────────────────
  app.get("/api/shepherds", async (_request, reply) => {
    return reply.send({ agents: listAgents() });
  });
}
