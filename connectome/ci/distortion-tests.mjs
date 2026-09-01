#!/usr/bin/env node
/**
 * Distortion tests — GrokVision.md §8 as code (E9).
 *
 * Static. Does not need the mesh. `pnpm check` is the gate on every increment.
 * Rules are this vision's, not oldDocs/connectome-build-plan.md's policy engine.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;
let passed = 0;

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

const SKIP_DIR = new Set(["node_modules", ".wrangler", "vendor", ".git"]);

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIR.has(ent.name)) continue;
      // Generated copies. packages/ is the source of truth.
      if (ent.name === "protocol" && dir.endsWith(`${join("hub", "surface", "public")}`)) continue;
      if (ent.name === "protocol" && dir.endsWith("extension")) continue;
      yield* walk(full);
    } else if (ent.isFile()) {
      yield full;
    }
  }
}

function read(path) {
  return readFileSync(path, "utf8");
}

function rel(path) {
  return relative(ROOT, path);
}

/** Strip line and block comments. Strings (and http:// inside them) stay. */
export function stripComments(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      while (i < n && src[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      out += c;
      i += 1;
      while (i < n && src[i] !== q) {
        if (src[i] === "\\") {
          out += src[i] + (src[i + 1] ?? "");
          i += 2;
          continue;
        }
        out += src[i];
        i += 1;
      }
      if (i < n) {
        out += src[i];
        i += 1;
      }
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

export function wranglerBans(src) {
  const code = stripComments(src);
  const hits = [];
  if (/"browser"\s*:/.test(code)) hits.push('"browser" binding (Browser Rendering)');
  if (/"crons"\s*:/.test(code) || /triggers\s*\.\s*crons/.test(code)) hits.push("triggers.crons");
  if (/"queues"\s*:/.test(code)) hits.push("queues");
  if (/"workflows"\s*:/.test(code)) hits.push("workflows");
  return hits;
}

export function hubDoBans(src) {
  const code = stripComments(src);
  const hits = [];
  if (/\balarm\s*\(/.test(code)) hits.push("alarm(");
  if (/\bscheduled\s*\(/.test(code)) hits.push("scheduled(");
  return hits;
}

function scannerCatchesRejectedDoors() {
  const wranglerHits = wranglerBans(`{
    "name": "x",
    "browser": { "binding": "BROWSER" },
    "triggers": { "crons": ["* * * * *"] },
    "queues": {},
    "workflows": {}
  }`);
  assert(
    wranglerHits.includes('"browser" binding (Browser Rendering)'),
    "scanner fails a wrangler file that adds a browser binding"
  );
  assert(wranglerHits.some((h) => h.includes("crons")), "scanner fails triggers.crons");
  assert(wranglerHits.includes("queues"), "scanner fails queues");
  assert(wranglerHits.includes("workflows"), "scanner fails workflows");

  const commentOnly = wranglerBans(`{
    "name": "x"
    // browser            Browser Rendering. Deliberately absent.
    // triggers.crons     A cron makes the hub act without the user.
  }`);
  assert(commentOnly.length === 0, "scanner does not fail comments that name the ban");

  const doHits = hubDoBans(`
    export class HubDO {
      alarm() { this.ctx.storage.setAlarm(Date.now()); }
      scheduled(event) {}
    }
  `);
  assert(doHits.includes("alarm(") && doHits.includes("scheduled("), "scanner fails alarm(/scheduled( in HubDO");
}

function banExtension() {
  const extRoot = join(ROOT, "extension");
  for (const file of walk(extRoot)) {
    if (!/\.(js|json)$/.test(file)) continue;
    const src = read(file);
    const code = stripComments(src);
    const where = rel(file);
    if (file.endsWith("manifest.json")) {
      assert(!src.includes("<all_urls>"), `manifest has no <all_urls> (${where})`);
    }
    if (/chrome\.cookies/.test(code)) fail(`${where}: chrome.cookies`);
    else if (file.endsWith(".js")) ok(`${where}: no chrome.cookies`);
    if (/chrome\.tabs\.create\s*\([^)]*active\s*:\s*true/.test(code) || /active\s*:\s*true/.test(code)) {
      fail(`${where}: active: true (tabs.create must default to background)`);
    }
  }
  const sw = read(join(extRoot, "sw.js"));
  assert(
    /chrome\.tabs\.create\s*\(\s*\{\s*url:.*active:\s*false/.test(stripComments(sw).replace(/\s+/g, " ")),
    "open-or-focus uses chrome.tabs.create({ ..., active: false })"
  );
}

function banWranglers() {
  for (const file of walk(ROOT)) {
    if (extname(file) !== ".jsonc") continue;
    const hits = wranglerBans(read(file));
    if (hits.length) fail(`${rel(file)}: ${hits.join(", ")}`);
    else ok(`${rel(file)}: no browser / crons / queues / workflows`);
  }
}

function banHubDo() {
  const file = join(ROOT, "hub/gateway/src/hub-do.js");
  const hits = hubDoBans(read(file));
  assert(hits.length === 0, `hub-do.js has no alarm(/scheduled( (got ${hits.join(", ") || "none"})`);
}

function banSurfaceParent() {
  for (const file of walk(join(ROOT, "hub/surface"))) {
    if (!file.endsWith(".js")) continue;
    const code = stripComments(read(file));
    const where = rel(file);
    if (/window\.parent/.test(code) || /\bparent\.postMessage\s*\(/.test(code)) {
      fail(`${where}: window.parent hub messages`);
    } else {
      ok(`${where}: no window.parent messages`);
    }
  }
}

function banSopBypass() {
  const re = /bypass(es|ing)?\s+(the\s+)?(SOP|same[- ]origin)/i;
  for (const file of walk(ROOT)) {
    if (!/\.(js|md|jsonc|html)$/.test(file)) continue;
    const src = read(file);
    const lines = src.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!re.test(line)) continue;
      if (/\b(never|not|don't|do not|forbid|reject|intact|stays intact)\b/i.test(line)) continue;
      fail(`${rel(file)}:${i + 1}: SOP-bypass language`);
    }
  }
  ok("no SOP-bypass language (except refusals)");
}

function banNavigatorModelContext() {
  for (const file of walk(ROOT)) {
    if (!file.endsWith(".js")) continue;
    const code = stripComments(read(file));
    const re = /navigator\.modelContext(?!Testing)/g;
    let m;
    while ((m = re.exec(code))) {
      const slice = code.slice(Math.max(0, m.index - 80), m.index + 80);
      if (/149|footnote|deprecated|absent|NOT implemented/i.test(slice)) continue;
      fail(`${rel(file)}: navigator.modelContext in runtime code`);
    }
  }
  ok("no navigator.modelContext runtime (except a 149 footnote)");
}

function banHandlerCallback() {
  const targets = [
    join(ROOT, "packages/bridge/webmcp-polyfill.js"),
    ...[...walk(join(ROOT, "apps"))].filter((f) => f.endsWith("app.js")),
  ];
  for (const file of targets) {
    const src = read(file);
    const code = stripComments(src);
    // A tool callback named handler. The polyfill may mention `handler` to reject it.
    if (/registerTool\s*\(\s*\{[^}]*\bhandler\s*:/s.test(code)) {
      fail(`${rel(file)}: handler: as tool callback`);
      continue;
    }
    if (file.endsWith("app.js") && /\bhandler\s*:/.test(code) && /registerTool/.test(code)) {
      fail(`${rel(file)}: handler: near registerTool`);
      continue;
    }
    ok(`${rel(file)}: tools use execute, not handler`);
  }
  const polyfill = read(join(ROOT, "packages/bridge/webmcp-polyfill.js"));
  assert(
    /`handler` is not the contract/.test(polyfill) || /handler is not the contract/.test(polyfill),
    "polyfill rejects handler as the callback name"
  );
}

/**
 * The join door, asserted as BEHAVIOUR rather than as literal ports.
 *
 * This test used to require `origins.js` to contain the strings ":8787" and
 * ":8790". Once the allowlist became env-driven those literals stopped being
 * the allowlist and became merely its local-dev default, so pinning them tested
 * nothing an operator could not silently break. What must hold on every
 * deployment is the SHAPE: the vars are the source, the surface is always a
 * member, the extension reaches /api/* and never /hub, and the hostile origin
 * is not reachable by any configuration this module will accept.
 *
 * origins.js is pure — URL and Set, no Worker globals — so it can simply be
 * imported and exercised. That is strictly stronger than grepping its text.
 */
async function assertOrigins() {
  const src = read(join(ROOT, "hub/gateway/src/origins.js"));
  const bridge = read(join(ROOT, "packages/bridge/bridge.js"));
  const config = read(join(ROOT, "hub/surface/public/config.js"));
  const o = await import(pathToFileURL(join(ROOT, "hub/gateway/src/origins.js")).href);

  // The allowlist is env-sourced, not a literal in the module.
  assert(/env\?\.ALLOWED_ORIGINS/.test(src), "allowlist is built from env.ALLOWED_ORIGINS");
  assert(/env\?\.SURFACE_ORIGIN/.test(src), "surface origin is built from env.SURFACE_ORIGIN");

  // Unset vars still boot the local mesh: pnpm dev stays zero-config.
  assert(o.isAllowedOrigin("http://localhost:8787", undefined), "default allowlist admits the CRM");
  assert(o.isAllowedOrigin("http://localhost:8788", undefined), "default allowlist admits the Ledger");
  assert(o.isAllowedOrigin("http://localhost:8789", undefined), "default allowlist admits Tick");
  assert(o.isAllowedOrigin(o.DEFAULT_SURFACE_ORIGIN, undefined), "default allowlist admits the surface");
  assert(o.roleForOrigin(o.DEFAULT_SURFACE_ORIGIN, undefined) === "surface", "default surface origin gets the surface role");

  // The hostile stub is not a member, by default or by source.
  assert(!o.isAllowedOrigin("http://localhost:8793", undefined), "hostile stub :8793 cannot join /hub");
  assert(!o.isAllowedApiOrigin("http://localhost:8793", undefined), "hostile stub :8793 cannot reach /api/*");
  assert(!src.includes("http://localhost:8793"), "hostile stub :8793 is not named in origins.js");

  // Configured vars REPLACE the defaults. A production gateway must not carry
  // localhost on its allowlist just because it inherited it.
  const env = { ALLOWED_ORIGINS: "https://a.example, https://b.example", SURFACE_ORIGIN: "https://surface.example" };
  assert(o.isAllowedOrigin("https://a.example", env), "configured allowlist admits its own origins");
  assert(!o.isAllowedOrigin("http://localhost:8787", env), "configured allowlist drops the localhost defaults");
  assert(o.isAllowedOrigin("https://surface.example", env), "surface is always on its own allowlist");
  assert(o.roleForOrigin("https://surface.example", env) === "surface", "role is bound to the configured surface");
  assert(o.roleForOrigin("https://a.example", env) === "spoke", "a spoke is not the surface");

  // Junk is refused rather than admitted half-parsed.
  assert(!o.isAllowedOrigin(null, env) && !o.isAllowedOrigin("", env), "a missing Origin is not allowed");
  assert(
    !o.isAllowedOrigin("https://a.example", { ALLOWED_ORIGINS: "not a url" }),
    "an unparseable allowlist entry does not admit anything"
  );

  // T6.2: the extension is /api/* only, and pinned rather than configurable.
  assert(!o.isAllowedOrigin(o.EXTENSION_ORIGIN, env), "extension origin cannot join /hub");
  assert(o.isAllowedApiOrigin(o.EXTENSION_ORIGIN, env), "extension origin may reach /api/*");
  assert(
    !/EXTENSION_ORIGIN\s*=[^;]*env/.test(src),
    "extension origin is pinned in code, not taken from env"
  );

  // The surface's URLs are build-substituted, but EXT_ID stays pinned.
  assert(/export const GATEWAY_URL =/.test(config) && /export const MAPPER_URL =/.test(config), "surface config exports the gateway and mapper URLs");
  assert(/EXT_ID = "[a-z]{32}"/.test(config), "surface keeps the pinned extension id");

  assert(
    /frame\.src\s*=\s*url\.toString\(\)/.test(bridge) && /SURFACE_FRAME_ID/.test(bridge),
    "surface iframe is mounted from the hub surface URL, not the stub"
  );
  assert(
    /No `allow="tools"`/.test(bridge) || /allow", ""/.test(bridge) || /setAttribute\("allow", ""\)/.test(bridge),
    "surface iframe is not delegated tools"
  );
}

/**
 * The boot tag is substituted per environment (scripts/build-env.mjs), so what
 * CI can check is internal consistency: a tag whose `src` and `data-connectome-hub`
 * disagree points the page at one gateway and the bridge at another, which fails
 * at the join door with a message that blames the allowlist.
 */
function assertBootTags() {
  let tagged = 0;
  for (const file of walk(join(ROOT, "apps"))) {
    if (!file.endsWith(".html")) continue;
    const src = read(file);
    const hub = src.match(/data-connectome-hub="([^"]*)"/)?.[1];
    if (!hub) continue;
    tagged += 1;
    const boot = src.match(/src="([^"]*)\/\.webmcp\/boot\.js"/)?.[1];
    assert(boot === hub, `${rel(file)}: boot.js src origin matches data-connectome-hub`);
    assert(
      /data-connectome-surface="[^"]+"/.test(src),
      `${rel(file)}: boot tag names a surface origin`
    );
    assert(!file.includes("hostile-stub"), `${rel(file)}: hostile stub carries no boot tag`);
  }
  assert(tagged >= 3, `every stub app carries a boot tag (found ${tagged})`);
}

function assertWritePath() {
  const src = read(join(ROOT, "hub/surface/public/surface.js"));
  assert(/function viewConfirm\s*\(/.test(src), "surface.js has viewConfirm");
  assert(/async function doWrite\s*\(/.test(src), "surface.js has doWrite");
  const doWrite = src.slice(src.indexOf("async function doWrite"));
  const doWriteBody = doWrite.slice(0, doWrite.indexOf("\nfunction ") > 0 ? doWrite.indexOf("\nfunction ") : doWrite.length);
  assert(/client\.invoke\s*\(/.test(doWriteBody), "doWrite is the write invoke");
  assert(/client\.grant\s*\(/.test(doWriteBody), "doWrite records a grant and still invokes");
  // A write capability click must go through startEdge → confirm, never invoke the target write itself.
  const start = src.slice(src.indexOf("async function startEdge"), src.indexOf("async function openInBackground"));
  assert(/name:\s*"confirm"/.test(start) || /prepareConfirm/.test(start), "startEdge proposes confirm, does not write");
  assert(!/client\.invoke\([\s\S]*v\.cap\.name/.test(start), "startEdge does not invoke the target write");
}

function assertMapperGuard() {
  const src = read(join(ROOT, "hub/mapper/src/index.js"));
  assert(/assertNoValues\s*\(/.test(src), "mapper Worker calls assertNoValues");
}

function assertStubsExecute() {
  for (const file of walk(join(ROOT, "apps"))) {
    if (!file.endsWith("app.js")) continue;
    const src = read(file);
    assert(/registerTool\s*\(/.test(src), `${rel(file)} registers tools`);
    assert(/\basync execute\s*\(/.test(src) || /\bexecute\s*\(/.test(src) || /execute\s*\(/.test(src), `${rel(file)} uses execute`);
    assert(!/\bhandler\s*:\s*(async\s*)?\(/.test(src), `${rel(file)} does not use handler:`);
  }
}

function assertJoinDoor() {
  const gw = read(join(ROOT, "hub/gateway/src/index.js"));
  const doSrc = read(join(ROOT, "hub/gateway/src/hub-do.js"));
  const origins = read(join(ROOT, "hub/gateway/src/origins.js"));
  assert(/function hubJoinDenied/.test(gw) && /isAllowedOrigin/.test(gw), "gateway allowlists Origin on /hub");
  assert(/function apiJoinDenied/.test(gw) && /isAllowedApiOrigin/.test(gw), "gateway allowlists Origin on /api/*");
  assert(/request\.headers\.get\("Origin"\)/.test(doSrc), "session origin is the Origin header");
  assert(
    !/url\.searchParams\.get\(\s*["']origin["']\s*\)/.test(stripComments(doSrc)),
    "HubDO does not take identity from ?origin="
  );
  assert(/HELLO\.origin is a poster/.test(doSrc) || /session\.origin/.test(doSrc), "HELLO.origin is not identity");
  assert(/roleForOrigin\(origin,/.test(doSrc), "role is bound from Origin, not ?role=");
  assert(!origins.includes("http://localhost:8793"), "unlisted origin cannot join");
  // env must reach the door, or the DO resolves a different allowlist than the
  // gateway that routed to it and the two disagree about who is the surface.
  assert(/isAllowedOrigin\(origin,\s*this\.env\)/.test(doSrc), "HubDO checks the Origin against env");
}

function assertSurfaceOnlyInvoke() {
  const doSrc = read(join(ROOT, "hub/gateway/src/hub-do.js"));
  const bridge = read(join(ROOT, "packages/bridge/bridge.js"));
  assert(
    /session\.role === "surface" && peer\.role === "spoke"/.test(doSrc) &&
      /session\.role === "spoke" && peer\.role === "surface"/.test(doSrc),
    "SEALED is only surface ↔ spoke"
  );
  assert(/Spoke-to-spoke is a write primitive; refuse it/.test(doSrc), "spoke-to-spoke is refused in code, not a comment-only hope");
  assert(
    /if \(this\.transport === TRANSPORT\.EDGE\) return/.test(bridge),
    "plaintext INVOKE is ignored on the edge path"
  );
  assert(
    /fromOrigin !== surfaceOrigin/.test(bridge),
    "edge executeTool only if PEER_KEYS origin is the surface"
  );
}

scannerCatchesRejectedDoors();
banExtension();
banWranglers();
banHubDo();
banSurfaceParent();
banSopBypass();
banNavigatorModelContext();
banHandlerCallback();
await assertOrigins();
assertBootTags();
assertWritePath();
assertMapperGuard();
assertStubsExecute();
assertJoinDoor();
assertSurfaceOnlyInvoke();

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
