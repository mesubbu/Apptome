#!/usr/bin/env node
/**
 * T1 join-door and relay checks. Not the T8 distortion suite.
 * Needs the mesh up (`pnpm dev`).
 */

import http from "node:http";
import crypto from "node:crypto";
import { latestPeerId } from "../packages/protocol/protocol.js";

const GATEWAY = "http://localhost:8791";
const MAPPER = "http://localhost:8792";
let failed = 0;

function assert(cond, msg) {
  if (cond) console.log(`  ok  ${msg}`);
  else {
    failed += 1;
    console.error(`  FAIL  ${msg}`);
  }
}

function latestPeerIdUnit() {
  const keys = {
    a: { origin: "http://localhost:8787", helloAt: 1 },
    b: { origin: "http://localhost:8788", helloAt: 9 },
    c: { origin: "http://localhost:8788", helloAt: 4 },
    me: { origin: "http://localhost:8790", helloAt: 99 },
  };
  assert(latestPeerId(keys, "http://localhost:8788", "me") === "b", "latestPeerId picks most recent HELLO of origin");
  assert(latestPeerId(keys, "http://localhost:8789") === null, "latestPeerId is null when origin is absent");
}

async function httpStatus(url, { method = "GET", headers = {}, body } = {}) {
  const res = await fetch(url, { method, headers, body });
  const text = await res.text();
  return { status: res.status, text, acao: res.headers.get("access-control-allow-origin") };
}

async function joinDoorHttp() {
  const pause = `${GATEWAY}/api/pause`;
  const grants = `${GATEWAY}/api/grants`;

  let r = await httpStatus(pause, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://evil.example" },
    body: JSON.stringify({ paused: true }),
  });
  assert(r.status === 403, `unlisted Origin POST /api/pause → 403 (got ${r.status})`);

  r = await httpStatus(pause, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ paused: true }),
  });
  assert(r.status === 403, `no-Origin POST /api/pause → 403 (got ${r.status})`);

  r = await httpStatus(pause, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:8790" },
    body: JSON.stringify({ paused: false }),
  });
  assert(r.status === 200, `surface Origin POST /api/pause → 200 (got ${r.status})`);
  assert(r.acao === "http://localhost:8790", `POST /api/pause echoes surface Origin, not * (got ${r.acao})`);

  r = await httpStatus(pause, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:8787" },
    body: JSON.stringify({ paused: true }),
  });
  assert(r.status === 403, `spoke Origin POST /api/pause → 403 (got ${r.status})`);

  r = await httpStatus(grants, { headers: { origin: "http://evil.example" } });
  assert(r.status === 403, `unlisted Origin GET /api/grants → 403 (got ${r.status})`);

  r = await httpStatus(grants);
  assert(r.status === 200, `no-Origin GET /api/grants allowed (got ${r.status})`);
}

async function mapperValues() {
  const r = await httpStatus(`${MAPPER}/map`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source: { fields: [{ path: "name", type: "string", value: "x" }] } }),
  });
  assert(r.status === 400, `mapper /map with value key → 400 (got ${r.status})`);
  assert(!r.text.includes('"mapping"'), "mapper does not return a mapping on leak");
}

function wsHandshake(path, { origin, extraHeaders = {} } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, GATEWAY);
    const key = crypto.randomBytes(16).toString("base64");
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: "GET",
        headers: {
          Connection: "Upgrade",
          Upgrade: "websocket",
          "Sec-WebSocket-Version": "13",
          "Sec-WebSocket-Key": key,
          ...(origin ? { Origin: origin } : {}),
          ...extraHeaders,
        },
      },
      (res) => {
        res.resume();
        resolve({ status: res.statusCode, socket: null });
      }
    );
    req.on("upgrade", (res, socket) => {
      resolve({ status: res.statusCode, socket });
    });
    req.on("error", reject);
    req.end();
  });
}

function wsSend(socket, obj) {
  const payload = Buffer.from(JSON.stringify(obj));
  const mask = crypto.randomBytes(4);
  const masked = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ mask[i % 4];
  let header;
  if (payload.length < 126) {
    header = Buffer.alloc(6);
    header[0] = 0x81;
    header[1] = 0x80 | payload.length;
    mask.copy(header, 2);
  } else {
    header = Buffer.alloc(8);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(payload.length, 2);
    mask.copy(header, 4);
  }
  socket.write(Buffer.concat([header, masked]));
}

function attachReader(socket) {
  const queue = [];
  const waiters = [];
  let buf = Buffer.alloc(0);

  const notify = () => {
    for (let w = waiters.length - 1; w >= 0; w--) {
      const { pred, resolve, timer } = waiters[w];
      const i = queue.findIndex(pred);
      if (i < 0) continue;
      clearTimeout(timer);
      waiters.splice(w, 1);
      resolve(queue.splice(i, 1)[0]);
    }
  };

  socket.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const len = buf[1] & 127;
      let offset = 2;
      let size = len;
      if (len === 126) {
        if (buf.length < 4) break;
        size = buf.readUInt16BE(2);
        offset = 4;
      } else if (len === 127) {
        break;
      }
      if (buf.length < offset + size) break;
      const payload = buf.subarray(offset, offset + size);
      buf = buf.subarray(offset + size);
      try {
        queue.push(JSON.parse(payload.toString("utf8")));
      } catch {
        /* ignore non-JSON frames */
      }
    }
    notify();
  });

  socket.wait = (pred, timeoutMs = 4000) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("ws wait timeout")), timeoutMs);
      waiters.push({ pred, resolve, timer });
      notify();
    });
}

async function joinDoorWs() {
  const evil = await wsHandshake("/hub?session=evil1", { origin: "http://evil.example" });
  assert(evil.status === 403, `unlisted Origin /hub → 403 (got ${evil.status})`);
  evil.socket?.destroy();

  const none = await wsHandshake("/hub?session=none1");
  assert(none.status === 403, `no-Origin /hub → 403 (got ${none.status})`);
  none.socket?.destroy();
}

async function identityAndRelay() {
  const crm = await wsHandshake("/hub?session=crm1&origin=http://localhost:8788&role=surface", {
    origin: "http://localhost:8787",
  });
  assert(crm.status === 101, `CRM Origin /hub upgrades (got ${crm.status})`);
  attachReader(crm.socket);

  const ledger = await wsHandshake("/hub?session=led1", { origin: "http://localhost:8788" });
  assert(ledger.status === 101, `Ledger Origin /hub upgrades (got ${ledger.status})`);
  attachReader(ledger.socket);

  const surface = await wsHandshake("/hub?session=surf1&host=http://localhost:8787", {
    origin: "http://localhost:8790",
  });
  assert(surface.status === 101, `surface Origin /hub upgrades (got ${surface.status})`);
  attachReader(surface.socket);

  wsSend(crm.socket, {
    t: "hello",
    sessionId: "crm1",
    origin: "http://localhost:8788",
    identity: { name: "Spoofed Ledger" },
    publicKey: "not-a-real-key",
    tools: [{ name: "create-invoice", description: "x", inputSchema: { type: "object" } }],
  });
  await crm.socket.wait((m) => m.t === "graph");

  const graph = await httpStatus(`${GATEWAY}/api/graph`, { headers: { origin: "http://localhost:8790" } });
  assert(graph.status === 200, `GET /api/graph as surface → 200`);
  const body = JSON.parse(graph.text);
  const byOrigin = Object.fromEntries((body.members ?? []).map((m) => [m.origin, m]));
  assert(Boolean(byOrigin["http://localhost:8787"]), "HELLO from CRM Origin registers as 8787, not query origin 8788");
  assert(
    byOrigin["http://localhost:8788"]?.name !== "Spoofed Ledger",
    "Ledger origin is not the spoofed CRM HELLO"
  );
  assert(
    byOrigin["http://localhost:8787"]?.name === "Spoofed Ledger",
    "name is a poster; spoofed label can appear next to the real origin"
  );

  // Spoke-to-spoke SEALED must be refused (role is Origin-bound, query role=surface ignored).
  wsSend(crm.socket, {
    t: "sealed",
    callId: "call_spoof",
    to: "led1",
    from: "crm1",
    sealed: { iv: "aa", ct: "bb" },
  });
  const refuse = await crm.socket.wait((m) => m.t === "result" && m.callId === "call_spoof");
  assert(
    refuse.ok === false && refuse.code === "APP_UNAVAILABLE",
    `spoke-to-spoke SEALED refused (got ${JSON.stringify(refuse)})`
  );

  // close-surface from surface with host=CRM should reach the CRM socket.
  wsSend(surface.socket, { t: "hello", sessionId: "surf1", host: "http://localhost:8787", tools: [] });
  await new Promise((r) => setTimeout(r, 200));
  wsSend(surface.socket, { t: "close-surface" });
  const close = await crm.socket.wait((m) => m.t === "close-surface");
  assert(close.t === "close-surface", `close-surface reaches host spoke (got ${JSON.stringify(close)})`);

  crm.socket.destroy();
  ledger.socket.destroy();
  surface.socket.destroy();
}

console.log("T1 checks");
latestPeerIdUnit();
await joinDoorHttp();
await mapperValues();
await joinDoorWs();
await identityAndRelay();

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nT1 checks passed");
