import type { Stage, ChipStatus } from "@orbita-prs/shared";

// ─── Input types (normalised from GitHub API) ─────────────────────────────────

export interface ReviewEntry {
  login: string;
  /** APPROVED | CHANGES_REQUESTED | COMMENTED | DISMISSED */
  state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED";
  /** ISO timestamp when the review was submitted, if available */
  submittedAt?: string | null;
}

export interface PrInput {
  number: number;
  title: string;
  draft: boolean;
  state: "open" | "closed";
  merged_at: string | null;
  created_at: string;
  updated_at: string;
  /** Author login */
  author: string;
  /** Assignee logins */
  assignees: string[];
  /** Logins who have a pending review request */
  requestedReviewers: string[];
  /** All submitted reviews (may contain multiple per reviewer — latest wins) */
  reviews: ReviewEntry[];
  /** null while GitHub is computing mergeability */
  mergeable: boolean | null;
  /** 'clean' | 'dirty' | 'unstable' | 'blocked' | 'unknown' */
  mergeableState: string;
  /** ISO timestamp of the last comment, if available */
  commentedAt?: string | null;
  comments: number;
}

export interface ClassifyResult {
  stage: Stage;
  status: ChipStatus;
  statusLabel: string;
  pct?: number;
  waitsOn?: string;
  /** ISO — when this PR roughly entered the classified stage */
  stageSince?: string;
}

// ─── Time constants ───────────────────────────────────────────────────────────

const MS_72H = 72 * 60 * 60 * 1000;
const MS_24H = 24 * 60 * 60 * 1000;
const MS_7D  =  7 * 24 * 60 * 60 * 1000;

// ─── Main classifier (pure function) ─────────────────────────────────────────
/**
 * Classifies a PR into one of 6 stages using first-match precedence:
 *   1. aguardando_voce  — reviewer requested changes OR merge-ready waiting on author
 *   2. review           — pending review requests
 *   3. obra             — assignee + recent activity
 *   4. nova             — no assignee/reviewers, no meaningful activity
 *   5. merge            — approved + mergeable
 *   (entregues handled via merged_at check first)
 */
export function classifyPr(
  pr: PrInput,
  currentUser: string,
  now: Date = new Date(),
): ClassifyResult {
  const nowMs = now.getTime();

  // ── Entregues: merged in the last 7 days ─────────────────────────────────
  if (pr.merged_at) {
    const mergedMs = new Date(pr.merged_at).getTime();
    if (nowMs - mergedMs <= MS_7D) {
      return {
        stage: "entregues",
        status: "done",
        statusLabel: formatMergedAt(pr.merged_at, now),
      };
    }
    // Merged but older than 7 days — not shown on the board (caller should filter)
    return { stage: "entregues", status: "done", statusLabel: "mergeada" };
  }

  // Only classify open PRs from here on
  if (pr.state !== "open") {
    return { stage: "nova", status: "idle", statusLabel: "fechada", stageSince: pr.updated_at };
  }

  // Draft PRs sit in "nova" (not ready for review)
  if (pr.draft) {
    return { stage: "nova", status: "idle", statusLabel: "rascunho", stageSince: pr.created_at };
  }

  // Get the latest review state per reviewer (COMMENTED doesn't count as decision)
  const latestByReviewer = deduplicateReviews(pr.reviews);

  const changesRequested = latestByReviewer.filter(
    (r) => r.state === "CHANGES_REQUESTED" && r.login !== currentUser,
  );
  const approved = latestByReviewer.filter(
    (r) => r.state === "APPROVED" && r.login !== currentUser,
  );

  // ── 1. Aguardando você: requested changes ────────────────────────────────
  if (changesRequested.length > 0) {
    const reviewer = changesRequested[0].login;
    return {
      stage: "aguardando_voce",
      status: "you",
      statusLabel: `feedback de ${reviewer}`,
      waitsOn: reviewer,
      stageSince: latestSubmittedAt(changesRequested) ?? pr.updated_at,
    };
  }

  // ── 5. Merge ready: approved + mergeable + no pending reviewers ───────────
  // (checked before review so "approved with all clear" beats "still waiting")
  const isMergeable =
    pr.mergeable === true ||
    pr.mergeableState === "clean" ||
    pr.mergeableState === "unstable";

  if (
    approved.length > 0 &&
    pr.requestedReviewers.length === 0 &&
    isMergeable
  ) {
    return {
      stage: "merge",
      status: "you",
      statusLabel: "você pode mergear",
      stageSince: latestSubmittedAt(approved) ?? pr.updated_at,
    };
  }

  // Approved but not fully clean (e.g. dirty / blocked after approval)
  if (approved.length > 0 && changesRequested.length === 0 && pr.requestedReviewers.length === 0) {
    return {
      stage: "aguardando_voce",
      status: "you",
      statusLabel: "aprovada com ressalvas",
      stageSince: latestSubmittedAt(approved) ?? pr.updated_at,
    };
  }

  // ── 2. Em review: pending review requests ────────────────────────────────
  if (pr.requestedReviewers.length > 0) {
    const total   = pr.requestedReviewers.length + approved.length;
    const done    = approved.length;
    const pending = pr.requestedReviewers.length;

    const statusLabel =
      pending === 1
        ? `${pr.requestedReviewers[0]} está revisando`
        : `espera ${pending} aprovações`;

    return {
      stage: "review",
      status: "wait",
      statusLabel,
      waitsOn: pr.requestedReviewers[0],
      pct: total > 0 ? Math.round((done / total) * 100) : undefined,
      // No request timestamp from GH list API — fall back to last PR touch / last approval
      stageSince: latestSubmittedAt(approved) ?? pr.updated_at,
    };
  }

  // ── 3. Em obra: assignee + recent activity ────────────────────────────────
  const nonAuthorAssignees = pr.assignees.filter((a) => a !== currentUser);
  const lastActivityMs = Math.max(
    new Date(pr.updated_at).getTime(),
    pr.commentedAt ? new Date(pr.commentedAt).getTime() : 0,
  );
  const recentActivity = nowMs - lastActivityMs <= MS_24H;

  if (nonAuthorAssignees.length > 0) {
    const assignee = nonAuthorAssignees[0];
    if (recentActivity) {
      return {
        stage: "obra",
        status: "busy",
        statusLabel: `${assignee} editando`,
        pct: undefined,
        stageSince: pr.updated_at,
      };
    }
    return {
      stage: "obra",
      status: "busy",
      statusLabel: `${assignee} designado`,
      stageSince: pr.updated_at,
    };
  }

  // ── 4. Nova ──────────────────────────────────────────────────────────────
  const ageMs = nowMs - new Date(pr.created_at).getTime();

  if (ageMs <= MS_72H) {
    return {
      stage: "nova",
      status: "idle",
      statusLabel: `aberta há ${formatAge(ageMs)}`,
      stageSince: pr.created_at,
    };
  }

  return {
    stage: "nova",
    status: "idle",
    statusLabel: "ninguém pegou ainda",
    stageSince: pr.created_at,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Keep only the latest non-COMMENTED review per reviewer */
function deduplicateReviews(reviews: ReviewEntry[]): ReviewEntry[] {
  const map = new Map<string, ReviewEntry>();
  for (const r of reviews) {
    if (r.state === "COMMENTED") continue;
    const prev = map.get(r.login);
    if (!prev) {
      map.set(r.login, r);
      continue;
    }
    const prevMs = prev.submittedAt ? new Date(prev.submittedAt).getTime() : 0;
    const nextMs = r.submittedAt ? new Date(r.submittedAt).getTime() : 0;
    if (nextMs >= prevMs) map.set(r.login, r);
  }
  return Array.from(map.values());
}

function latestSubmittedAt(reviews: ReviewEntry[]): string | undefined {
  let best: string | undefined;
  let bestMs = -1;
  for (const r of reviews) {
    if (!r.submittedAt) continue;
    const ms = new Date(r.submittedAt).getTime();
    if (Number.isFinite(ms) && ms >= bestMs) {
      bestMs = ms;
      best = r.submittedAt;
    }
  }
  return best;
}

function formatAge(ms: number): string {
  const mins  = Math.floor(ms / 60_000);
  if (mins < 60)  return `${mins} min`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 24) return `${hours} h`;
  const days  = Math.floor(ms / 86_400_000);
  return `${days} d`;
}

function formatMergedAt(mergedAt: string, now: Date): string {
  const ms   = now.getTime() - new Date(mergedAt).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) return "mergeada hoje";
  if (days === 1) return "mergeada ontem";
  const weekdays = ["domingo","segunda","terça","quarta","quinta","sexta","sábado"];
  const d = new Date(mergedAt);
  if (days <= 6) return `mergeada ${weekdays[d.getDay()]}`;
  return "mergeada recentemente";
}
