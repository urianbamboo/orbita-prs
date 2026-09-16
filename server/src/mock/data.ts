import type { StateDto, Pr, Person, Repo } from "@orbita-prs/shared";
import { buildEntreguesCounts } from "../metrics/entregues.js";

// ─── People ───────────────────────────────────────────────────────────────────

export const MOCK_PEOPLE: Person[] = [
  { login: "alex",   name: "Você",   role: "autor",    avatarUrl: "", online: true  },
  { login: "rafa",   name: "Rafa",   role: "dev",      avatarUrl: "", online: true  },
  { login: "marina", name: "Marina", role: "dev",      avatarUrl: "", online: true  },
  { login: "thiago", name: "Thiago", role: "reviewer", avatarUrl: "", online: true  },
];

const byLogin = Object.fromEntries(MOCK_PEOPLE.map((p) => [p.login, p]));

/** Login used as the current user in demo/mock mode. */
export const MOCK_CURRENT_USER = "alex";

// ─── Repos ────────────────────────────────────────────────────────────────────

export const MOCK_REPOS: Repo[] = [
  { key: "api-gateway",   owner: "acme-corp", name: "api-gateway",   color: "#A78BFA" },
  { key: "auth-service",  owner: "acme-corp", name: "auth-service",  color: "#22D3EE" },
  { key: "billing-api",   owner: "acme-corp", name: "billing-api",   color: "#FBBF24" },
  { key: "data-pipeline", owner: "acme-corp", name: "data-pipeline", color: "#FB7185" },
];

// ─── PRs (matching design visual exactly) ─────────────────────────────────────

const ago = (h: number, m = 0) =>
  new Date(Date.now() - (h * 3600 + m * 60) * 1000).toISOString();

export const MOCK_PRS: Pr[] = [
  // ── nova ──────────────────────────────────────────────────────────────────
  {
    repoKey:     "api-gateway",
    owner:       "acme-corp",
    number:      226,
    title:       "Add SHA-256 hash validation",
    url:         "https://github.com/acme-corp/api-gateway/pull/226",
    stage:       "nova",
    status:      "idle",
    statusLabel: "aberta há 14 min",
    assignees:   [],
    reviewers:   [],
    updatedAt:   ago(0, 14),
    branch:      "feat/sha256-validation",
    base:        "main",
    commits:     3,
    comments:    0,
    isMine:      true,
    created_at:  ago(0, 14),
  } as Pr & { created_at: string },
  {
    repoKey:     "auth-service",
    owner:       "acme-corp",
    number:      223,
    title:       "Implement event sourcing for session keys",
    url:         "https://github.com/acme-corp/auth-service/pull/223",
    stage:       "nova",
    status:      "idle",
    statusLabel: "ninguém pegou ainda",
    assignees:   [],
    reviewers:   [],
    updatedAt:   ago(6),
    branch:      "feat/event-sourcing",
    base:        "main",
    commits:     5,
    comments:    0,
    isMine:      true,
  },

  // ── obra ──────────────────────────────────────────────────────────────────
  {
    repoKey:     "data-pipeline",
    owner:       "acme-corp",
    number:      224,
    title:       "Add XML document parser",
    url:         "https://github.com/acme-corp/data-pipeline/pull/224",
    stage:       "obra",
    status:      "busy",
    statusLabel: "Rafa editando",
    pct:         62,
    assignees:   [byLogin["rafa"]!],
    reviewers:   [],
    updatedAt:   ago(0, 30),
    branch:      "feat/xml-parser-v2",
    base:        "main",
    commits:     8,
    comments:    2,
    isMine:      true,
  },
  {
    repoKey:     "billing-api",
    owner:       "acme-corp",
    number:      221,
    title:       "Add completeness gate validation",
    url:         "https://github.com/acme-corp/billing-api/pull/221",
    stage:       "obra",
    status:      "busy",
    statusLabel: "Marina editando",
    pct:         45,
    assignees:   [byLogin["marina"]!],
    reviewers:   [],
    updatedAt:   ago(1),
    branch:      "feat/completeness-gate",
    base:        "main",
    commits:     6,
    comments:    1,
    isMine:      true,
  },

  // ── review ────────────────────────────────────────────────────────────────
  {
    repoKey:     "api-gateway",
    owner:       "acme-corp",
    number:      219,
    title:       "Add retention metric to scorecard",
    url:         "https://github.com/acme-corp/api-gateway/pull/219",
    stage:       "review",
    status:      "wait",
    statusLabel: "Thiago revisando",
    assignees:   [],
    reviewers:   [{ person: byLogin["thiago"]!, state: "pending" }],
    waitsOn:     "Thiago",
    updatedAt:   ago(0, 4),
    branch:      "feat/retention-kpi",
    base:        "main",
    commits:     12,
    comments:    3,
    isMine:      true,
  },
  {
    repoKey:     "auth-service",
    owner:       "acme-corp",
    number:      218,
    title:       "Implement single-writer lock",
    url:         "https://github.com/acme-corp/auth-service/pull/218",
    stage:       "review",
    status:      "wait",
    statusLabel: "espera 2ª aprovação",
    assignees:   [],
    reviewers:   [
      { person: byLogin["thiago"]!, state: "approved" },
      { person: byLogin["marina"]!, state: "pending"  },
    ],
    waitsOn:     "Marina",
    updatedAt:   ago(2),
    branch:      "feat/single-writer",
    base:        "main",
    commits:     7,
    comments:    5,
    isMine:      true,
    pct:         50,
  },

  // ── aguardando você ───────────────────────────────────────────────────────
  {
    repoKey:     "data-pipeline",
    owner:       "acme-corp",
    number:      217,
    title:       "Improve subject parser robustness",
    url:         "https://github.com/acme-corp/data-pipeline/pull/217",
    stage:       "aguardando_voce",
    status:      "you",
    statusLabel: "feedback de Thiago",
    assignees:   [],
    reviewers:   [{ person: byLogin["thiago"]!, state: "changes" }],
    waitsOn:     "Thiago",
    updatedAt:   ago(24),
    branch:      "fix/subject-parser",
    base:        "main",
    commits:     4,
    comments:    6,
    isMine:      true,
  },
  {
    repoKey:     "auth-service",
    owner:       "acme-corp",
    number:      215,
    title:       "Byte-exact ledger replay",
    url:         "https://github.com/acme-corp/auth-service/pull/215",
    stage:       "aguardando_voce",
    status:      "you",
    statusLabel: "aprovada com ressalvas",
    assignees:   [],
    reviewers:   [{ person: byLogin["rafa"]!, state: "approved" }],
    updatedAt:   ago(3),
    branch:      "feat/byte-replay",
    base:        "main",
    commits:     9,
    comments:    4,
    isMine:      true,
  },

  // ── merge ─────────────────────────────────────────────────────────────────
  {
    repoKey:     "billing-api",
    owner:       "acme-corp",
    number:      214,
    title:       "Render template with content digest",
    url:         "https://github.com/acme-corp/billing-api/pull/214",
    stage:       "merge",
    status:      "you",
    statusLabel: "você pode mergear",
    assignees:   [],
    reviewers:   [
      { person: byLogin["thiago"]!, state: "approved" },
      { person: byLogin["marina"]!, state: "approved" },
    ],
    updatedAt:   ago(0, 26),
    branch:      "feat/template-digest",
    base:        "main",
    commits:     15,
    comments:    7,
    isMine:      true,
    checkRuns:   "success",
  },

  // ── entregues ─────────────────────────────────────────────────────────────
  {
    repoKey:     "api-gateway",
    owner:       "acme-corp",
    number:      213,
    title:       "Add aging cohort to scorecard",
    url:         "https://github.com/acme-corp/api-gateway/pull/213",
    stage:       "entregues",
    status:      "done",
    statusLabel: "mergeada ontem",
    assignees:   [],
    reviewers:   [],
    updatedAt:   ago(22),
    mergedAt:    ago(22),
    branch:      "feat/aging-cohort",
    base:        "main",
    commits:     11,
    comments:    8,
    isMine:      true,
  },
  {
    repoKey:     "auth-service",
    owner:       "acme-corp",
    number:      212,
    title:       "Add replay notifications",
    url:         "https://github.com/acme-corp/auth-service/pull/212",
    stage:       "entregues",
    status:      "done",
    statusLabel: "mergeada ontem",
    assignees:   [],
    reviewers:   [],
    updatedAt:   ago(30),
    mergedAt:    ago(30),
    branch:      "feat/replay-notifications",
    base:        "main",
    commits:     6,
    comments:    3,
    isMine:      true,
  },
  {
    repoKey:     "data-pipeline",
    owner:       "acme-corp",
    number:      209,
    title:       "Add document caching layer",
    url:         "https://github.com/acme-corp/data-pipeline/pull/209",
    stage:       "entregues",
    status:      "done",
    statusLabel: "mergeada segunda",
    assignees:   [],
    reviewers:   [],
    updatedAt:   ago(48),
    mergedAt:    ago(48),
    branch:      "feat/document-cache",
    base:        "main",
    commits:     4,
    comments:    2,
    isMine:      true,
  },
];

// ─── ORG mock: adds some PRs by teammates ─────────────────────────────────────

const ORG_EXTRA_PRS: Pr[] = [
  {
    repoKey:     "api-gateway",
    owner:       "acme-corp",
    number:      220,
    title:       "Tune alert threshold parameters",
    url:         "https://github.com/acme-corp/api-gateway/pull/220",
    stage:       "review",
    status:      "wait",
    statusLabel: "Alex está revisando",
    assignees:   [],
    reviewers:   [{ person: byLogin["alex"]!, state: "pending" }],
    waitsOn:     "Alex",
    updatedAt:   ago(5),
    branch:      "feat/alert-threshold",
    base:        "main",
    commits:     3,
    comments:    1,
    isMine:      false,
  },
  {
    repoKey:     "auth-service",
    owner:       "acme-corp",
    number:      222,
    title:       "Update schema validation for v2 format",
    url:         "https://github.com/acme-corp/auth-service/pull/222",
    stage:       "nova",
    status:      "idle",
    statusLabel: "aberta há 3 h",
    assignees:   [],
    reviewers:   [],
    updatedAt:   ago(3),
    branch:      "feat/schema-v2",
    base:        "main",
    commits:     7,
    comments:    0,
    isMine:      false,
  },
];

// ─── Build StateDto ───────────────────────────────────────────────────────────

function buildCounts(prs: Pr[]) {
  const counts: Record<string, number> = {
    nova: 0, obra: 0, review: 0, aguardando_voce: 0, merge: 0, entregues: 0,
  };
  for (const pr of prs) counts[pr.stage] = (counts[pr.stage] || 0) + 1;
  const entreguesCounts = buildEntreguesCounts(prs);
  return { counts: counts as StateDto["counts"], entreguesCounts };
}

export function getMockState(scope: "mine" | "org"): StateDto {
  const prs = scope === "org" ? [...MOCK_PRS, ...ORG_EXTRA_PRS] : MOCK_PRS;
  const { counts, entreguesCounts } = buildCounts(prs);
  return {
    prs,
    people:      MOCK_PEOPLE,
    repos:       MOCK_REPOS,
    counts,
    entreguesCounts,
    lastSyncAt:  new Date().toISOString(),
    syncStatus:  "ok",
    currentUser: MOCK_CURRENT_USER,
  };
}
