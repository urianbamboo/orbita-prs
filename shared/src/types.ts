// ─── Enums / Unions ──────────────────────────────────────────────────────────

export type Stage =
  | "nova"
  | "obra"
  | "review"
  | "aguardando_voce"
  | "merge"
  | "entregues";

export type ShepherdActivity =
  | "idle"
  | "watching"
  | "adjusting"          // actively fixing CI/review → maps to stage obra
  | "awaiting_approval"
  | "merging"
  | "blocked";

// ─── Shepherd entities ────────────────────────────────────────────────────────

export interface ShepherdAgent {
  id: string;           // e.g. "my-bot"
  displayName: string;  // e.g. "MyBot"
  ownerLogin?: string;  // GitHub login of human who owns this shepherd
}

export interface ShepherdHint {
  agent: ShepherdAgent;
  owner: string;
  repo: string;
  number: number;
  activity: ShepherdActivity;
  /** Short label for the card, e.g. "MyBot adjusting CI" */
  label: string;
  /** ISO timestamp — hints older than TTL are ignored */
  updatedAt: string;
  /** Optional detail URL (Slack thread, shepherd dashboard) */
  detailUrl?: string;
  /** Optional SHA being worked */
  sha?: string;
}

export type ChipStatus = "busy" | "wait" | "you" | "idle" | "done";

export type SyncStatus = "ok" | "syncing" | "degraded" | "error";

export type PrScope = "mine" | "org";

// ─── Core entities ───────────────────────────────────────────────────────────

export interface Repo {
  key: string;
  owner: string;
  name: string;
  color: string;
}

export interface Person {
  login: string;
  name: string;
  role: "dev" | "reviewer" | "autor";
  avatarUrl: string;
  online: boolean;
}

export interface PrReviewer {
  person: Person;
  state: "pending" | "approved" | "changes";
}

export interface Pr {
  repoKey: string;
  owner: string;
  number: number;
  title: string;
  url: string;
  stage: Stage;
  status: ChipStatus;
  /** Human-readable label shown on the card, e.g. "Rafa editando", "espera 2ª aprovação" */
  statusLabel: string;
  /** Review progress 0-100, shown in "Em obra" cards */
  pct?: number;
  assignees: Person[];
  reviewers: PrReviewer[];
  /** Who / what is blocking this PR */
  waitsOn?: string;
  updatedAt: string;
  commentedAt?: string;
  /** ISO — best-effort estimate of when the PR entered the current stage */
  stageSince?: string;
  branch: string;
  base: string;
  commits: number;
  comments: number;
  isMine: boolean;
  checkRuns?: "pending" | "success" | "failure";
  mergedAt?: string;
  /** Shepherd overlay — present when an agent is actively working this PR */
  shepherd?: ShepherdHint;
}

// ─── API DTOs ─────────────────────────────────────────────────────────────────

export interface StateDto {
  prs: Pr[];
  people: Person[];
  repos: Repo[];
  counts: Record<Stage, number>;
  /** Dual metrics for the entregues scoreboard tile */
  entreguesCounts: {
    /** Rolling last 7 × 24h */
    last7d: number;
    /** Calendar week starting Monday 00:00 America/Sao_Paulo */
    week: number;
  };
  lastSyncAt: string;
  syncStatus: SyncStatus;
  /** GitHub login of the current user — used by the "Minhas PRs" filter */
  currentUser: string;
}
