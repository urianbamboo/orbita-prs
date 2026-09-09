import { describe, expect, it } from "vitest";
import { buildEntreguesCounts, startOfWeekMondaySp } from "./entregues.js";
import type { Pr } from "@orbita-prs/shared";

function pr(mergedAt: string, stage: Pr["stage"] = "entregues"): Pr {
  return {
    repoKey: "x",
    owner: "o",
    number: 1,
    title: "t",
    url: "u",
    stage,
    status: "done",
    statusLabel: "m",
    assignees: [],
    reviewers: [],
    updatedAt: mergedAt,
    branch: "b",
    base: "main",
    commits: 1,
    comments: 0,
    isMine: true,
    mergedAt,
  };
}

describe("startOfWeekMondaySp", () => {
  it("returns Monday 00:00 SP for a Wednesday", () => {
    // 2026-09-09 15:00 UTC = 12:00 SP Wednesday
    const mon = startOfWeekMondaySp(new Date("2026-09-09T15:00:00Z"));
    // Monday 2026-09-07 00:00 SP = 2026-09-07 03:00 UTC
    expect(mon.toISOString()).toBe("2026-09-07T03:00:00.000Z");
  });

  it("keeps Sunday in the week that started the prior Monday", () => {
    // 2026-09-13 20:00 UTC = 17:00 SP Sunday
    const mon = startOfWeekMondaySp(new Date("2026-09-13T20:00:00Z"));
    expect(mon.toISOString()).toBe("2026-09-07T03:00:00.000Z");
  });
});

describe("buildEntreguesCounts", () => {
  it("splits rolling 7d vs calendar week", () => {
    // Now: Wednesday 2026-09-09 15:00 UTC
    const now = new Date("2026-09-09T15:00:00Z");
    const prs = [
      pr("2026-09-08T12:00:00Z"), // Tue this week → both
      pr("2026-09-03T12:00:00Z"), // Wed last week → last7d only (6d ago)
      pr("2026-08-20T12:00:00Z"), // too old → neither
    ];
    expect(buildEntreguesCounts(prs, now)).toEqual({ last7d: 2, week: 1 });
  });
});
