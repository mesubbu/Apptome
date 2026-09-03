#!/usr/bin/env node
/**
 * Production deploy. Explicit list, never a recursive glob (REVIEW.md G10).
 *
 * The hostile stub is a workspace package with a valid wrangler.jsonc. A
 * `pnpm run -r deploy` would publish the attacker fixture. This script is
 * the only deploy entry, and the hostile stub is not on it.
 *
 * Topology (see docs/topology.md): every public hostname is a subdomain of
 * CONNECTOME_ZONE, so SameSite=Lax pairing cookies ride between hub, surface
 * and spokes.
 *
 *   hub.<zone>      gateway Worker + HubDO
 *   surface.<zone>  hub UI
 *   map.<zone>      mapper Worker
 *   crm.<zone>      Acme CRM stub
 *   ledger.<zone>   Ledger stub
 *   tick.<zone>     Tick stub
 *
 * Requires CLOUDFLARE_API_TOKEN (or wrangler login) and CONNECTOME_ZONE.
 * Secrets TURNSTILE_SECRET and PAIR_SECRET are `wrangler secret put`, not
 * this script — a var is plaintext.
 */

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wrangler = resolve(root, "node_modules/.bin/wrangler");

/** Product members only. Hostile stub is deliberately absent. */
const TARGETS = [
  { name: "gateway", dir: "hub/gateway", vars: true },
  { name: "mapper", dir: "hub/mapper", vars: true },
  { name: "surface", dir: "hub/surface", vars: false },
  { name: "crm", dir: "apps/stub-crm", vars: false },
  { name: "ledger", dir: "apps/stub-invoicing", vars: false },
  { name: "tick", dir: "apps/stub-notes", vars: false },
];

const zone = originHost(process.env.CONNECTOME_ZONE);
if (!zone) {
  console.error("deploy: set CONNECTOME_ZONE to the registrable domain (e.g. example.com)");
  process.exit(1);
}

const urls = {
  gateway: process.env.CONNECTOME_GATEWAY_URL || `https://hub.${zone}`,
  surface: process.env.CONNECTOME_SURFACE_URL || `https://surface.${zone}`,
  mapper: process.env.CONNECTOME_MAPPER_URL || `https://map.${zone}`,
  spokes: process.env.CONNECTOME_SPOKE_ORIGINS
    ? process.env.CONNECTOME_SPOKE_ORIGINS
    : `https://crm.${zone},https://ledger.${zone},https://tick.${zone}`,
};

const dryRun = process.argv.includes("--dry-run");
const envName = process.argv.includes("--workers-dev") ? null : "production";

console.log(
  `deploy: zone=${zone} gateway=${urls.gateway} surface=${urls.surface} mapper=${urls.mapper}` +
    (dryRun ? " (dry-run)" : "")
);

const buildEnv = {
  ...process.env,
  CONNECTOME_GATEWAY_URL: urls.gateway,
  CONNECTOME_SURFACE_URL: urls.surface,
  CONNECTOME_MAPPER_URL: urls.mapper,
  CONNECTOME_SPOKE_ORIGINS: urls.spokes,
};

const vendored = await run(process.execPath, [resolve(root, "scripts/sync-bridge.mjs")], root, buildEnv);
if (vendored !== 0) process.exit(vendored || 1);
const sync = await run(process.execPath, [resolve(root, "scripts/build-env.mjs")], root, buildEnv);
if (sync !== 0) process.exit(sync || 1);

const workerVars = [
  `SURFACE_ORIGIN:${new URL(urls.surface).origin}`,
  `ALLOWED_ORIGINS:${urls.spokes
    .split(",")
    .map((s) => new URL(s.trim()).origin)
    .join(",")}`,
  "ENVIRONMENT:production",
];

for (const target of TARGETS) {
  const args = ["deploy", "--env", envName ?? ""];
  if (dryRun) args.push("--dry-run");
  if (target.vars) {
    for (const pair of workerVars) args.push("--var", pair);
  }
  console.log(`\n→ ${target.name}`);
  const code = await run(wrangler, args, resolve(root, target.dir), buildEnv);
  if (code !== 0) {
    console.error(`deploy: ${target.name} failed`);
    process.exit(code || 1);
  }
}

console.log("\ndeploy: done. Pairing secrets (if not already set):");
console.log("  cd hub/gateway && wrangler secret put TURNSTILE_SECRET --env production");
console.log("  cd hub/gateway && wrangler secret put PAIR_SECRET --env production");

function originHost(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return trimmed.includes(".") ? trimmed : null;
}

function run(cmd, args, cwd, env) {
  return new Promise((resolvePromise) => {
    const child = spawn(cmd, args, { cwd, env, stdio: "inherit" });
    child.on("exit", (code) => resolvePromise(code ?? 1));
    child.on("error", (err) => {
      console.error(err);
      resolvePromise(1);
    });
  });
}
