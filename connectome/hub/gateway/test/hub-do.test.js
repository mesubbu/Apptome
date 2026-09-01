/**
 * HubDO internals, running inside workerd.
 *
 * REVIEW.md G7: grant lifecycle, forget() dropping dangling grants, paused
 * gating, surface↔spoke relay, and identity from ctx.getTags() after the
 * in-memory session map is gone (hibernation).
 */
import { env } from "cloudflare:workers";
import { runInDurableObject, evictDurableObject } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { HubDO } from "../src/hub-do.js";
import { GRANT_SCOPE } from "../../../packages/protocol/protocol.js";

const CRM = "http://localhost:8787";
const LEDGER = "http://localhost:8788";
const SURFACE = "http://localhost:8790";

function stub(name) {
  return env.HUB.get(env.HUB.idFromName(name));
}

async function doJson(hub, path, body) {
  const res = await hub.fetch(
    new Request(`https://do${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
  return res.json();
}

async function doGet(hub, path) {
  const res = await hub.fetch(new Request(`https://do${path}`));
  return res.json();
}

function waitMessage(ws, pred, ms = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("ws wait timeout")), ms);
    const onMsg = (ev) => {
      let raw = ev.data;
      if (typeof raw !== "string") raw = new TextDecoder().decode(raw);
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (!pred(msg)) return;
      clearTimeout(timer);
      ws.removeEventListener("message", onMsg);
      resolve(msg);
    };
    ws.addEventListener("message", onMsg);
  });
}

async function openSocket(hub, { session, origin, host = "" }) {
  const url = new URL("https://do/hub");
  url.searchParams.set("session", session);
  if (host) url.searchParams.set("host", host);
  const res = await hub.fetch(
    new Request(url, { headers: { Upgrade: "websocket", Origin: origin } })
  );
  expect(res.status).toBe(101);
  const ws = res.webSocket;
  expect(ws).toBeTruthy();
  ws.accept();
  return ws;
}

describe("grant lifecycle", () => {
  it("records a grant and lists it", async () => {
    const hub = stub("grant-lifecycle");
    const granted = await doJson(hub, "/do/grant", {
      source: { origin: CRM, tool: "get-open-client" },
      target: { origin: LEDGER, tool: "create-invoice" },
      scope: GRANT_SCOPE.SESSION,
    });
    expect(granted.ok).toBe(true);
    expect(granted.key).toContain(CRM);
    const listed = await doGet(hub, "/do/grants");
    expect(listed.grants.some((g) => g.key === granted.key && g.revoked == null)).toBe(true);
  });

  it("revoke marks the grant revoked, it still exists", async () => {
    const hub = stub("grant-revoke");
    const granted = await doJson(hub, "/do/grant", {
      source: { origin: CRM, tool: "get-open-client" },
      target: { origin: LEDGER, tool: "create-invoice" },
    });
    const revoked = await doJson(hub, "/do/revoke", { key: granted.key });
    expect(revoked.ok).toBe(true);
    const listed = await doGet(hub, "/do/grants");
    const row = listed.grants.find((g) => g.key === granted.key);
    expect(row?.revoked).toBeTruthy();
  });
});

describe("forget() drops dangling grants", () => {
  it("removes the member and every edge that pointed at it", async () => {
    const hub = stub("forget-grants");
    await doJson(hub, "/do/declare", {
      origin: LEDGER,
      identity: { name: "Ledger" },
      capabilities: [{ name: "create-invoice" }],
    });
    const granted = await doJson(hub, "/do/grant", {
      source: { origin: CRM, tool: "get-open-client" },
      target: { origin: LEDGER, tool: "create-invoice" },
    });
    expect(granted.ok).toBe(true);

    const forgotten = await doJson(hub, "/do/forget", { origin: LEDGER });
    expect(forgotten.ok).toBe(true);

    const graph = await doGet(hub, "/do/graph");
    expect(graph.members.some((m) => m.origin === LEDGER)).toBe(false);

    const listed = await doGet(hub, "/do/grants");
    expect(listed.grants.some((g) => g.target.origin === LEDGER || g.source.origin === LEDGER)).toBe(
      false
    );
  });
});

describe("paused gating", () => {
  it("graph.paused follows setPaused, and a HELLO after pause is PAUSED", async () => {
    const hub = stub("pause-gate");
    const paused = await doJson(hub, "/do/pause", { paused: true });
    expect(paused.paused).toBe(true);
    const graph = await doGet(hub, "/do/graph");
    expect(graph.paused).toBe(true);

    const ws = await openSocket(hub, { session: "paused-crm", origin: CRM });
    const got = waitMessage(ws, (m) => m.t === "paused");
    ws.send(JSON.stringify({ t: "hello", identity: { name: "CRM" }, tools: [] }));
    const msg = await got;
    expect(msg.paused).toBe(true);
    ws.close();
  });
});

describe("identity lives in WebSocket tags", () => {
  it("HELLO.origin is a poster; the Origin header is who you are", async () => {
    const hub = stub("spoof-hello");
    const ws = await openSocket(hub, { session: "crm-spoof", origin: CRM });
    const graphWait = waitMessage(ws, (m) => m.t === "graph");
    ws.send(
      JSON.stringify({
        t: "hello",
        origin: LEDGER,
        identity: { name: "Spoofed Ledger" },
        publicKey: "not-a-real-key",
        tools: [{ name: "create-invoice", description: "x", inputSchema: { type: "object" } }],
      })
    );
    await graphWait;
    const graph = await doGet(hub, "/do/graph");
    const byOrigin = Object.fromEntries((graph.members ?? []).map((m) => [m.origin, m]));
    expect(byOrigin[CRM]).toBeTruthy();
    expect(byOrigin[LEDGER]?.name).not.toBe("Spoofed Ledger");
    expect(byOrigin[CRM].name).toBe("Spoofed Ledger");
    ws.close();
  });

  it("after hibernation, identity still comes from ctx.getTags()", async () => {
    const hub = stub("hibernate-tags");
    const ws = await openSocket(hub, { session: "crm-hib", origin: CRM });

    await runInDurableObject(hub, async (instance, state) => {
      expect(instance).toBeInstanceOf(HubDO);
      const sockets = state.getWebSockets();
      expect(sockets.length).toBeGreaterThan(0);
      const tags = state.getTags(sockets[0]);
      expect(tags[0]).toBe("crm-hib");
      expect(tags[1]).toBe(CRM);
      expect(tags[2]).toBe("spoke");
      // Isolate memory is what hibernation drops. Tags are what survive.
      instance.sessions.clear();
      expect(instance.sessions.size).toBe(0);
    });

    await evictDurableObject(hub, { webSockets: "hibernate" });

    const graphWait = waitMessage(ws, (m) => m.t === "graph");
    ws.send(
      JSON.stringify({
        t: "hello",
        origin: LEDGER,
        identity: { name: "After wake" },
        tools: [{ name: "get-open-client" }],
      })
    );
    await graphWait;
    const graph = await doGet(hub, "/do/graph");
    const byOrigin = Object.fromEntries((graph.members ?? []).map((m) => [m.origin, m]));
    expect(byOrigin[CRM]).toBeTruthy();
    expect(byOrigin[CRM].name).toBe("After wake");
    expect(byOrigin[LEDGER]?.name).not.toBe("After wake");
    ws.close();
  });
});

describe("surface ↔ spoke relay", () => {
  it("refuses spoke-to-spoke SEALED even if ?role=surface was on the URL", async () => {
    const hub = stub("relay-refuse");
    const crm = await openSocket(hub, { session: "crm1", origin: CRM });
    const ledger = await openSocket(hub, { session: "led1", origin: LEDGER });

    crm.send(JSON.stringify({ t: "hello", publicKey: "crm-key", tools: [] }));
    ledger.send(JSON.stringify({ t: "hello", publicKey: "led-key", tools: [] }));
    await waitMessage(crm, (m) => m.t === "graph");

    const refuse = waitMessage(crm, (m) => m.t === "result" && m.callId === "call_spoof");
    crm.send(
      JSON.stringify({
        t: "sealed",
        callId: "call_spoof",
        to: "led1",
        from: "crm1",
        sealed: { iv: "aa", ct: "bb" },
      })
    );
    const msg = await refuse;
    expect(msg.ok).toBe(false);
    expect(msg.code).toBe("APP_UNAVAILABLE");
    crm.close();
    ledger.close();
  });

  it("forwards surface → spoke SEALED", async () => {
    const hub = stub("relay-forward");
    const crm = await openSocket(hub, { session: "crm-fwd", origin: CRM });
    const surface = await openSocket(hub, { session: "surf-fwd", origin: SURFACE, host: CRM });

    crm.send(JSON.stringify({ t: "hello", publicKey: "crm-key", tools: [] }));
    surface.send(JSON.stringify({ t: "hello", publicKey: "surf-key", tools: [] }));
    await waitMessage(surface, (m) => m.t === "graph");

    const forwarded = waitMessage(crm, (m) => m.t === "sealed" && m.callId === "call_ok");
    surface.send(
      JSON.stringify({
        t: "sealed",
        callId: "call_ok",
        to: "crm-fwd",
        from: "surf-fwd",
        sealed: { iv: "aa", ct: "bb" },
      })
    );
    const msg = await forwarded;
    expect(msg.sealed).toEqual({ iv: "aa", ct: "bb" });
    expect(msg.from).toBe("surf-fwd");
    crm.close();
    surface.close();
  });
});
