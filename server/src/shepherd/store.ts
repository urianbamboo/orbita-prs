/**
 * In-memory shepherd store.
 * Keyed by `owner/repo#number` (hint map) and by `agentId` (agent registry).
 */
import type { ShepherdAgent, ShepherdHint } from "@orbita-prs/shared";

// ─── Caps ─────────────────────────────────────────────────────────────────────
/** Maximum number of distinct agents allowed in the registry. */
const MAX_AGENTS = 100;
/** Maximum number of hints per agent (excess are silently truncated). */
const MAX_HINTS_PER_AGENT = 500;
const DEFAULT_AGENT_TTL_MS = 300_000;

// ─── Agent registry ────────────────────────────────────────────────────────────

interface AgentEntry {
  meta: ShepherdAgent;
  lastHeartbeat: string; // ISO
}

const agents = new Map<string, AgentEntry>();

// ─── Hint store ───────────────────────────────────────────────────────────────
// hints[agentId][hintKey] = ShepherdHint
// hintKey = `owner/repo#number`

const hintsByAgent = new Map<string, Map<string, ShepherdHint>>();

function hintKey(h: ShepherdHint): string {
  return `${h.owner}/${h.repo}#${h.number}`;
}

function agentTtlMs(): number {
  const parsed = Number(process.env["SHEPHERD_AGENT_TTL_MS"] ?? DEFAULT_AGENT_TTL_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_AGENT_TTL_MS;
}

function pruneStaleAgents(now = Date.now()): void {
  const ttlMs = agentTtlMs();
  for (const [agentId, entry] of agents) {
    const heartbeatAt = Date.parse(entry.lastHeartbeat);
    if (!Number.isFinite(heartbeatAt) || now - heartbeatAt > ttlMs) {
      agents.delete(agentId);
      hintsByAgent.delete(agentId);
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Replace all hints for this agent (full snapshot per PUT). */
export function upsertHints(
  agentId: string,
  hints: ShepherdHint[],
  agentMeta: ShepherdAgent,
): number {
  // Ensure agent is registered
  if (!heartbeat(agentId, agentMeta)) return 0;

  const capped = hints.slice(0, MAX_HINTS_PER_AGENT);
  const map = new Map<string, ShepherdHint>();
  for (const h of capped) {
    map.set(hintKey(h), h);
  }
  hintsByAgent.set(agentId, map);
  return map.size;
}

/** Record a heartbeat from an agent. */
export function heartbeat(agentId: string, meta: ShepherdAgent): boolean {
  pruneStaleAgents();
  if (agents.size >= MAX_AGENTS && !agents.has(agentId)) {
    console.warn(`[shepherd] Agent cap (${MAX_AGENTS}) reached — ignoring new agent ${agentId}`);
    return false;
  }
  agents.set(agentId, { meta, lastHeartbeat: new Date().toISOString() });
  return true;
}

/** Return all non-stale hints across all agents. Warn on multi-agent collision (latest wins). */
export function getActiveHints(now: Date = new Date(), ttlMs = 120_000): ShepherdHint[] {
  const nowMs = now.getTime();
  const effectiveTtlMs = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : 120_000;
  pruneStaleAgents(nowMs);
  // Collect per-PR: latest hint wins
  const byKey = new Map<string, ShepherdHint>();

  for (const [agentId, agentHints] of hintsByAgent) {
    for (const [key, hint] of agentHints) {
      const age = nowMs - new Date(hint.updatedAt).getTime();
      if (!Number.isFinite(age) || age > effectiveTtlMs) continue; // invalid/stale — skip

      if (byKey.has(key)) {
        const existing = byKey.get(key)!;
        const existingAge = nowMs - new Date(existing.updatedAt).getTime();
        const newAge = age;
        if (newAge < existingAge) {
          console.warn(
            `[shepherd] Multi-agent collision on ${key}: ${existing.agent.id} vs ${agentId} — using newer (${agentId})`,
          );
          byKey.set(key, hint);
        } else {
          console.warn(
            `[shepherd] Multi-agent collision on ${key}: ${existing.agent.id} vs ${agentId} — keeping older (${existing.agent.id})`,
          );
        }
      } else {
        byKey.set(key, hint);
      }
    }
  }

  return Array.from(byKey.values());
}

/** List all registered agents and their last heartbeat. */
export function listAgents(): Array<{ agent: ShepherdAgent; lastHeartbeat: string }> {
  pruneStaleAgents();
  return Array.from(agents.values()).map((e) => ({
    agent: e.meta,
    lastHeartbeat: e.lastHeartbeat,
  }));
}

/**
 * Seed a demo hint (for mock mode).
 * Uses only synthetic / clearly-fictional identifiers.
 */
export function seedDemoHint(): void {
  const demoAgent: ShepherdAgent = { id: "demo-bot", displayName: "DemoBot" };
  const demoHint: ShepherdHint = {
    agent: demoAgent,
    owner: "acme-corp",
    repo:  "data-pipeline",
    number: 217,
    activity: "adjusting",
    label:    "DemoBot adjusting CI",
    updatedAt: new Date().toISOString(),
  };
  upsertHints("demo-bot", [demoHint], demoAgent);
}
