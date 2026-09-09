import { Octokit } from "@octokit/rest";
import type { Pr, Person, Repo, SyncStatus } from "@orbita-prs/shared";
import { classifyPr, type PrInput } from "../classify/stage.js";
import { createGitHubClients, type GitHubClient } from "./auth.js";
import {
  assertSecondaryClear,
  isSecondaryRateLimit,
  tripSecondaryCooldown,
} from "./rateLimitGate.js";

// ─── Config helpers ───────────────────────────────────────────────────────────

function parseRepoList(): Array<{ owner: string; repo: string }> {
  const list = process.env["PR_ORBIT_REPOS"];
  if (!list) return [];
  return list.split(",").map((s) => {
    const [owner, repo] = s.trim().split("/");
    if (!owner || !repo) throw new Error(`Invalid repo spec: "${s}"`);
    return { owner, repo };
  });
}

/**
 * Returns orgs to search.
 * PR_ORBIT_ORGS (comma-separated) takes precedence; falls back to PR_ORBIT_ORG.
 */
function parseOrgList(): string[] {
  const multi = process.env["PR_ORBIT_ORGS"];
  if (multi) return multi.split(",").map((s) => s.trim()).filter(Boolean);
  const primary = process.env["PR_ORBIT_ORG"];
  return primary ? [primary.trim()] : [];
}

// ─── In-memory ETag cache ─────────────────────────────────────────────────────

const etagCache = new Map<string, { etag: string; data: unknown }>();

async function conditionalGet(
  octokit: Octokit,
  route: string,
  params: Record<string, unknown>,
): Promise<{ data: unknown; notModified: boolean }> {
  assertSecondaryClear();
  const key = `${route}:${JSON.stringify(params)}`;
  const cached = etagCache.get(key);
  try {
    const headers: Record<string, string> = cached ? { "If-None-Match": cached.etag } : {};
    const response = await octokit.request(route, { ...params, headers });
    const newEtag = (response.headers as Record<string, string>)["etag"];
    if (newEtag) etagCache.set(key, { etag: newEtag, data: response.data });
    return { data: response.data, notModified: false };
  } catch (err: unknown) {
    if (isSecondaryRateLimit(err)) {
      tripSecondaryCooldown(err);
      throw err;
    }
    if (
      err &&
      typeof err === "object" &&
      "status" in err &&
      (err as { status: number }).status === 304 &&
      cached
    ) {
      return { data: cached.data, notModified: true };
    }
    throw err;
  }
}

// ─── Rate-limit awareness ─────────────────────────────────────────────────────

async function withRateLimit<T>(_octokit: Octokit, fn: () => Promise<T>): Promise<T> {
  assertSecondaryClear();
  try {
    return await fn();
  } catch (err: unknown) {
    if (isSecondaryRateLimit(err)) {
      tripSecondaryCooldown(err);
      throw err;
    }
    const e = err as { status?: number; response?: { headers?: Record<string, string> } };
    if (e.status === 403 || e.status === 429) {
      const remaining = e.response?.headers?.["x-ratelimit-remaining"];
      const reset = e.response?.headers?.["x-ratelimit-reset"];
      const waitMs = reset
        ? Math.max(0, Number(reset) * 1000 - Date.now())
        : 0;
      console.warn(
        `[sync] GitHub ${e.status} remaining=${remaining ?? "?"} reset_in=${Math.ceil(waitMs / 1000)}s — not sleeping; fail this call`,
      );
      throw err;
    }
    throw err;
  }
}

// ─── Concurrency batch runner ─────────────────────────────────────────────────

async function runConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    assertSecondaryClear();
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

// ─── Map GitHub data → domain types ──────────────────────────────────────────

function ghUserToPerson(u: { login: string; avatar_url: string }): Person {
  return {
    login:     u.login,
    name:      u.login,
    role:      "dev",
    avatarUrl: u.avatar_url,
    online:    false,
  };
}

function ghPrToInput(raw: Record<string, unknown>): PrInput {
  const requestedReviewers = ((raw["requested_reviewers"] as Array<{ login: string }>) ?? [])
    .map((u) => u.login);

  const reviews = ((raw["_reviews"] as Array<{
    user: { login: string };
    state: string;
    submitted_at?: string | null;
  }>) ?? [])
    .map((r) => ({
      login: r.user.login,
      state: r.state as PrInput["reviews"][0]["state"],
      submittedAt: r.submitted_at ?? null,
    }));

  return {
    number:             raw["number"] as number,
    title:              raw["title"] as string,
    draft:              Boolean(raw["draft"]),
    state:              raw["state"] as "open" | "closed",
    merged_at:          (raw["merged_at"] as string | null) ?? null,
    created_at:         raw["created_at"] as string,
    updated_at:         raw["updated_at"] as string,
    author:             (raw["user"] as { login: string }).login,
    assignees:          ((raw["assignees"] as Array<{ login: string }>) ?? []).map((u) => u.login),
    requestedReviewers,
    reviews,
    mergeable:          raw["mergeable"] as boolean | null,
    mergeableState:     (raw["mergeable_state"] as string) ?? "unknown",
    commentedAt:        null,
    comments:           (raw["comments"] as number) ?? 0,
  };
}

// ─── Build domain Pr from enriched raw object ─────────────────────────────────

function buildPr(
  raw:         Record<string, unknown>,
  repoKey:     string,
  owner:       string,
  currentUser: string,
): Pr {
  const input      = ghPrToInput(raw);
  const classified = classifyPr(input, currentUser);
  const isMine     = input.author === currentUser;

  const assignees = ((raw["assignees"] as Array<{ login: string; avatar_url: string }>) ?? [])
    .map(ghUserToPerson);

  const reviewers = (
    (raw["_reviews"] as Array<{ user: { login: string; avatar_url: string }; state: string }>) ?? []
  )
    .filter((r) => r.state !== "COMMENTED")
    .map((r) => ({
      person: ghUserToPerson(r.user),
      state:  (
        r.state === "APPROVED"           ? "approved" :
        r.state === "CHANGES_REQUESTED"  ? "changes"  :
                                           "pending"
      ) as "approved" | "changes" | "pending",
    }));

  return {
    repoKey,
    owner,
    number:      input.number,
    title:       input.title,
    url:         raw["html_url"] as string,
    stage:       classified.stage,
    status:      classified.status,
    statusLabel: classified.statusLabel,
    pct:         classified.pct,
    assignees,
    reviewers,
    waitsOn:     classified.waitsOn,
    updatedAt:   input.updated_at,
    stageSince:  classified.stageSince,
    branch:      (raw["head"] as { ref: string } | undefined)?.ref ?? "",
    base:        (raw["base"] as { ref: string } | undefined)?.ref ?? "",
    commits:     (raw["commits"] as number) ?? 0,
    comments:    input.comments,
    isMine,
    checkRuns:   undefined,
    mergedAt:    input.merged_at ?? undefined,
  } satisfies Pr;
}

// ─── Search API types ─────────────────────────────────────────────────────────

interface SearchPrItem {
  number:          number;
  title:           string;
  state:           string;
  user:            { login: string; avatar_url: string };
  html_url:        string;
  repository_url:  string;
  pull_request?:   { merged_at: string | null };
  created_at:      string;
  updated_at:      string;
  assignees:       Array<{ login: string; avatar_url: string }>;
  draft?:          boolean;
  comments:        number;
}

interface PrRef {
  owner:      string;
  repo:       string;
  number:     number;
  isOpen:     boolean;
  mergedAt:   string | null;
  searchItem: SearchPrItem;
  octokit:    Octokit;
}

function parseRepoFromUrl(url: string): { owner: string; repo: string } | null {
  // https://api.github.com/repos/{owner}/{repo}
  const m = url.match(/\/repos\/([^/]+)\/([^/]+)$/);
  if (!m) return null;
  return { owner: m[1]!, repo: m[2]! };
}

/** Cache: login → Search qualifier (`org:X` or `user:X`). Personal accounts reject `org:`. */
const ownerQualifierCache = new Map<string, string>();

async function searchOwnerQualifier(octokit: Octokit, login: string): Promise<string> {
  const cached = ownerQualifierCache.get(login);
  if (cached) return cached;

  try {
    const { data } = await withRateLimit(octokit, () =>
      octokit.rest.users.getByUsername({ username: login }),
    );
    const q = data.type === "Organization" ? `org:${login}` : `user:${login}`;
    ownerQualifierCache.set(login, q);
    console.log(`[sync] owner ${login} → ${q}`);
    return q;
  } catch (err) {
    // Fallback: try org first in queries; callers still catch Validation Failed
    console.warn(
      `[sync] could not resolve type for ${login}, defaulting to org:: ${err instanceof Error ? err.message : err}`,
    );
    const q = `org:${login}`;
    ownerQualifierCache.set(login, q);
    return q;
  }
}

// ─── Search for PRs under one owner (org or user) ─────────────────────────────

async function searchOrgPrs(
  octokit: Octokit,
  owner:   string,
): Promise<Omit<PrRef, "octokit">[]> {
  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);  // YYYY-MM-DD

  const ownerQ = await searchOwnerQualifier(octokit, owner);
  const refs: Omit<PrRef, "octokit">[] = [];

  // Open PRs
  try {
    const items = await withRateLimit(octokit, () =>
      octokit.paginate("GET /search/issues", {
        q:        `is:pr is:open ${ownerQ}`,
        per_page: 100,
      }) as Promise<SearchPrItem[]>,
    );
    for (const item of items) {
      const parsed = parseRepoFromUrl(item.repository_url);
      if (parsed) {
        refs.push({ ...parsed, number: item.number, isOpen: true, mergedAt: null, searchItem: item });
      }
    }
  } catch (err) {
    console.warn(`[sync] search open PRs ${ownerQ}: ${err instanceof Error ? err.message : err}`);
  }

  // Merged PRs — last 7 days
  try {
    const items = await withRateLimit(octokit, () =>
      octokit.paginate("GET /search/issues", {
        q:        `is:pr is:merged ${ownerQ} merged:>=${since7d}`,
        per_page: 100,
      }) as Promise<SearchPrItem[]>,
    );
    for (const item of items) {
      const parsed = parseRepoFromUrl(item.repository_url);
      if (parsed) {
        refs.push({
          ...parsed,
          number:     item.number,
          isOpen:     false,
          mergedAt:   item.pull_request?.merged_at ?? null,
          searchItem: item,
        });
      }
    }
  } catch (err) {
    console.warn(`[sync] search merged PRs ${ownerQ}: ${err instanceof Error ? err.message : err}`);
  }

  return refs;
}

// ─── Repo registry ────────────────────────────────────────────────────────────

const REPO_COLORS = ["#A78BFA", "#22D3EE", "#FBBF24", "#FB7185", "#34D399", "#60A5FA"];

function toRepoConfig(owner: string, repo: string, idx: number): Repo {
  return {
    key:   repo,
    owner,
    name:  repo,
    color: REPO_COLORS[idx % REPO_COLORS.length]!,
  };
}

// ─── Sync a single repo (explicit PR_ORBIT_REPOS path) ───────────────────────

interface RepoResult {
  repo:  { owner: string; name: string };
  prs:   Pr[];
  error: string | null;
}

async function syncRepo(
  octokit:     Octokit,
  owner:       string,
  repoName:    string,
  repoConfig:  Repo,
  currentUser: string,
): Promise<RepoResult> {
  try {
    const openPrs = await withRateLimit(octokit, () =>
      octokit.paginate("GET /repos/{owner}/{repo}/pulls", {
        owner,
        repo:     repoName,
        state:    "open",
        sort:     "updated",
        per_page: 100,
      }) as Promise<Record<string, unknown>[]>,
    );

    const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const closedPrs = await withRateLimit(octokit, () =>
      octokit.paginate("GET /repos/{owner}/{repo}/pulls", {
        owner,
        repo:      repoName,
        state:     "closed",
        sort:      "updated",
        direction: "desc",
        per_page:  100,
      }) as Promise<Record<string, unknown>[]>,
    );
    const mergedPrs = closedPrs.filter(
      (p) => p["merged_at"] && (p["merged_at"] as string) > since7d,
    );

    const allRaw = [...openPrs, ...mergedPrs];

    // Reviews for open PRs only — concurrency 3
    await runConcurrent(openPrs, 3, async (raw) => {
      try {
        const { data } = await conditionalGet(
          octokit,
          "GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews",
          { owner, repo: repoName, pull_number: raw["number"] as number },
        );
        raw["_reviews"] = data;
      } catch {
        raw["_reviews"] = [];
      }
    });

    const prs = allRaw.map((raw) => buildPr(raw, repoConfig.key, owner, currentUser));
    return { repo: { owner, name: repoName }, prs, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[sync] Repo ${owner}/${repoName} failed: ${msg}`);
    return { repo: { owner, name: repoName }, prs: [], error: msg };
  }
}

// ─── Search-based sync (default path) ────────────────────────────────────────

async function syncViaSearch(
  clients:     GitHubClient[],
  orgs:        string[],
  currentUser: string,
): Promise<{ prs: Pr[]; repos: Repo[]; errors: Record<string, string> }> {

  // Collect PR refs: each owner is searched only with clients that cover it
  // (avoids App A searching user/org B → Search "Validation Failed").
  const seen     = new Set<string>();
  const allRefs:  PrRef[] = [];

  for (const owner of orgs) {
    const ownerLc = owner.toLowerCase();
    const matched = clients.filter(
      (c) => c.accounts.length === 0 || c.accounts.includes(ownerLc),
    );
    const tryClients = matched.length > 0 ? matched : clients;

    for (const client of tryClients) {
      const refs = await searchOrgPrs(client.octokit, owner);
      for (const ref of refs) {
        const key = `${ref.owner}/${ref.repo}#${ref.number}`;
        if (seen.has(key)) continue;
        seen.add(key);
        allRefs.push({ ...ref, octokit: client.octokit });
      }
    }
  }

  const openRefs   = allRefs.filter((r) =>  r.isOpen);
  const mergedRefs = allRefs.filter((r) => !r.isOpen);

  console.log(
    `[sync] search found ${openRefs.length} open + ${mergedRefs.length} merged across orgs; fetching details…`,
  );

  // Fetch full PR data via pulls.get for all PRs — concurrency 5
  const fullPrByKey = new Map<string, Record<string, unknown>>();

  await runConcurrent(allRefs, 5, async (ref) => {
    const key = `${ref.owner}/${ref.repo}#${ref.number}`;
    try {
      const res = await withRateLimit(ref.octokit, () =>
        ref.octokit.rest.pulls.get({
          owner:       ref.owner,
          repo:        ref.repo,
          pull_number: ref.number,
        }),
      );
      fullPrByKey.set(key, res.data as unknown as Record<string, unknown>);
    } catch (err) {
      // Fall back to search item data (missing head/base/commits/mergeable)
      console.warn(
        `[sync] pulls.get ${ref.owner}/${ref.repo}#${ref.number} failed: ${err instanceof Error ? err.message : err}`,
      );
      const partial: Record<string, unknown> = {
        ...ref.searchItem,
        merged_at: ref.mergedAt,
        _reviews:  [],
      };
      fullPrByKey.set(key, partial);
    }
  });

  // Fetch reviews for open PRs only — concurrency 3 with conditional GET
  await runConcurrent(openRefs, 3, async (ref) => {
    const key = `${ref.owner}/${ref.repo}#${ref.number}`;
    const raw = fullPrByKey.get(key);
    if (!raw) return;
    try {
      const { data } = await conditionalGet(
        ref.octokit,
        "GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews",
        { owner: ref.owner, repo: ref.repo, pull_number: ref.number },
      );
      raw["_reviews"] = data;
    } catch {
      raw["_reviews"] = [];
    }
  });

  // Build unique repo list (in order of first appearance)
  const repoSeen  = new Set<string>();
  const repoList: Array<{ owner: string; repo: string }> = [];
  for (const ref of allRefs) {
    const k = `${ref.owner}/${ref.repo}`;
    if (!repoSeen.has(k)) {
      repoSeen.add(k);
      repoList.push({ owner: ref.owner, repo: ref.repo });
    }
  }
  const repoConfigs   = repoList.map(({ owner, repo }, i) => toRepoConfig(owner, repo, i));
  const repoConfigMap = new Map(repoConfigs.map((r) => [`${r.owner}/${r.name}`, r]));

  // Build Pr domain objects
  const prs:    Pr[]                        = [];
  const errors: Record<string, string>      = {};

  for (const ref of allRefs) {
    const key    = `${ref.owner}/${ref.repo}#${ref.number}`;
    const raw    = fullPrByKey.get(key);
    if (!raw) continue;
    const rCfg   = repoConfigMap.get(`${ref.owner}/${ref.repo}`);
    if (!rCfg) continue;
    try {
      prs.push(buildPr(raw, rCfg.key, ref.owner, currentUser));
    } catch (err) {
      errors[key] = err instanceof Error ? err.message : String(err);
    }
  }

  return { prs, repos: repoConfigs, errors };
}

// ─── Main sync ────────────────────────────────────────────────────────────────

export interface SyncResult {
  prs:        Pr[];
  repos:      Repo[];
  syncStatus: SyncStatus;
  errors:     Record<string, string>;
}

function octokitForRepo(
  clients:    GitHubClient[],
  assignment: Map<string, GitHubClient>,
  owner:      string,
  repo:       string,
): Octokit {
  const hit = assignment.get(`${owner}/${repo}`);
  return (hit ?? clients[0]!).octokit;
}

export async function syncAll(
  _tokenUnused: string,
  currentUser:  string,
): Promise<SyncResult> {
  const clients = await createGitHubClients();
  if (clients.length === 0) {
    throw new Error("No GitHub credentials — set GITHUB_APP_* or GITHUB_TOKEN");
  }

  const explicit = parseRepoList();

  // ── Explicit repos path (PR_ORBIT_REPOS set) ─────────────────────────────
  if (explicit.length > 0) {
    const assignment = new Map<string, GitHubClient>(
      explicit.map((spec) => [`${spec.owner}/${spec.repo}`, clients[0]!]),
    );
    const repoConfigs = explicit.map(({ owner, repo }, i) => toRepoConfig(owner, repo, i));

    const results = await Promise.all(
      explicit.map(({ owner, repo }, i) =>
        syncRepo(
          octokitForRepo(clients, assignment, owner, repo),
          owner,
          repo,
          repoConfigs[i]!,
          currentUser,
        ),
      ),
    );

    const allPrs = results.flatMap((r) => r.prs);
    const errors: Record<string, string> = {};
    for (const r of results) {
      if (r.error) errors[`${r.repo.owner}/${r.repo.name}`] = r.error;
    }

    const total   = results.length;
    const failed  = Object.keys(errors).length;
    const syncStatus: SyncStatus =
      failed === 0     ? "ok"
      : failed < total ? "degraded"
      :                  "error";

    return { prs: allPrs, repos: repoConfigs, syncStatus, errors };
  }

  // ── Search-based path (default) ───────────────────────────────────────────
  const orgs = parseOrgList();
  if (orgs.length === 0) {
    throw new Error(
      "No orgs configured — set PR_ORBIT_ORGS (e.g. YOUR_ORG,your-login) or PR_ORBIT_ORG",
    );
  }

  const { prs, repos, errors } = await syncViaSearch(clients, orgs, currentUser);

  if (repos.length === 0) {
    throw new Error(
      `Search returned no PRs for orgs: ${orgs.join(", ")}. ` +
      "Ensure the App is installed on each org and has repo read access.",
    );
  }

  const hasErrors  = Object.keys(errors).length > 0;
  const syncStatus: SyncStatus = hasErrors ? "degraded" : "ok";

  return { prs, repos, syncStatus, errors };
}
