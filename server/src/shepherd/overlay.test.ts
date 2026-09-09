import { describe, it, expect } from "vitest";
import { applyShepherdOverlay } from "./overlay.js";
import { upsertHints, getActiveHints, seedDemoHint } from "./store.js";
import type { Pr, ShepherdHint } from "@orbita-prs/shared";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePr(overrides: Partial<Pr> = {}): Pr {
  return {
    repoKey:     "data-pipeline",
    owner:       "acme-corp",
    number:      217,
    title:       "Test PR",
    url:         "https://github.com/acme-corp/data-pipeline/pull/217",
    stage:       "aguardando_voce",
    status:      "you",
    statusLabel: "feedback de Thiago",
    assignees:   [],
    reviewers:   [],
    updatedAt:   new Date().toISOString(),
    branch:      "fix/subject-parser",
    base:        "main",
    commits:     4,
    comments:    6,
    isMine:      true,
    ...overrides,
  };
}

function makeHint(overrides: Partial<ShepherdHint> = {}): ShepherdHint {
  return {
    agent:     { id: "demo-bot", displayName: "DemoBot" },
    owner:     "acme-corp",
    repo:      "data-pipeline",
    number:    217,
    activity:  "adjusting",
    label:     "DemoBot adjusting CI",
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("applyShepherdOverlay", () => {
  it("adjusting → forces stage to obra and status to busy", () => {
    const pr   = makePr();
    const hint = makeHint({ activity: "adjusting" });
    const [result] = applyShepherdOverlay([pr], [hint]);

    expect(result!.stage).toBe("obra");
    expect(result!.status).toBe("busy");
    expect(result!.statusLabel).toBe("DemoBot adjusting CI");
    expect(result!.shepherd).toEqual(hint);
  });

  it("merging → forces stage to obra and status to busy", () => {
    const pr   = makePr({ stage: "merge", status: "you" });
    const hint = makeHint({ activity: "merging", label: "DemoBot merging" });
    const [result] = applyShepherdOverlay([pr], [hint]);

    expect(result!.stage).toBe("obra");
    expect(result!.status).toBe("busy");
    expect(result!.shepherd).toBeDefined();
  });

  it("awaiting_approval → keeps GH stage but sets statusLabel and shepherd", () => {
    const pr   = makePr({ stage: "review", status: "wait" });
    const hint = makeHint({ activity: "awaiting_approval", label: "DemoBot awaiting approval" });
    const [result] = applyShepherdOverlay([pr], [hint]);

    expect(result!.stage).toBe("review");   // unchanged
    expect(result!.statusLabel).toBe("DemoBot awaiting approval");
    expect(result!.shepherd).toBeDefined();
  });

  it("blocked → keeps GH stage but attaches shepherd", () => {
    const pr   = makePr();
    const hint = makeHint({ activity: "blocked", label: "DemoBot blocked" });
    const [result] = applyShepherdOverlay([pr], [hint]);

    expect(result!.stage).toBe("aguardando_voce"); // unchanged
    expect(result!.shepherd).toBeDefined();
  });

  it("watching → attaches shepherd only, no label/stage change", () => {
    const pr   = makePr();
    const hint = makeHint({ activity: "watching", label: "DemoBot watching" });
    const [result] = applyShepherdOverlay([pr], [hint]);

    expect(result!.stage).toBe("aguardando_voce"); // unchanged
    expect(result!.statusLabel).toBe("feedback de Thiago"); // unchanged
    expect(result!.shepherd).toBeDefined();
  });

  it("no matching hint → PR unchanged", () => {
    const pr   = makePr({ number: 999 });
    const hint = makeHint({ number: 217 });
    const [result] = applyShepherdOverlay([pr], [hint]);

    expect(result!.shepherd).toBeUndefined();
    expect(result!.stage).toBe("aguardando_voce");
  });

  it("empty hints → returns original array", () => {
    const pr  = makePr();
    const out = applyShepherdOverlay([pr], []);
    expect(out).toBe(out); // same reference pass-through for empty
    expect(out[0]!.shepherd).toBeUndefined();
  });
});

describe("store → getActiveHints stale filter", () => {
  it("stale hints (> TTL) are not returned", () => {
    const staleDate = new Date(Date.now() - 200_000).toISOString(); // 200s ago
    // Use a unique number so no collision with other tests
    const hint      = makeHint({ updatedAt: staleDate, number: 701 });
    upsertHints("stale-agent", [hint], { id: "stale-agent", displayName: "Stale" });

    const active = getActiveHints(new Date(), 120_000);
    const found  = active.find((h) => h.number === 701);
    expect(found).toBeUndefined();
  });

  it("fresh hints are returned", () => {
    const freshDate = new Date().toISOString();
    // Use a unique number so no collision with other tests
    const hint      = makeHint({ updatedAt: freshDate, number: 702 });
    upsertHints("fresh-agent", [hint], { id: "fresh-agent", displayName: "Fresh" });

    const active = getActiveHints(new Date(), 120_000);
    const found  = active.find((h) => h.number === 702);
    expect(found).toBeDefined();
  });
});

describe("multi-agent: latest updatedAt wins", () => {
  it("newer updatedAt wins when two agents target same PR", () => {
    const now    = new Date();
    const older  = new Date(now.getTime() - 10_000).toISOString(); // 10s ago
    const newer  = now.toISOString();

    upsertHints(
      "agent-a",
      [makeHint({ number: 600, updatedAt: older,  label: "agent-a label" })],
      { id: "agent-a", displayName: "A" },
    );
    upsertHints(
      "agent-b",
      [makeHint({ number: 600, updatedAt: newer,  label: "agent-b label" })],
      { id: "agent-b", displayName: "B" },
    );

    const active = getActiveHints(now, 120_000);
    const hit    = active.find((h) => h.number === 600);
    expect(hit).toBeDefined();
    expect(hit!.label).toBe("agent-b label");
  });
});

describe("seedDemoHint", () => {
  it("seeds a synthetic hint using acme-corp/data-pipeline", () => {
    seedDemoHint();
    const active = getActiveHints(new Date(), 120_000);
    const found = active.find((h) => h.owner === "acme-corp" && h.repo === "data-pipeline");
    expect(found).toBeDefined();
    expect(found!.agent.id).toBe("demo-bot");
  });
});
