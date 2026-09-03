#!/usr/bin/env node
/**
 * Gate B in a real browser. Needs `pnpm dev` already listening.
 *
 * Chrome DevTools Protocol, no Puppeteer. Cross-origin surface iframe is
 * reached via Page.createIsolatedWorld (FlashSays.md Part 6).
 *
 * Exit 0 on a green Gate B. Exit 2 if the mesh or Chrome is missing so
 * `pnpm check` can stay mesh-free.
 */
import { spawn, spawnSync } from "node:child_process";
import { createConnection } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";

const CRM = "http://localhost:8787";
const LEDGER = "http://localhost:8788";
const SURFACE = "http://localhost:8790";
const GATEWAY = "http://localhost:8791";
const MAPPER = "http://localhost:8792";

const MESH = [
  { name: "CRM", url: CRM },
  { name: "Ledger", url: LEDGER },
  { name: "Surface", url: SURFACE },
  { name: "Gateway", url: `${GATEWAY}/health` },
  { name: "Mapper", url: `${MAPPER}/health` },
];

let passed = 0;
let failed = 0;

function ok(msg) {
  passed += 1;
  console.log(`  ok  ${msg}`);
}

function fail(msg) {
  failed += 1;
  console.error(`  FAIL  ${msg}`);
}

function assert(cond, msg) {
  if (cond) ok(msg);
  else fail(msg);
}

async function meshUp() {
  for (const svc of MESH) {
    try {
      const res = await fetch(svc.url, { signal: AbortSignal.timeout(1500) });
      if (!res.ok && res.status !== 404) return false;
    } catch {
      return false;
    }
  }
  return true;
}

function chromeBin() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const names = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"];
  for (const name of names) {
    const r = spawnSync("sh", ["-c", `command -v ${name}`], { encoding: "utf8" });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  }
  return null;
}

async function portFree(port) {
  return new Promise((resolve) => {
    const sock = createConnection({ port, host: "127.0.0.1" }, () => {
      sock.end();
      resolve(false);
    });
    sock.on("error", () => resolve(true));
  });
}

async function pickDebugPort() {
  for (let port = 9222; port < 9322; port += 1) {
    if (await portFree(port)) return port;
  }
  throw new Error("no free debugging port");
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 20_000);
    });
  }
}

async function connectCdp(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", () => reject(new Error("cdp websocket failed")), { once: true });
  });
  return new Cdp(ws);
}

async function waitFor(cdp, expression, { timeoutMs = 15_000, frameId } = {}) {
  const deadline = Date.now() + timeoutMs;
  let contextId;
  if (frameId) {
    const world = await cdp.send("Page.createIsolatedWorld", {
      frameId,
      worldName: "connectome-e2e",
    });
    contextId = world.executionContextId;
  }
  while (Date.now() < deadline) {
    const res = await cdp.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      ...(contextId ? { contextId } : {}),
    });
    const value = res.result?.value;
    if (value) return value;
    await sleep(200);
  }
  throw new Error(`timeout waiting for: ${expression}`);
}

async function evalIn(cdp, expression, frameId) {
  let contextId;
  if (frameId) {
    const world = await cdp.send("Page.createIsolatedWorld", {
      frameId,
      worldName: `connectome-e2e-${Date.now()}`,
    });
    contextId = world.executionContextId;
  }
  const res = await cdp.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
    ...(contextId ? { contextId } : {}),
  });
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.text || "evaluate threw");
  }
  return res.result?.value;
}

function findFrame(tree, predicate) {
  const stack = [tree];
  while (stack.length) {
    const node = stack.pop();
    if (predicate(node.frame)) return node.frame;
    for (const child of node.childFrames ?? []) stack.push(child);
  }
  return null;
}

async function run() {
  if (typeof WebSocket === "undefined") {
    console.error("e2e: global WebSocket is missing (Node 22+).");
    process.exit(2);
  }
  if (!(await meshUp())) {
    console.error("e2e: mesh is not listening. Start it with `pnpm dev` in connectome/, then retry.");
    process.exit(2);
  }
  ok("mesh is up");

  const bin = chromeBin();
  if (!bin) {
    console.error("e2e: no Chrome/Chromium on PATH. Set CHROME_PATH.");
    process.exit(2);
  }
  ok(`chrome is ${bin}`);

  const port = await pickDebugPort();
  const chrome = spawn(
    bin,
    [
      `--remote-debugging-port=${port}`,
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--user-data-dir=/tmp/connectome-e2e-profile",
    ],
    { stdio: "ignore" }
  );

  try {
    const deadline = Date.now() + 15_000;
    let version;
    while (Date.now() < deadline) {
      try {
        version = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json());
        break;
      } catch {
        await sleep(200);
      }
    }
    if (!version?.webSocketDebuggerUrl) throw new Error("chrome did not open a debugger");

    const browser = await connectCdp(version.webSocketDebuggerUrl);

    const ledgerTarget = await browser.send("Target.createTarget", { url: LEDGER });
    await sleep(800);
    const crmTarget = await browser.send("Target.createTarget", { url: CRM });

    const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
    const crmPage = pages.find((p) => p.id === crmTarget.targetId) || pages.find((p) => p.url?.startsWith(CRM));
    if (!crmPage?.webSocketDebuggerUrl) throw new Error("no CRM page session");
    const crm = await connectCdp(crmPage.webSocketDebuggerUrl);
    await crm.send("Page.enable");
    await crm.send("Runtime.enable");

    await waitFor(crm, `Boolean(document.getElementById("connectome-badge"))`);
    ok("CRM mounted the Connectome badge");

    await evalIn(crm, `document.getElementById("connectome-badge").click()`);
    const frame = await waitFor(
      crm,
      `(function(){ return document.getElementById("connectome-surface-frame") ? true : false })()`
    );
    assert(frame, "surface iframe mounted in the CRM window");

    let surfaceFrame = null;
    const treeDeadline = Date.now() + 10_000;
    while (Date.now() < treeDeadline) {
      const tree = await crm.send("Page.getFrameTree");
      surfaceFrame = findFrame(tree.frameTree, (f) => (f.url || "").startsWith(SURFACE));
      if (surfaceFrame) break;
      await sleep(200);
    }
    assert(Boolean(surfaceFrame), "surface frame is hub-origin");
    if (!surfaceFrame) throw new Error("no surface frame");

    await waitFor(
      crm,
      `document.body && document.body.innerText.includes("Ledger")`,
      { frameId: surfaceFrame.id }
    );
    ok("surface directory names Ledger");

    await evalIn(
      crm,
      `(function(){
        const card = [...document.querySelectorAll(".member-card")].find((el) => (el.dataset.origin || "").includes("8788"));
        if (!card) throw new Error("no Ledger card");
        const chip = [...card.querySelectorAll(".member-chip")].find((el) => /create-invoice/i.test(el.textContent || ""));
        if (chip) chip.click();
        else card.click();
        return true;
      })()`,
      surfaceFrame.id
    );

    await waitFor(
      crm,
      `document.body.innerText.includes("get-open-client") || document.body.innerText.includes("Check") || document.body.innerText.includes("approve")`,
      { frameId: surfaceFrame.id }
    );
    ok("write flow reached source-pick or confirm");

    await evalIn(
      crm,
      `(function(){
        const src = [...document.querySelectorAll("button, .cap")].find((el) => /get-open-client/i.test(el.textContent || ""));
        if (src) src.click();
        return true;
      })()`,
      surfaceFrame.id
    );

    await waitFor(
      crm,
      `Boolean(document.getElementById("approve")) || /Approve/.test(document.body.innerText)`,
      { frameId: surfaceFrame.id }
    );
    ok("confirm card is showing");

    await evalIn(
      crm,
      `(function(){
        const btn = document.getElementById("approve") || [...document.querySelectorAll("button")].find((el) => /Approve/.test(el.textContent || ""));
        if (!btn) throw new Error("no approve button");
        if (btn.disabled) throw new Error("approve disabled");
        btn.click();
        return true;
      })()`,
      surfaceFrame.id
    );

    const resultText = await waitFor(
      crm,
      `(function(){
        const t = document.body.innerText || "";
        if (/INV-/.test(t) || /Done\\./.test(t) || /draft/i.test(t)) return t;
        return null;
      })()`,
      { frameId: surfaceFrame.id, timeoutMs: 20_000 }
    );
    assert(/INV-|Done\.|draft/i.test(String(resultText)), "result view reports the write, still in CRM");

    void ledgerTarget;
    await browser.send("Browser.close").catch(() => {});
  } catch (err) {
    fail(String(err?.message ?? err));
  } finally {
    try {
      chrome.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

try {
  await run();
} catch (err) {
  console.error(err);
  process.exit(1);
}
