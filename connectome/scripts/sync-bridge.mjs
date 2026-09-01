#!/usr/bin/env node
/**
 * Vendor the protocol and the page bridge into the places that cannot import
 * them at runtime: the gateway (serves them as text; HubDO imports the JS
 * module), the surface (static `/protocol/protocol.js`), and the extension
 * (no bundler). Source of truth stays in packages/.
 *
 * Generate-on-dev: this script is `pnpm sync` and the first step of `pnpm dev`.
 * Generated copies are gitignored. Do not edit them.
 *
 * Run it after any edit under packages/protocol or packages/bridge.
 */

import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const copies = [
  // Gateway Worker serves these as text (wrangler Text modules).
  ["packages/protocol/protocol.js", "hub/gateway/src/vendor/protocol.js.txt"],
  ["packages/bridge/bridge.js", "hub/gateway/src/vendor/bridge.js.txt"],
  ["packages/bridge/webmcp-polyfill.js", "hub/gateway/src/vendor/webmcp-polyfill.js.txt"],
  // HubDO imports a real JS module, not the Text copy.
  ["packages/protocol/protocol.js", "hub/gateway/src/vendor/protocol.js"],
  // Surface is a different origin; it cannot load the gateway's /protocol/.
  ["packages/protocol/protocol.js", "hub/surface/public/protocol/protocol.js"],
  // Extension (T6). Destinations exist once extension/package.json is the stub.
  ["packages/protocol/protocol.js", "extension/vendor/protocol.js"],
  ["packages/bridge/bridge.js", "extension/vendor/bridge.js"],
  ["packages/bridge/webmcp-polyfill.js", "extension/vendor/webmcp-polyfill.js"],
  // vendor/bridge.js imports ../protocol/protocol.js
  ["packages/protocol/protocol.js", "extension/protocol/protocol.js"],
];

let failed = 0;

for (const [from, to] of copies) {
  const destination = resolve(root, to);
  try {
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(resolve(root, from), destination);
    console.log(`copied  ${from}  ->  ${to}`);
  } catch (err) {
    failed += 1;
    console.error(`FAILED  ${from}  ->  ${to}: ${err?.message ?? err}`);
  }
}

if (failed > 0) {
  console.error(`sync-bridge: ${failed} of ${copies.length} copies failed`);
  process.exit(1);
}

console.log(`sync-bridge: ${copies.length} files in sync`);
