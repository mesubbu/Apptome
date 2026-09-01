#!/usr/bin/env node
/**
 * Point the static assets at a mesh.
 *
 * The Workers read their origins from `env` at runtime (hub/gateway/src/origins.js,
 * hub/mapper/src/index.js). The surface config and the spokes' boot tags cannot:
 * they are static files served to a browser, and the boot tag's `src` is a
 * cross-origin absolute URL that nothing on the page can derive. So they are
 * substituted here, at build time, from the same resolved values.
 *
 * Generate-on-dev: this is the second step of `pnpm sync`, and so the second step
 * of `pnpm dev`. Run it again after changing any CONNECTOME_* var.
 *
 * IDEMPOTENT, AND THAT IS THE POINT. With no vars set it writes exactly the
 * localhost values already committed, so a local `pnpm dev` leaves `git status`
 * clean. A production build is the same script with the vars set.
 *
 * In production the gateway's `<script>` tag is injected at the edge and the
 * stub HTML in this repo is not what ships. This step is what lets the same
 * three demo apps stand in for that, against a real zone, without hand-editing.
 */

import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The local mesh. Must agree with the code-level defaults in origins.js. */
const DEFAULTS = {
  gateway: "http://localhost:8791",
  surface: "http://localhost:8790",
  mapper: "http://localhost:8792",
  spokes: ["http://localhost:8787", "http://localhost:8788", "http://localhost:8789"],
};

/**
 * Build-time vars are `CONNECTOME_*` on the Node process; the Workers' runtime
 * vars are `SURFACE_ORIGIN` / `ALLOWED_ORIGINS`. Two namespaces, one source of
 * truth — `scripts/dev.mjs` derives the runtime vars from this function so the
 * static assets and the join door cannot drift apart.
 */
export function resolveEnv(source = process.env) {
  return {
    gateway: origin(source.CONNECTOME_GATEWAY_URL) ?? DEFAULTS.gateway,
    surface: origin(source.CONNECTOME_SURFACE_URL) ?? DEFAULTS.surface,
    mapper: origin(source.CONNECTOME_MAPPER_URL) ?? DEFAULTS.mapper,
    spokes: list(source.CONNECTOME_SPOKE_ORIGINS) ?? DEFAULTS.spokes,
  };
}

function origin(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = new URL(value.trim()).origin;
    return parsed === "null" ? null : parsed;
  } catch {
    return null;
  }
}

function list(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const entries = value.split(",").map(origin).filter(Boolean);
  return entries.length ? [...new Set(entries)] : null;
}

/**
 * Every edit is (pattern -> replacement) with `expect` occurrences required.
 * A pattern that matches the wrong number of times is a FAILURE, never a
 * silent skip: the boot tag under `apps/stub-crm/public/opt-out/` is exactly
 * the file a glob forgets, and a substitution that quietly does nothing is
 * indistinguishable from one that worked until the demo is live.
 */
function editsFor(cfg, bootTagFiles) {
  return [
    {
      file: "hub/surface/public/config.js",
      subs: [
        { find: /^export const GATEWAY_URL = ".*";$/m, to: `export const GATEWAY_URL = "${cfg.gateway}";`, expect: 1 },
        { find: /^export const MAPPER_URL = ".*";$/m, to: `export const MAPPER_URL = "${cfg.mapper}";`, expect: 1 },
      ],
    },
    ...bootTagFiles.map((file) => ({
      file,
      subs: [
        { find: /src="[^"]*\/\.webmcp\/boot\.js"/g, to: `src="${cfg.gateway}/.webmcp/boot.js"`, expect: 1 },
        { find: /data-connectome-hub="[^"]*"/g, to: `data-connectome-hub="${cfg.gateway}"`, expect: 1 },
        { find: /data-connectome-surface="[^"]*"/g, to: `data-connectome-surface="${cfg.surface}"`, expect: 1 },
      ],
    })),
  ];
}

/**
 * Discovered, not listed. The set of pages carrying a boot tag changes as the
 * stubs grow, and a hand-maintained list is the bug this guards against.
 * `apps/hostile-stub` has no boot tag by design and so is never touched.
 */
async function findBootTagFiles() {
  return (await htmlUnder(join(root, "apps")))
    .filter((file) => /data-connectome-hub=/.test(file.body))
    .map((file) => file.path)
    .sort();
}

async function htmlUnder(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".wrangler") continue;
      out.push(...(await htmlUnder(full)));
    } else if (entry.name.endsWith(".html")) {
      out.push({ path: relative(root, full), body: await readFile(full, "utf8") });
    }
  }
  return out;
}

async function main() {
  const cfg = resolveEnv();
  const bootTagFiles = await findBootTagFiles();
  let failed = 0;
  let changed = 0;

  if (bootTagFiles.length === 0) {
    console.error("build-env: found no boot tags under apps/ — the substitution would be a no-op");
    process.exit(1);
  }

  for (const { file, subs } of editsFor(cfg, bootTagFiles)) {
    const path = resolve(root, file);
    let body;
    try {
      body = await readFile(path, "utf8");
    } catch (err) {
      failed += 1;
      console.error(`FAILED  ${file}: ${err?.message ?? err}`);
      continue;
    }

    const before = body;
    let broken = false;
    for (const { find, to, expect } of subs) {
      const hits = body.match(find)?.length ?? 0;
      if (hits !== expect) {
        failed += 1;
        broken = true;
        console.error(`FAILED  ${file}: expected ${expect} match of ${find}, found ${hits}`);
        continue;
      }
      body = body.replace(find, to);
    }
    if (broken) continue;

    if (body === before) {
      console.log(`same    ${file}`);
      continue;
    }
    await writeFile(path, body);
    changed += 1;
    console.log(`wrote   ${file}`);
  }

  if (failed > 0) {
    console.error(`build-env: ${failed} substitution(s) failed`);
    process.exit(1);
  }

  console.log(
    `build-env: gateway=${cfg.gateway} surface=${cfg.surface} mapper=${cfg.mapper} ` +
      `(${changed} rewritten, ${bootTagFiles.length + 1} checked)`
  );
}

// Side effects only when run directly. `scripts/dev.mjs` imports resolveEnv() to
// derive the Workers' vars from the same values, and importing must not rewrite
// files — let alone process.exit() out of the middle of someone else's startup.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
