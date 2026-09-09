import "./loadEnv.js";
/**
 * In-memory state store — holds the last-synced StateDto and manages
 * background polling. Singleton per process.
 */
import type { StateDto, SyncStatus, PrScope } from "@orbita-prs/shared";
import { getMockState, MOCK_CURRENT_USER } from "./mock/data.js";
import { syncAll } from "./github/sync.js";
import { getActiveHints, seedDemoHint } from "./shepherd/store.js";
import { applyShepherdOverlay } from "./shepherd/overlay.js";
import { hasGitHubCredentials } from "./github/auth.js";
import {
  secondaryCooldownActive,
  secondaryCooldownRemainingMs,
} from "./github/rateLimitGate.js";
import { buildEntreguesCounts } from "./metrics/entregues.js";

// ─── Singleton ─────────────────────────────────────────────────────────────────

const EMPTY_COUNTS: StateDto["counts"] = {
  nova: 0, obra: 0, review: 0, aguardando_voce: 0, merge: 0, entregues: 0,
};
const EMPTY_ENTREGUES = { last7d: 0, week: 0 };

let cachedState: StateDto | null = null;
let syncStatus: SyncStatus = "ok";
let isSyncing = false;
let syncTimer: ReturnType<typeof setInterval> | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const token = process.env["GITHUB_TOKEN"];

/**
 * The GitHub login for "Minhas PRs" filtering.
 * - In live mode: MUST be set via PR_ORBIT_USER (enforced at startup).
 * - In demo/mock mode: falls back to the synthetic mock user.
 */
function resolveCurrentUser(): string {
  const fromEnv = process.env["PR_ORBIT_USER"]?.trim();
  if (fromEnv) return fromEnv;
  if (isMockMode()) return MOCK_CURRENT_USER;
  // Live mode without PR_ORBIT_USER: should have been caught at startup
  throw new Error("PR_ORBIT_USER is required in live mode — set it in .env or environment");
}

function isMockMode(): boolean {
  return !hasGitHubCredentials();
}

const configuredCurrentUser = process.env["PR_ORBIT_USER"]?.trim();
if (!isMockMode() && !configuredCurrentUser) {
  throw new Error(
    "PR_ORBIT_USER is required in live mode — set it in .env or the process environment",
  );
}

if (isMockMode()) {
  const hasId  = Boolean(process.env["GITHUB_APP_ID"]?.trim());
  const hasKey = Boolean(process.env["GITHUB_APP_PRIVATE_KEY"]?.trim());
  console.log(
    `[state] No usable GitHub credentials — mock/demo mode` +
      ` (APP_ID=${hasId ? "set" : "missing"}, APP_KEY=${hasKey ? "set" : "missing"})`,
  );
}

// ─── Build counts from prs ────────────────────────────────────────────────────

function buildCounts(prs: StateDto["prs"]): StateDto["counts"] {
  const counts: StateDto["counts"] = { ...EMPTY_COUNTS };
  for (const pr of prs) counts[pr.stage] = (counts[pr.stage] ?? 0) + 1;
  return counts;
}

function withCounts(
  base: Omit<StateDto, "prs" | "counts" | "entreguesCounts"> &
    Partial<Pick<StateDto, "prs" | "counts" | "entreguesCounts">>,
  prs: StateDto["prs"],
): StateDto {
  const counts = buildCounts(prs);
  const entreguesCounts = buildEntreguesCounts(prs);
  return { ...base, prs, counts, entreguesCounts };
}

// ─── Apply shepherd overlay + recompute counts ────────────────────────────────

function withShepherdOverlay(base: StateDto): StateDto {
  const ttlMs = parseInt(process.env["SHEPHERD_HINT_TTL_MS"] ?? "120000", 10);
  const hints = getActiveHints(new Date(), ttlMs);
  if (hints.length === 0) return base;

  const prs = applyShepherdOverlay(base.prs, hints);
  return withCounts(base, prs);
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

export async function doSync(): Promise<void> {
  if (isSyncing) return;
  if (secondaryCooldownActive()) {
    const secs = Math.ceil(secondaryCooldownRemainingMs() / 1000);
    console.warn(`[state] Skipping sync — secondary rate-limit cooldown (${secs}s left)`);
    return;
  }
  isSyncing = true;
  syncStatus = "syncing";

  try {
    if (isMockMode()) {
      // Simulate slight delay to show syncing pill
      await new Promise((r) => setTimeout(r, 200));
      cachedState = getMockState("org");
      syncStatus  = "ok";
    } else {
      const currentUser = resolveCurrentUser();
      const result = await syncAll(token ?? "", currentUser);

      // Build people list from unique assignees/reviewers
      const peopleMap = new Map<string, StateDto["people"][0]>();
      for (const pr of result.prs) {
        for (const p of [...pr.assignees, ...pr.reviewers.map((r) => r.person)]) {
          if (!peopleMap.has(p.login)) peopleMap.set(p.login, p);
        }
      }

      cachedState = withCounts(
        {
          people:      Array.from(peopleMap.values()),
          repos:       result.repos,
          lastSyncAt:  new Date().toISOString(),
          syncStatus:  result.syncStatus,
          currentUser,
        },
        result.prs,
      );
      syncStatus = result.syncStatus;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[state] Sync failed:", msg);
    syncStatus = "error";
    if (!cachedState) {
      // First sync failed — use mock so the UI isn't empty
      cachedState = { ...getMockState("org"), syncStatus: "error" };
    } else {
      cachedState = { ...cachedState, syncStatus: "error", lastSyncAt: new Date().toISOString() };
    }
  } finally {
    isSyncing = false;
  }
}

export function getState(scope: PrScope): StateDto {
  if (!cachedState) {
    // Return empty-ish state while first sync is in progress
    return {
      prs:             [],
      people:          [],
      repos:           [],
      counts:          { ...EMPTY_COUNTS },
      entreguesCounts: { ...EMPTY_ENTREGUES },
      lastSyncAt:      new Date().toISOString(),
      syncStatus:      "syncing",
      currentUser:     isMockMode() ? MOCK_CURRENT_USER : (process.env["PR_ORBIT_USER"] ?? ""),
    };
  }

  // Apply shepherd overlay before scoping
  const overlaid = withShepherdOverlay({ ...cachedState, syncStatus });

  if (scope === "mine") {
    const minePrs = overlaid.prs.filter((pr) => pr.isMine);
    return withCounts(overlaid, minePrs);
  }

  return overlaid;
}

export function startPolling(intervalMs?: number): void {
  const pollMs = intervalMs
    ?? parseInt(process.env["PR_ORBIT_POLL_MS"] ?? "120000", 10);

  // Seed demo hint in mock mode
  if (isMockMode()) {
    seedDemoHint();
    console.log("[state] Mock: seeded demo shepherd hint on data-pipeline#217");
  }

  console.log(`[state] Polling every ${Math.round(pollMs / 1000)}s (search-based sync)`);

  // Initial sync
  doSync().catch(console.error);

  // Background interval
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = setInterval(() => {
    doSync().catch(console.error);
  }, pollMs);
}
