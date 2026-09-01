#!/usr/bin/env node
/**
 * Boot the local mesh: sync vendored copies, then the six wrangler procs.
 *
 * Ctrl-C tears them all down.
 */

import { spawn } from "node:child_process";
import net from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wrangler = resolve(root, "node_modules/.bin/wrangler");

const SERVICES = [
  { name: "CRM", dir: "apps/stub-crm", port: 8787 },
  { name: "Ledger", dir: "apps/stub-invoicing", port: 8788 },
  { name: "Tick", dir: "apps/stub-notes", port: 8789 },
  { name: "Surface", dir: "hub/surface", port: 8790 },
  { name: "Gateway", dir: "hub/gateway", port: 8791 },
  { name: "Mapper", dir: "hub/mapper", port: 8792 },
];

const children = [];
let shuttingDown = false;

await sync();
await assertPortsFree();
await startAll();
await waitUntilListening();
printBanner();
await hangUntilSignal();

async function sync() {
  const code = await run(process.execPath, [resolve(root, "scripts/sync-bridge.mjs")], root);
  if (code !== 0) {
    console.error("pnpm sync failed; not starting the mesh.");
    process.exit(code || 1);
  }
}

async function assertPortsFree() {
  const taken = [];
  for (const svc of SERVICES) {
    if (await isPortOpen(svc.port)) taken.push(`${svc.name} (:${svc.port})`);
  }
  if (taken.length) {
    console.error(`port already in use: ${taken.join(", ")}`);
    process.exit(1);
  }
}

async function startAll() {
  for (const svc of SERVICES) {
    // wrangler's inspector defaults to 9229. Six procs cannot share it.
    const child = spawn(
      wrangler,
      ["dev", "--port", String(svc.port), "--inspector-port", String(svc.port + 1000)],
      {
        cwd: resolve(root, svc.dir),
        stdio: "inherit",
        detached: process.platform !== "win32",
        env: process.env,
      }
    );
    children.push({ svc, child });
    child.on("exit", (code, signal) => {
      if (shuttingDown) return;
      // One service dying must not take the mesh with it. Gate E local-first
      // kills the gateway on purpose; the stubs and surface have to stay up.
      console.error(`${svc.name} exited (${signal ?? code}) — other services stay up`);
    });
  }
}

async function waitUntilListening() {
  const timeoutMs = 60_000;
  for (const svc of SERVICES) {
    const ok = await waitForPort(svc.port, timeoutMs);
    if (!ok) {
      console.error(`${svc.name} did not listen on :${svc.port} within ${timeoutMs / 1000}s`);
      shutdown(1);
      return;
    }
  }
}

function printBanner() {
  const rows = SERVICES.map((s) => `  ${s.name.padEnd(8)}  http://localhost:${s.port}`).join("\n");
  console.log(`
Connectome local mesh

${rows}

Gate B: open CRM, open Ledger, click the Connectome badge.
`);
}

function hangUntilSignal() {
  return new Promise(() => {
    process.on("SIGINT", () => shutdown(0));
    process.on("SIGTERM", () => shutdown(0));
  });
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { child } of children) {
    try {
      if (process.platform === "win32") child.kill();
      else process.kill(-child.pid, "SIGTERM");
    } catch {
      try {
        child.kill("SIGTERM");
      } catch {
        /* already gone */
      }
    }
  }
  const killer = setTimeout(() => {
    for (const { child } of children) {
      try {
        if (process.platform === "win32") child.kill();
        else process.kill(-child.pid, "SIGKILL");
      } catch {
        /* already gone */
      }
    }
    process.exit(code);
  }, 2000);
  killer.unref();
  // If the children die promptly, still exit.
  setTimeout(() => process.exit(code), 2100).unref();
}

function run(cmd, args, cwd) {
  return new Promise((resolvePromise) => {
    const child = spawn(cmd, args, { cwd, stdio: "inherit", env: process.env });
    child.on("exit", (code) => resolvePromise(code ?? 1));
  });
}

function isPortOpen(port) {
  return new Promise((resolvePromise) => {
    const sock = net.connect({ port, host: "127.0.0.1" }, () => {
      sock.end();
      resolvePromise(true);
    });
    sock.on("error", () => resolvePromise(false));
  });
}

async function waitForPort(port, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortOpen(port)) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}
