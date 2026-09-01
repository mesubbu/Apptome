/**
 * Gateway Worker, running inside workerd.
 *
 * Ports the mesh-dependent assertions from scripts/t1-check.mjs so they run
 * in CI without `pnpm dev` (REVIEW.md G7). ENVIRONMENT=local is injected by
 * vitest.config.js so pairing does not block the join-door checks.
 */
import { env, exports } from "cloudflare:workers";
import { describe, it, expect } from "vitest";

const SURFACE = "http://localhost:8790";
const CRM = "http://localhost:8787";
const EVIL = "http://evil.example";

function api(path, { method = "GET", origin, body } = {}) {
  const headers = {};
  if (origin) headers.Origin = origin;
  if (body) headers["content-type"] = "application/json";
  return exports.default.fetch(`https://hub.example${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("join door (t1-check)", () => {
  it("refuses an unlisted Origin on POST /api/pause", async () => {
    const res = await api("/api/pause", { method: "POST", origin: EVIL, body: { paused: true } });
    expect(res.status).toBe(403);
  });

  it("refuses a missing Origin on POST /api/pause", async () => {
    const res = await api("/api/pause", { method: "POST", body: { paused: true } });
    expect(res.status).toBe(403);
  });

  it("echoes the surface Origin on POST /api/pause, never *", async () => {
    const res = await api("/api/pause", { method: "POST", origin: SURFACE, body: { paused: false } });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe(SURFACE);
    expect(res.headers.get("access-control-allow-origin")).not.toBe("*");
  });

  it("refuses an unlisted Origin on GET /api/grants", async () => {
    const res = await api("/api/grants", { origin: EVIL });
    expect(res.status).toBe(403);
  });

  it("allows GET /api/grants with no Origin (non-browser)", async () => {
    const res = await api("/api/grants");
    expect(res.status).toBe(200);
  });

  it("refuses an unlisted Origin on /hub", async () => {
    const res = await exports.default.fetch("https://hub.example/hub?session=evil1", {
      headers: { Upgrade: "websocket", Origin: EVIL },
    });
    expect(res.status).toBe(403);
  });

  it("refuses a missing Origin on /hub", async () => {
    const res = await exports.default.fetch("https://hub.example/hub?session=none1", {
      headers: { Upgrade: "websocket" },
    });
    expect(res.status).toBe(403);
  });

  it("upgrades a listed Origin on /hub", async () => {
    const res = await exports.default.fetch("https://hub.example/hub?session=crm-join", {
      headers: { Upgrade: "websocket", Origin: CRM },
    });
    expect(res.status).toBe(101);
    const ws = res.webSocket;
    expect(ws).toBeTruthy();
    ws.accept();
    ws.close();
  });
});

describe("pairing door", () => {
  it("fails closed when ENVIRONMENT is not local", async () => {
    const previous = env.ENVIRONMENT;
    env.ENVIRONMENT = "production";
    try {
      const res = await api("/api/graph", { origin: SURFACE });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.code).toBe("PAIRING_REQUIRED");
    } finally {
      env.ENVIRONMENT = previous;
    }
  });
});
