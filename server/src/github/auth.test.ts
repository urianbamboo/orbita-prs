import { describe, it, expect } from "vitest";
import { parseAppSlots, normalizePrivateKey, hasGitHubCredentials } from "./auth.js";

describe("parseAppSlots", () => {
  it("returns empty when nothing is set", () => {
    expect(parseAppSlots({})).toEqual([]);
    expect(hasGitHubCredentials({})).toBe(false);
  });

  it("parses one app", () => {
    const slots = parseAppSlots({
      GITHUB_APP_ID: "111",
      GITHUB_APP_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----\\n",
    });
    expect(slots).toHaveLength(1);
    expect(slots[0]!.appId).toBe(111);
    expect(slots[0]!.privateKey).toContain("BEGIN PRIVATE KEY");
    expect(slots[0]!.privateKey).not.toContain("\\n");
  });

  it("parses two private apps", () => {
    const slots = parseAppSlots({
      GITHUB_APP_ID: "111",
      GITHUB_APP_PRIVATE_KEY: "key-one",
      GITHUB_APP_2_ID: "222",
      GITHUB_APP_2_PRIVATE_KEY: "key-two",
      GITHUB_APP_2_INSTALLATION_ID: "999",
    });
    expect(slots.map((s) => s.appId)).toEqual([111, 222]);
    expect(slots[1]!.installationId).toBe(999);
    expect(hasGitHubCredentials({ GITHUB_TOKEN: "ghp_x" })).toBe(true);
  });
});

describe("normalizePrivateKey", () => {
  it("turns escaped newlines into real ones", () => {
    const pem = normalizePrivateKey("-----BEGIN\\nEND-----\\n");
    expect(pem.split("\n")).toHaveLength(2);
  });
});
