import "./loadEnv.js";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { registerApiRoutes } from "./routes/api.js";
import { startPolling } from "./state.js";

const PORT       = parseInt(process.env["PORT"] ?? "3000", 10);
const HOST       = process.env["HOST"]?.trim() || "127.0.0.1";
// SPA is for `npm start` (NODE_ENV=production). Local `npm run dev` uses Vite :5173.
const SERVE_SPA  =
  process.env["NODE_ENV"] === "production" ||
  process.env["SERVE_CLIENT"] === "1";
const CORS_EXTRA = process.env["CORS_ORIGIN"];

function hostName(value: string): string | null {
  try {
    return new URL(`http://${value}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

async function main() {
  const app = Fastify({ logger: { level: "info" } });

  // Reject DNS-rebinding requests before they reach the API.
  const trustedHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (HOST !== "0.0.0.0" && HOST !== "::") trustedHosts.add(HOST.toLowerCase());
  for (const entry of (process.env["TRUSTED_HOSTS"] ?? "").split(",")) {
    const normalized = hostName(entry.trim());
    if (normalized) trustedHosts.add(normalized);
  }
  app.addHook("onRequest", async (request, reply) => {
    const requestedHost = request.headers.host ? hostName(request.headers.host) : null;
    if (!requestedHost || !trustedHosts.has(requestedHost)) {
      return reply.status(421).send({ error: "Untrusted Host header" });
    }
  });
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' https: data:; font-src 'self'; connect-src 'self'; " +
        "object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    );
    return payload;
  });

  // ── CORS ───────────────────────────────────────────────────────────────────
  const corsOrigins: string[] = [];
  if (process.env["NODE_ENV"] !== "production") {
    corsOrigins.push("http://localhost:5173", "http://localhost:4173");
  }
  if (CORS_EXTRA) corsOrigins.push(CORS_EXTRA);

  await app.register(cors, {
    origin:  corsOrigins,
    methods: ["GET", "POST", "PUT"],
  });

  // ── API routes ─────────────────────────────────────────────────────────────
  await registerApiRoutes(app);

  // ── SPA static serving (production / SERVE_CLIENT=1) ──────────────────────
  if (SERVE_SPA) {
    const { default: fastifyStatic } = await import("@fastify/static");

    // Resolve client/dist relative to monorepo root (two levels up from server/dist/)
    const __dirname   = path.dirname(fileURLToPath(import.meta.url));
    const clientDist  = path.resolve(__dirname, "../../client/dist");

    await app.register(fastifyStatic, {
      root:       clientDist,
      prefix:     "/",
      dotfiles:   "deny",
    });

    // SPA fallback: any non-/api GET → serve index.html
    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith("/api")) {
        return reply.status(404).send({ error: "Not found" });
      }
      return reply.sendFile("index.html");
    });

    console.log(`[server] Serving SPA from ${clientDist}`);
  }

  // ── Start background polling ───────────────────────────────────────────────
  startPolling();

  await app.listen({ port: PORT, host: HOST });
  console.log(`[server] Órbita de PRs rodando em http://${HOST}:${PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
