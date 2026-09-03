/**
 * Gateway Worker, running inside workerd.
 *
 * Ports the mesh-dependent assertions from scripts/t1-check.mjs so they run
 * in CI without `pnpm dev` (REVIEW.md G7). ENVIRONMENT=local is injected by
 * vitest.config.js so pairing does not block the join-door checks.
 */
import { env, exports } from "cloudflare:workers";
import { describe, it, expect } from "vitest";
import { looksLikeSecretKey, pairingKeyProblem, publicSiteKey } from "../src/pairing.js";

/** Cloudflare's documented dummy keys, which is where the two shapes come from. */
const SITE_KEY = "1x00000000000000000000AA";
const SECRET_KEY = "1x0000000000000000000000000000000AA";

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

  it("refuses a listed spoke Origin on POST /api/pause", async () => {
    const res = await api("/api/pause", { method: "POST", origin: CRM, body: { paused: true } });
    expect(res.status).toBe(403);
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

describe("declare poster", () => {
  it("does not store a client-supplied identity when the origin has no manifest", async () => {
    const res = await api("/api/declare", {
      method: "POST",
      origin: SURFACE,
      body: { origin: "https://not-a-connectome.example", identity: { name: "Fake Ledger" } },
    });
    expect(res.ok).toBe(false);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/origin|manifest|connectome/i);
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

/**
 * A swapped pair of Turnstile keys deploys clean and only fails as an opaque
 * `400020` in a console nobody is reading — and while it fails, the SECRET half
 * is being served to every browser that asks for the site key. These pin both
 * halves of that: never serve the secret, and always name the swap.
 */
describe("turnstile key shapes", () => {
  it("reads a secret key as secret-shaped and a site key as not", () => {
    expect(looksLikeSecretKey(SECRET_KEY)).toBe(true);
    expect(looksLikeSecretKey(SITE_KEY)).toBe(false);
    expect(looksLikeSecretKey(undefined)).toBe(false);
    expect(looksLikeSecretKey("")).toBe(false);
  });

  it("serves the site key when the fields are right", () => {
    const good = { TURNSTILE_SITE_KEY: SITE_KEY, TURNSTILE_SECRET: SECRET_KEY };
    expect(publicSiteKey(good)).toBe(SITE_KEY);
    expect(pairingKeyProblem(good)).toBeNull();
  });

  it("refuses to serve a secret-shaped value as the site key", () => {
    const swapped = { TURNSTILE_SITE_KEY: SECRET_KEY, TURNSTILE_SECRET: SITE_KEY };
    expect(publicSiteKey(swapped)).toBeNull();
    expect(pairingKeyProblem(swapped)).toMatch(/TURNSTILE_SITE_KEY/);
  });

  it("names the swap from the secret side too", () => {
    const problem = pairingKeyProblem({ TURNSTILE_SITE_KEY: SITE_KEY, TURNSTILE_SECRET: SITE_KEY });
    expect(problem).toMatch(/TURNSTILE_SECRET/);
  });

  it("stays quiet when the keys are simply absent", () => {
    expect(pairingKeyProblem({})).toBeNull();
    expect(publicSiteKey({})).toBeNull();
    expect(publicSiteKey({ TURNSTILE_SITE_KEY: "   " })).toBeNull();
  });

  it("reports the diagnosis on GET /api/pair instead of handing out the key", async () => {
    const before = { site: env.TURNSTILE_SITE_KEY, secret: env.TURNSTILE_SECRET };
    env.TURNSTILE_SITE_KEY = SECRET_KEY;
    env.TURNSTILE_SECRET = SITE_KEY;
    try {
      const res = await api("/api/pair", { origin: SURFACE });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.siteKey).toBeNull();
      expect(body.configured).toBe(false);
      expect(body.code).toBe("PAIRING_MISCONFIGURED");
      expect(JSON.stringify(body)).not.toContain(SECRET_KEY);
    } finally {
      env.TURNSTILE_SITE_KEY = before.site;
      env.TURNSTILE_SECRET = before.secret;
    }
  });

  it("refuses POST /api/pair rather than burning a challenge on bad keys", async () => {
    const before = {
      site: env.TURNSTILE_SITE_KEY,
      secret: env.TURNSTILE_SECRET,
      pair: env.PAIR_SECRET,
    };
    env.TURNSTILE_SITE_KEY = SECRET_KEY;
    env.TURNSTILE_SECRET = SITE_KEY;
    env.PAIR_SECRET = "test-pair-secret";
    try {
      const res = await api("/api/pair", {
        method: "POST",
        origin: SURFACE,
        body: { token: "dummy" },
      });
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.code).toBe("PAIRING_MISCONFIGURED");
      expect(res.headers.get("set-cookie")).toBeNull();
    } finally {
      env.TURNSTILE_SITE_KEY = before.site;
      env.TURNSTILE_SECRET = before.secret;
      env.PAIR_SECRET = before.pair;
    }
  });
});
