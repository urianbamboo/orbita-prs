import type { Pr } from "@orbita-prs/shared";

const MS_7D = 7 * 24 * 60 * 60 * 1000;
/** Brazil abolished DST in 2019 — America/Sao_Paulo stays UTC−3 year-round. */
const SP_OFFSET_MS = -3 * 60 * 60 * 1000;

/**
 * Monday 00:00:00 America/Sao_Paulo for the week containing `now`.
 */
export function startOfWeekMondaySp(now: Date = new Date()): Date {
  const local = new Date(now.getTime() + SP_OFFSET_MS);
  const day = local.getUTCDay(); // 0=Sun … 6=Sat in SP wall-clock
  const daysFromMon = (day + 6) % 7;
  const mondayUtcMidnightAsLocal = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() - daysFromMon,
    0, 0, 0, 0,
  );
  // Convert SP midnight back to absolute UTC instant
  return new Date(mondayUtcMidnightAsLocal - SP_OFFSET_MS);
}

export function buildEntreguesCounts(
  prs: Pr[],
  now: Date = new Date(),
): { last7d: number; week: number } {
  const weekStart = startOfWeekMondaySp(now);
  const last7dCutoff = new Date(now.getTime() - MS_7D);

  let last7d = 0;
  let week = 0;

  for (const pr of prs) {
    const mergedIso = pr.mergedAt;
    if (!mergedIso) {
      // Fallback: board already filters entregues ≈ last 7d
      if (pr.stage === "entregues") {
        last7d += 1;
      }
      continue;
    }
    const merged = new Date(mergedIso);
    if (Number.isNaN(merged.getTime())) continue;
    if (merged >= last7dCutoff) last7d += 1;
    if (merged >= weekStart) week += 1;
  }

  return { last7d, week };
}
