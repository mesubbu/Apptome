#!/usr/bin/env node
/**
 * E7 harness: navigator.modelContextTesting.provideContext swaps tools atomically.
 * No clicking. No mesh.
 *
 *   1. provideContext replaces the whole set.
 *   2. Invoicing with no create-invoice → TOOL_NOT_FOUND.
 *   3. Changed create-invoice inputSchema → SCHEMA_DRIFT (T7.3 check, in the surface).
 */
import { installPolyfill, installTestingSurface } from "../packages/bridge/webmcp-polyfill.js";
import { FAILURE, failure, schemaHash } from "../packages/protocol/protocol.js";

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

function freshDocument() {
  globalThis.self = globalThis;
  Object.defineProperty(globalThis, "isSecureContext", { value: true, configurable: true });
  globalThis.location = { origin: "http://localhost:8788" };
  try {
    delete globalThis.navigator.modelContextTesting;
  } catch {
    /* navigator is a host getter; modelContextTesting may already be absent */
  }
  const doc = {
    permissionsPolicy: {
      features: () => [],
      allowedFeatures: () => [],
      allowsFeature: () => false,
    },
    querySelectorAll: () => [],
  };
  globalThis.document = doc;
  return doc;
}

function invoiceCreate(schema) {
  return {
    name: "create-invoice",
    description: "Creates a draft invoice for a customer. Does not send or charge.",
    inputSchema: schema,
    async execute() {
      return { invoiceId: "INV-TEST", status: "draft" };
    },
  };
}

function invoiceList() {
  return {
    name: "list-invoices",
    description: "Lists the invoices in this account and whether each one is still a draft.",
    annotations: { readOnlyHint: true },
    inputSchema: { type: "object", properties: {} },
    async execute() {
      return { invoices: [] };
    },
  };
}

const SCHEMA_A = {
  type: "object",
  properties: {
    customerName: { type: "string" },
    customerEmail: { type: "string" },
    amount: { type: "number" },
    currency: { type: "string" },
    memo: { type: "string" },
  },
  required: ["customerName", "amount", "currency"],
};

const SCHEMA_B = {
  ...SCHEMA_A,
  properties: { ...SCHEMA_A.properties, extraField: { type: "string" } },
};

/** Same closed-set failure the page bridge returns when the tool is gone. */
async function invokeNamed(doc, name, args = {}) {
  try {
    const tools = await doc.modelContext.getTools();
    const found = tools.find((t) => t.name === name);
    if (!found) return failure(FAILURE.TOOL_NOT_FOUND, name);
    const data = await doc.modelContext.executeTool(found, args);
    return { ok: true, data };
  } catch (err) {
    if (err?.name === "NotFoundError") return failure(FAILURE.TOOL_NOT_FOUND, name);
    return failure(FAILURE.TOOL_FAILED, String(err?.message ?? err));
  }
}

/** The T7.3 check. One home: the surface. Replicated here so CI can fire without clicking. */
function schemaDrifted(grant, liveHash) {
  return Boolean(grant?.schemaHash && grant.schemaHash !== liveHash);
}

const doc = freshDocument();
assert(installPolyfill(doc) === "polyfill", "polyfill installs on a document with no native API");
assert(installTestingSurface(doc) === "polyfill", "modelContextTesting installs");

const testing = navigator.modelContextTesting;

await testing.provideContext({ tools: [invoiceCreate(SCHEMA_A), invoiceList()] });
let names = (await doc.modelContext.getTools()).map((t) => t.name).sort();
assert(
  names.join(",") === "create-invoice,list-invoices",
  `full invoicing tool set (${names.join(", ")})`
);

await testing.provideContext({ tools: [invoiceList()] });
names = (await doc.modelContext.getTools()).map((t) => t.name);
assert(names.length === 1 && names[0] === "list-invoices", "provideContext swaps the set atomically — only list-invoices remains");
assert(!names.includes("create-invoice"), "invoicing has no create-invoice");

const missing = await invokeNamed(doc, "create-invoice", { customerName: "River North Studio", amount: 180, currency: "USD" });
assert(missing.ok === false && missing.code === FAILURE.TOOL_NOT_FOUND, `no create-invoice → TOOL_NOT_FOUND (got ${missing.code})`);

const stillList = await invokeNamed(doc, "list-invoices");
assert(stillList.ok === true, "list-invoices still runs after the swap");

const oldHash = await schemaHash(SCHEMA_A);
const newHash = await schemaHash(SCHEMA_B);
assert(oldHash !== newHash, "changed create-invoice inputSchema hashes differently");

const grant = { schemaHash: oldHash, revoked: null, uses: 0, scope: "session" };
assert(schemaDrifted(grant, newHash) === true, "SCHEMA_DRIFT when the live schema does not match the grant");
assert(schemaDrifted(grant, oldHash) === false, "same schema is not drift");
assert(schemaDrifted({ schemaHash: null }, newHash) === false, "a grant with no hash is not silently drifted");

await testing.provideContext({ tools: [invoiceCreate(SCHEMA_B)] });
names = (await doc.modelContext.getTools()).map((t) => t.name);
assert(names.join(",") === "create-invoice", "second swap leaves only the drifted create-invoice");
const liveHash = await schemaHash((await doc.modelContext.getTools())[0].inputSchema);
assert(schemaDrifted(grant, liveHash) === true, "live getTools schema after provideContext still drifts the stored grant");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
