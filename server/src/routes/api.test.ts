import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

async function buildApp(env: Record<string, string | undefined> = {}) {
  vi.resetModules();
  for (const key of ["SHEPHERD_INGEST_TOKEN", "SHEPHERD_ALLOW_ANON"]) {
    delete process.env[key];
  }
  Object.assign(process.env, env);

  const { registerApiRoutes } = await import("./api.js");
  const app = Fastify();
  await registerApiRoutes(app);
  return app;
}

const apps: Array<ReturnType<typeof Fastify>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.restoreAllMocks();
});

describe("API write protections", () => {
  it("rejects manual sync without the CSRF-resistant action header", async () => {
    const app = await buildApp();
    apps.push(app);

    const response = await app.inject({ method: "POST", url: "/api/sync" });

    expect(response.statusCode).toBe(403);
  });

  it("fails closed when shepherd authentication is not configured", async () => {
    const app = await buildApp();
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/shepherds/demo-bot/heartbeat",
      payload: { displayName: "DemoBot" },
    });

    expect(response.statusCode).toBe(503);
  });

  it("accepts validated local-demo hints only with explicit anonymous opt-in", async () => {
    const app = await buildApp({ SHEPHERD_ALLOW_ANON: "1" });
    apps.push(app);

    const response = await app.inject({
      method: "PUT",
      url: "/api/shepherds/demo-bot/hints",
      payload: {
        agent: { id: "demo-bot", displayName: "DemoBot" },
        hints: [{
          agent: { id: "demo-bot", displayName: "DemoBot" },
          owner: "acme-corp",
          repo: "api-gateway",
          number: 42,
          activity: "adjusting",
          label: "DemoBot adjusting CI",
          updatedAt: new Date().toISOString(),
        }],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().count).toBe(1);
  });

  it("rejects malformed hint timestamps before storing them", async () => {
    const app = await buildApp({ SHEPHERD_ALLOW_ANON: "1" });
    apps.push(app);

    const response = await app.inject({
      method: "PUT",
      url: "/api/shepherds/demo-bot/hints",
      payload: {
        agent: { id: "demo-bot", displayName: "DemoBot" },
        hints: [{
          agent: { id: "demo-bot", displayName: "DemoBot" },
          owner: "acme-corp",
          repo: "api-gateway",
          number: 42,
          activity: "adjusting",
          label: "DemoBot adjusting CI",
          updatedAt: "not-a-date",
        }],
      },
    });

    expect(response.statusCode).toBe(400);
  });
});
