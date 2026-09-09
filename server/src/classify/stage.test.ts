import { describe, it, expect } from "vitest";
import { classifyPr, type PrInput } from "./stage.js";

const CURRENT_USER = "alex";
const NOW = new Date("2026-06-18T14:32:00Z");

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function basePr(overrides: Partial<PrInput> = {}): PrInput {
  return {
    number: 100,
    title: "Test PR",
    draft: false,
    state: "open",
    merged_at: null,
    created_at: "2026-06-18T12:00:00Z", // 2.5 h ago → dentro de 72 h
    updated_at: "2026-06-18T12:00:00Z",
    author: CURRENT_USER,
    assignees: [],
    requestedReviewers: [],
    reviews: [],
    mergeable: null,
    mergeableState: "unknown",
    commentedAt: null,
    comments: 0,
    ...overrides,
  };
}

// ─── Entregues ────────────────────────────────────────────────────────────────

describe("entregues", () => {
  it("classifies merged PR within 7 days as entregues", () => {
    const pr = basePr({ merged_at: "2026-06-17T10:00:00Z", state: "closed" });
    const result = classifyPr(pr, CURRENT_USER, NOW);
    expect(result.stage).toBe("entregues");
    expect(result.status).toBe("done");
    expect(result.statusLabel).toBe("mergeada ontem");
  });

  it("merged today → statusLabel 'mergeada hoje'", () => {
    const pr = basePr({ merged_at: "2026-06-18T08:00:00Z", state: "closed" });
    const result = classifyPr(pr, CURRENT_USER, NOW);
    expect(result.statusLabel).toBe("mergeada hoje");
  });

  it("merged earlier this week → day name", () => {
    const pr = basePr({ merged_at: "2026-06-15T10:00:00Z", state: "closed" }); // 3 days ago
    const result = classifyPr(pr, CURRENT_USER, NOW);
    expect(result.stage).toBe("entregues");
  });

  it("merged more than 7 days ago → still entregues (caller filters)", () => {
    const pr = basePr({ merged_at: "2026-06-01T10:00:00Z", state: "closed" });
    const result = classifyPr(pr, CURRENT_USER, NOW);
    expect(result.stage).toBe("entregues");
  });
});

// ─── Aguardando você ──────────────────────────────────────────────────────────

describe("aguardando_voce", () => {
  it("changes_requested review → aguardando_voce with reviewer name", () => {
    const pr = basePr({
      reviews: [{ login: "thiago", state: "CHANGES_REQUESTED" }],
    });
    const result = classifyPr(pr, CURRENT_USER, NOW);
    expect(result.stage).toBe("aguardando_voce");
    expect(result.status).toBe("you");
    expect(result.statusLabel).toBe("feedback de thiago");
    expect(result.waitsOn).toBe("thiago");
  });

  it("changes_requested takes precedence over pending review requests", () => {
    const pr = basePr({
      requestedReviewers: ["marina"],
      reviews: [{ login: "thiago", state: "CHANGES_REQUESTED" }],
    });
    const result = classifyPr(pr, CURRENT_USER, NOW);
    expect(result.stage).toBe("aguardando_voce");
  });

  it("approved but NOT mergeable → aguardando_voce (ressalvas)", () => {
    const pr = basePr({
      reviews: [{ login: "thiago", state: "APPROVED" }],
      requestedReviewers: [],
      mergeable: false,
      mergeableState: "dirty",
    });
    const result = classifyPr(pr, CURRENT_USER, NOW);
    expect(result.stage).toBe("aguardando_voce");
    expect(result.statusLabel).toBe("aprovada com ressalvas");
  });

  it("COMMENTED review does not trigger aguardando_voce (ignored)", () => {
    const pr = basePr({
      reviews: [{ login: "thiago", state: "COMMENTED" }],
    });
    const result = classifyPr(pr, CURRENT_USER, NOW);
    expect(result.stage).toBe("nova"); // falls through to nova
  });

  it("latest review per reviewer wins — APPROVED overrides earlier CHANGES_REQUESTED", () => {
    const pr = basePr({
      reviews: [
        { login: "thiago", state: "CHANGES_REQUESTED" },
        { login: "thiago", state: "APPROVED" }, // later in array = latest
      ],
      mergeable: true,
      mergeableState: "clean",
    });
    const result = classifyPr(pr, CURRENT_USER, NOW);
    // Latest is APPROVED, no pending reviewers → should be merge
    expect(result.stage).toBe("merge");
  });

  it("review from current user does not count as changes_requested", () => {
    const pr = basePr({
      reviews: [{ login: CURRENT_USER, state: "CHANGES_REQUESTED" }],
    });
    const result = classifyPr(pr, CURRENT_USER, NOW);
    expect(result.stage).not.toBe("aguardando_voce");
  });
});

// ─── Merge ────────────────────────────────────────────────────────────────────

describe("merge", () => {
  it("approved + mergeable + no pending reviewers → merge", () => {
    const pr = basePr({
      reviews: [{ login: "thiago", state: "APPROVED" }],
      requestedReviewers: [],
      mergeable: true,
      mergeableState: "clean",
    });
    const result = classifyPr(pr, CURRENT_USER, NOW);
    expect(result.stage).toBe("merge");
    expect(result.status).toBe("you");
    expect(result.statusLabel).toBe("você pode mergear");
  });

  it("approved + mergeableState=unstable (CI optional) → merge", () => {
    const pr = basePr({
      reviews: [{ login: "thiago", state: "APPROVED" }],
      requestedReviewers: [],
      mergeable: true,
      mergeableState: "unstable",
    });
    expect(classifyPr(pr, CURRENT_USER, NOW).stage).toBe("merge");
  });

  it("approved but still has pending reviewer → review (not merge yet)", () => {
    const pr = basePr({
      reviews: [{ login: "thiago", state: "APPROVED" }],
      requestedReviewers: ["marina"],
      mergeable: true,
      mergeableState: "clean",
    });
    expect(classifyPr(pr, CURRENT_USER, NOW).stage).toBe("review");
  });
});

// ─── Review ───────────────────────────────────────────────────────────────────

describe("review", () => {
  it("single pending reviewer → 'X está revisando'", () => {
    const pr = basePr({ requestedReviewers: ["thiago"] });
    const result = classifyPr(pr, CURRENT_USER, NOW);
    expect(result.stage).toBe("review");
    expect(result.status).toBe("wait");
    expect(result.statusLabel).toBe("thiago está revisando");
    expect(result.waitsOn).toBe("thiago");
  });

  it("multiple pending reviewers → 'espera N aprovações'", () => {
    const pr = basePr({ requestedReviewers: ["thiago", "marina"] });
    const result = classifyPr(pr, CURRENT_USER, NOW);
    expect(result.stage).toBe("review");
    expect(result.statusLabel).toBe("espera 2 aprovações");
  });

  it("one approved, one pending → pct = 50", () => {
    const pr = basePr({
      requestedReviewers: ["marina"],
      reviews: [{ login: "thiago", state: "APPROVED" }],
    });
    const result = classifyPr(pr, CURRENT_USER, NOW);
    expect(result.stage).toBe("review");
    expect(result.pct).toBe(50);
  });
});

// ─── Obra ─────────────────────────────────────────────────────────────────────

describe("obra", () => {
  it("non-author assignee + recent activity → 'X editando'", () => {
    const pr = basePr({
      assignees: ["rafa"],
      updated_at: new Date(NOW.getTime() - 2 * 60 * 60 * 1000).toISOString(), // 2 h ago
    });
    const result = classifyPr(pr, CURRENT_USER, NOW);
    expect(result.stage).toBe("obra");
    expect(result.status).toBe("busy");
    expect(result.statusLabel).toBe("rafa editando");
  });

  it("assignee but stale activity (>24h) → 'X designado'", () => {
    const pr = basePr({
      assignees: ["rafa"],
      updated_at: new Date(NOW.getTime() - 25 * 60 * 60 * 1000).toISOString(),
    });
    const result = classifyPr(pr, CURRENT_USER, NOW);
    expect(result.stage).toBe("obra");
    expect(result.statusLabel).toBe("rafa designado");
  });

  it("current user as only assignee → not obra (falls through)", () => {
    const pr = basePr({ assignees: [CURRENT_USER] });
    const result = classifyPr(pr, CURRENT_USER, NOW);
    expect(result.stage).not.toBe("obra");
  });

  it("commentedAt within 24h counts as recent activity", () => {
    const pr = basePr({
      assignees: ["marina"],
      updated_at: new Date(NOW.getTime() - 30 * 60 * 60 * 1000).toISOString(), // stale
      commentedAt: new Date(NOW.getTime() - 1 * 60 * 60 * 1000).toISOString(), // fresh
    });
    const result = classifyPr(pr, CURRENT_USER, NOW);
    expect(result.stage).toBe("obra");
    expect(result.statusLabel).toBe("marina editando");
  });
});

// ─── Nova ─────────────────────────────────────────────────────────────────────

describe("nova", () => {
  it("brand new PR, no assignee/reviewers → 'aberta há X min'", () => {
    const pr = basePr({
      created_at: new Date(NOW.getTime() - 14 * 60 * 1000).toISOString(), // 14 min
    });
    const result = classifyPr(pr, CURRENT_USER, NOW);
    expect(result.stage).toBe("nova");
    expect(result.status).toBe("idle");
    expect(result.statusLabel).toBe("aberta há 14 min");
  });

  it("PR older than 72h with no assignee → 'ninguém pegou ainda'", () => {
    const pr = basePr({
      created_at: new Date(NOW.getTime() - 80 * 60 * 60 * 1000).toISOString(),
    });
    const result = classifyPr(pr, CURRENT_USER, NOW);
    expect(result.stage).toBe("nova");
    expect(result.statusLabel).toBe("ninguém pegou ainda");
  });

  it("draft PR → nova with 'rascunho'", () => {
    const pr = basePr({ draft: true });
    const result = classifyPr(pr, CURRENT_USER, NOW);
    expect(result.stage).toBe("nova");
    expect(result.statusLabel).toBe("rascunho");
  });

  it("age < 1h shows minutes", () => {
    const pr = basePr({
      created_at: new Date(NOW.getTime() - 45 * 60 * 1000).toISOString(),
    });
    expect(classifyPr(pr, CURRENT_USER, NOW).statusLabel).toBe("aberta há 45 min");
  });

  it("age >= 1h shows hours", () => {
    const pr = basePr({
      created_at: new Date(NOW.getTime() - 5 * 60 * 60 * 1000).toISOString(),
    });
    expect(classifyPr(pr, CURRENT_USER, NOW).statusLabel).toBe("aberta há 5 h");
  });
});

// ─── Precedence ───────────────────────────────────────────────────────────────

describe("precedence", () => {
  it("changes_requested beats everything else", () => {
    const pr = basePr({
      assignees: ["rafa"],
      requestedReviewers: ["marina"],
      reviews: [{ login: "thiago", state: "CHANGES_REQUESTED" }],
      mergeable: true,
      mergeableState: "clean",
    });
    expect(classifyPr(pr, CURRENT_USER, NOW).stage).toBe("aguardando_voce");
  });

  it("review beats obra", () => {
    const pr = basePr({
      assignees: ["rafa"],
      updated_at: new Date(NOW.getTime() - 1000).toISOString(),
      requestedReviewers: ["thiago"],
    });
    expect(classifyPr(pr, CURRENT_USER, NOW).stage).toBe("review");
  });

  it("obra beats nova (assignee present)", () => {
    const pr = basePr({
      assignees: ["rafa"],
      created_at: new Date(NOW.getTime() - 10 * 60 * 1000).toISOString(),
    });
    expect(classifyPr(pr, CURRENT_USER, NOW).stage).toBe("obra");
  });
});
