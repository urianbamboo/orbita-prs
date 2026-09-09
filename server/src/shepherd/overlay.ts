/**
 * Pure function: apply shepherd hints on top of a Pr[] array.
 * Mutates nothing in the input — returns a new array with affected PRs replaced.
 */
import type { Pr, ShepherdHint } from "@orbita-prs/shared";

export function applyShepherdOverlay(prs: Pr[], hints: ShepherdHint[]): Pr[] {
  if (hints.length === 0) return prs;

  // Build a lookup: `owner/repoKey#number` → hint
  const hintMap = new Map<string, ShepherdHint>();
  for (const h of hints) {
    hintMap.set(`${h.owner}/${h.repo}#${h.number}`, h);
  }

  return prs.map((pr) => {
    const key = `${pr.owner}/${pr.repoKey}#${pr.number}`;
    const hint = hintMap.get(key);
    if (!hint) return pr;

    const { activity, label } = hint;

    // Adjusting or merging → force to obra / busy
    if (activity === "adjusting" || activity === "merging") {
      return {
        ...pr,
        stage:       "obra",
        status:      "busy",
        statusLabel: label,
        stageSince:  hint.updatedAt,
        shepherd:    hint,
      };
    }

    // awaiting_approval / blocked / watching → keep GH stage, attach hint
    if (activity === "awaiting_approval" || activity === "blocked") {
      return {
        ...pr,
        statusLabel: label || pr.statusLabel,
        shepherd:    hint,
      };
    }

    // watching or idle → attach hint only
    return { ...pr, shepherd: hint };
  });
}
