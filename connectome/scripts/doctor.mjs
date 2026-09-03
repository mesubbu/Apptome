#!/usr/bin/env node
/**
 * Mesh health. Operator command, not a join ticket.
 *
 * Closed set (OtherFeaturesGrok.md §5.3). Fail closed on static checks.
 * Live probes warn if the mesh is down, and fail if it is only half up.
 *
 *   pnpm doctor                 static + live (if listening) + distortion tests
 *   pnpm doctor --offline       static only
 *   pnpm doctor --skip-distortion
 */

import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { COPIES } from "./sync-bridge.mjs";
import { resolveEnv } from "./build-env.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const offline = args.has("--offline");
const skipDistortion = args.has("--skip-distortion");

let failed = 0;
let warned = 0;

function ok(msg) {
  console.log(`  ok  ${msg}`);
}

function fail(msg) {
  failed += 1;
  console.error(`  FAIL  ${msg}`);
}

function warn(msg) {
  warned += 1;
  console.error(`  WARN  ${msg}`);
}

function assert(cond, msg) {
  if (cond) ok(msg);
  else fail(msg);
}

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function sha(rel) {
  return createHash("sha256").update(readFileSync(join(root, rel))).digest("hex");
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * The pairing keys live in the Worker's settings, so this asks the gateway what
 * it is actually serving. `configured:false` with a diagnosis is the gateway
 * having caught a swap; a secret-shaped siteKey is an OLDER gateway that has
 * not caught it and is publishing the secret half to every visitor.
 */
async function checkPairingKeys(gateway) {
  let body;
  try {
    const res = await fetch(new URL("/api/pair", gateway), { signal: AbortSignal.timeout(2500) });
    body = await res.json();
  } catch {
    warn("could not read GET /api/pair — pairing keys not checked");
    return;
  }

  if (body?.code === "PAIRING_MISCONFIGURED" || body?.configured === false) {
    fail(`gateway cannot pair: ${body?.error ?? "pairing is not configured"}`);
    return;
  }
  if (typeof body?.siteKey === "string" && body.siteKey.trim().length >= 30) {
    fail(
      `GET /api/pair is serving a ${body.siteKey.trim().length}-character site key, which is the ` +
        `shape of a Turnstile SECRET. Rotate that secret and swap the two values in the ` +
        `gateway Worker's settings.`
    );
    return;
  }
  if (body?.required && !body?.siteKey) {
    fail("gateway requires pairing but serves no site key");
    return;
  }
  ok("gateway serves a site-key-shaped TURNSTILE_SITE_KEY");
}

console.log("Connectome doctor\n");

console.log("vendored copies");
for (const [from, to] of COPIES) {
  if (!existsSync(join(root, to))) {
    fail(`${to} missing — run pnpm sync`);
    continue;
  }
  assert(sha(from) === sha(to), `${to} matches ${from}`);
}

console.log("\ndeploy list");
{
  const deploy = stripComments(read("scripts/deploy.mjs"));
  const hostilePkg = read("apps/hostile-stub/package.json");
  assert(/name:\s*"gateway"/.test(deploy), "deploy includes the gateway");
  assert(/name:\s*"mapper"/.test(deploy), "deploy includes the mapper");
  assert(/name:\s*"surface"/.test(deploy), "deploy includes the surface");
  assert(/stub-crm/.test(deploy) && /stub-invoicing/.test(deploy) && /stub-notes/.test(deploy), "deploy includes the three demo spokes");
  assert(!/hostile-stub/.test(deploy), "hostile stub is not a deploy target");
  assert(!/"deploy"\s*:/.test(hostilePkg), "hostile stub has no deploy script");
}

console.log("\nproduction door");
{
  const gw = read("hub/gateway/wrangler.jsonc");
  const gwCode = stripComments(gw);
  const pairing = read("hub/gateway/src/pairing.js");
  assert(/"ENVIRONMENT":\s*"production"/.test(gw), "gateway wrangler names ENVIRONMENT=production");
  const prodBlock = gw.match(/"production"\s*:\s*\{[\s\S]*?\n    \}/)?.[0] ?? "";
  assert(/"ENVIRONMENT":\s*"production"/.test(prodBlock), "env.production is production, not local");
  assert(!/"ENVIRONMENT":\s*"local"/.test(prodBlock), "env.production does not enable the local fallback");
  assert(!/"PAIR_SECRET"\s*:/.test(gwCode) && !/"TURNSTILE_SECRET"\s*:/.test(gwCode), "pairing secrets are not wrangler vars");
  assert(/env\?\.ENVIRONMENT === "local"/.test(pairing), "unauthenticated fallback is gated on ENVIRONMENT=local");
  assert(/scripts\/dev\.mjs/.test(pairing) || /pnpm dev/.test(pairing), "pairing.js says who may set ENVIRONMENT=local");
}

console.log("\njoin door vs build-env");
{
  const origins = await import(new URL("../hub/gateway/src/origins.js", import.meta.url).href);
  const mesh = resolveEnv();
  const defaults = origins.DEFAULT_SPOKE_ORIGINS;
  assert(Array.isArray(defaults) && defaults.length === 3, "origins.js has three default spokes");
  if (!process.env.CONNECTOME_SPOKE_ORIGINS && !process.env.CONNECTOME_GATEWAY_URL) {
    assert(
      mesh.spokes.join(",") === defaults.join(","),
      "build-env default spokes match origins.js defaults"
    );
    assert(mesh.surface === origins.DEFAULT_SURFACE_ORIGIN, "build-env default surface matches origins.js");
  } else {
    ok("CONNECTOME_* vars are set; not asserting localhost defaults");
    assert(mesh.spokes.every((s) => /^https?:\/\//.test(s)), "CONNECTOME_SPOKE_ORIGINS are origins");
  }
  assert(!defaults.includes("http://localhost:8793"), "hostile stub is not a default spoke");
}

console.log("\npolyfill path");
{
  const polyfill = read("packages/bridge/webmcp-polyfill.js");
  const bridge = read("packages/bridge/bridge.js");
  assert(/export const POLYFILL_MARK/.test(polyfill), "polyfill is marked so native wins when present");
  assert(/installPolyfill/.test(bridge), "bridge installs the same-API polyfill when native is absent");
  ok("stubs use native document.modelContext when present, else the polyfill; Chrome flag is not required");
}

console.log("\nrisk is copy");
{
  const protocol = await import(new URL("../packages/protocol/protocol.js", import.meta.url).href);
  const surface = read("hub/surface/public/surface.js");
  assert(protocol.confirmKind({ readOnly: false, risk: "low" }) === protocol.CONFIRM_KIND.WRITE, "draft writes still confirm");
  assert(protocol.confirmKind({ readOnly: false, risk: "financial" }) === protocol.CONFIRM_KIND.WRITE, "financial writes still confirm");
  assert(!/none/.test(Function.prototype.toString.call(protocol.confirmKind)), "confirmKind has no skip");
  assert(/confirmKind\(cap\)/.test(surface), "surface consults confirmKind");
  const doWrite = surface.slice(surface.indexOf("async function doWrite"));
  const doWriteBody = doWrite.slice(0, doWrite.indexOf("\nfunction ") > 0 ? doWrite.indexOf("\nfunction ") : doWrite.length);
  assert(!/\briskOf\b/.test(doWriteBody), "doWrite does not consult risk");
}

if (!offline) {
  console.log("\nlive mesh");
  const mesh = resolveEnv();
  const probes = [
    { name: "gateway", url: `${mesh.gateway}/health`, want: "connectome-gateway" },
    { name: "mapper", url: `${mesh.mapper}/health`, want: "connectome-mapper" },
    { name: "surface", url: mesh.surface, want: null },
  ];
  const results = [];
  for (const p of probes) {
    try {
      const res = await fetch(p.url, { signal: AbortSignal.timeout(1500) });
      const text = await res.text();
      const okHttp = res.ok || res.status === 404;
      const service = (() => {
        try {
          return JSON.parse(text).service;
        } catch {
          return null;
        }
      })();
      results.push({ ...p, up: okHttp, service });
    } catch {
      results.push({ ...p, up: false, service: null });
    }
  }
  const up = results.filter((r) => r.up);
  const down = results.filter((r) => !r.up);
  if (up.length === 0) {
    warn("mesh is not running — start with pnpm dev. Live checks skipped.");
  } else if (down.length) {
    for (const r of down) fail(`${r.name} is down (${r.url})`);
    for (const r of up) ok(`${r.name} is up`);
  } else {
    for (const r of results) {
      if (r.want) assert(r.service === r.want, `${r.name} /health is ${r.want}`);
      else ok(`${r.name} is reachable`);
    }
  }

  // The keys are set in the dashboard, not in this repo, so a static check
  // cannot see them — and a swap deploys clean, answers ok:true, and fails only
  // as an opaque `400020` in a browser console. Ask the live gateway instead.
  if (results.find((r) => r.name === "gateway")?.up) {
    await checkPairingKeys(mesh.gateway);
  }
} else {
  ok("live probes skipped (--offline)");
}

if (!skipDistortion) {
  console.log("\ndistortion tests");
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [join(root, "ci/distortion-tests.mjs")], {
      cwd: root,
      stdio: "inherit",
    });
    child.on("close", (c) => resolve(c ?? 1));
  });
  assert(code === 0, "ci/distortion-tests.mjs exited 0");
} else {
  ok("distortion tests skipped (--skip-distortion)");
}

console.log(`\n${failed ? "unhealthy" : "healthy"}  ${failed} failed, ${warned} warned`);
process.exit(failed ? 1 : 0);
