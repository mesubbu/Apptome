/**
 * Connectome hub protocol.
 *
 * One protocol, two transports (GrokVisionResponse.md §4.3):
 *   - TRANSPORT.EXTENSION    thin privileged extension. Hub is on-device. Plaintext never leaves.
 *   - TRANSPORT.EDGE         edge-injected bridge + Durable Object. DO is a BLIND relay (ciphertext only).
 *
 * Nothing in this file may import an app, a model runtime, or a Cloudflare binding.
 * It is shared by the page bridge, the extension, the surface and the hub.
 */

export const PROTOCOL_VERSION = "0.1.0";

/** Which privileged mediator is carrying this session. */
export const TRANSPORT = {
  EXTENSION: "extension",
  EDGE: "edge",
};

/**
 * Where plaintext is allowed to exist.
 * GrokVisionResponse.md Gap 6 / Q2 = "blind relay + schema-only".
 */
export const RELAY_MODE = {
  /** Extension transport. The hub is the user's own device. No ciphertext needed, no egress. */
  LOCAL_HUB: "local-hub",
  /** Edge transport. The Durable Object relays sealed envelopes and never holds a key. */
  BLIND_RELAY: "blind-relay",
};

/* ------------------------------------------------------------------ *
 * Failure taxonomy — GrokVisionResponse.md Gap 7.
 * "Fail clearly" is not a design. This is the closed set the surface renders.
 * Every one of these has distinct copy and a distinct user action.
 * ------------------------------------------------------------------ */

export const FAILURE = {
  /** The target app is not present. GrokVision.md §7.2. Offer open-or-focus, never auto-write. */
  APP_UNAVAILABLE: "APP_UNAVAILABLE",
  /** The app is present but no longer registers that tool. */
  TOOL_NOT_FOUND: "TOOL_NOT_FOUND",
  /** No edge grant yet. Ask. */
  CONSENT_REQUIRED: "CONSENT_REQUIRED",
  /** The user dismissed the confirm card. Terminal. Nothing was written. */
  CONSENT_DENIED: "CONSENT_DENIED",
  /** Proposed args do not satisfy the target inputSchema. Never coerce silently (§4.4). */
  SCHEMA_INVALID: "SCHEMA_INVALID",
  /** The tool ran and threw. Show what ran. Do not retry (§6.2). */
  TOOL_FAILED: "TOOL_FAILED",
  /** The spoke says the user is not signed in. The hub never touches credentials. */
  AUTH_REQUIRED: "AUTH_REQUIRED",
  /** registerTool() rejected with NotAllowedError: Permissions-Policy `tools=()`.
   *  Treat as soft de-membership, not a retryable error (GrokVisionResponse.md Gap 10). */
  PERMISSION_BLOCKED: "PERMISSION_BLOCKED",
  /** The hub itself is unreachable. */
  HUB_UNAVAILABLE: "HUB_UNAVAILABLE",
  /** The target tool's inputSchema changed since the edge grant was made (Gap: no versioning). */
  SCHEMA_DRIFT: "SCHEMA_DRIFT",
};

/** Human copy + the action the surface should offer. Data, never instructions. */
export const FAILURE_COPY = {
  APP_UNAVAILABLE: { title: "That app isn't open", action: "open" },
  TOOL_NOT_FOUND: { title: "That capability is no longer offered", action: "refresh" },
  CONSENT_REQUIRED: { title: "You haven't allowed this connection yet", action: "grant" },
  CONSENT_DENIED: { title: "You declined. Nothing was written.", action: "none" },
  SCHEMA_INVALID: { title: "The proposed values don't fit", action: "edit" },
  TOOL_FAILED: { title: "The app rejected the request", action: "none" },
  AUTH_REQUIRED: { title: "Sign in to that app first", action: "open" },
  PERMISSION_BLOCKED: { title: "That site has turned tools off", action: "none" },
  HUB_UNAVAILABLE: { title: "Can't reach your connectome", action: "retry" },
  SCHEMA_DRIFT: { title: "That capability changed since you allowed it", action: "grant" },
};

/** @param {keyof typeof FAILURE} code @param {string} [detail] */
export function failure(code, detail) {
  return { ok: false, code, detail: detail ?? null, at: Date.now() };
}

/* ------------------------------------------------------------------ *
 * Message envelope
 * ------------------------------------------------------------------ */

export const M = {
  // bridge (in a spoke's page) -> hub
  HELLO: "hello",
  TOOLS_CHANGED: "tools-changed",
  INVOKE_RESULT: "invoke-result",
  BYE: "bye",

  // hub -> bridge
  INVOKE: "invoke",

  // surface -> hub
  GRAPH_REQUEST: "graph-request",
  READ: "read",
  WRITE: "write",
  GRANT_EDGE: "grant-edge",
  REVOKE_EDGE: "revoke-edge",
  LIST_GRANTS: "list-grants",
  FORGET_APP: "forget-app",
  PAUSE: "pause",
  OPEN_APP: "open-app",

  // hub -> surface
  GRAPH: "graph",
  GRANTS: "grants",
  RESULT: "result",
  PAUSED: "paused",

  // either direction, edge transport only: sealed peer-to-peer payload
  SEALED: "sealed",
  // keys: { [sessionId]: { publicKey, origin, helloAt } }
  PEER_KEYS: "peer-keys",
};

/**
 * T1.1: among live sessions of `origin`, the most recently HELLOed.
 * `keys` is the PEER_KEYS map. Ties go to the later entry.
 */
export function latestPeerId(keys, origin, exceptId = null) {
  let best = null;
  let bestAt = -1;
  for (const [id, entry] of Object.entries(keys ?? {})) {
    if (exceptId && id === exceptId) continue;
    if (!entry || entry.origin !== origin) continue;
    const at = Number(entry.helloAt) || 0;
    if (at >= bestAt) {
      best = id;
      bestAt = at;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * Tools
 * ------------------------------------------------------------------ */

/**
 * Chrome native WebMCP stringifies `inputSchema` on getTools(); the polyfill
 * and the community IDL keep it as an object. One helper, used everywhere a
 * schema is read, hashed, or rendered — never parse-or-keep-the-string, never
 * parse-or-throw. A broken native string becomes an empty object schema.
 */
export function parseInputSchema(inputSchema) {
  let schema = inputSchema;
  if (typeof schema === "string") {
    try {
      schema = JSON.parse(schema);
    } catch {
      return { type: "object", properties: {} };
    }
  }
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return { type: "object", properties: {} };
  }
  return schema;
}

/**
 * Normalise a WebMCP `RegisteredTool` into something safe to persist and render.
 *
 * The 19 Aug 2026 draft puts `origin` and owner `window` on each returned tool.
 * We keep `origin` (it is the only trusted identity, GrokVisionResponse.md Gap 3)
 * and drop `window` (not serialisable, and not ours to hold).
 *
 * `description` is UNTRUSTED TEXT (GrokVision.md §6.2). It is carried as data and
 * must never be concatenated into a prompt or rendered as HTML.
 */
export function toolDescriptor(tool, origin) {
  return {
    name: String(tool.name ?? ""),
    description: String(tool.description ?? ""),
    inputSchema: parseInputSchema(tool.inputSchema),
    origin: origin ?? tool.origin ?? null,
    readOnly: Boolean(tool.annotations?.readOnlyHint),
    untrusted: Boolean(tool.annotations?.untrustedContentHint),
    // Copy only. Native Chrome may drop unknown annotation fields; a missing
    // risk is not a silent write (riskOf / confirmKind).
    risk: parseRisk(tool.annotations?.risk ?? tool.risk),
  };
}

/** True when invoking this tool may change the world. Writes always confirm (§6.2). */
export function isWrite(descriptor) {
  return !descriptor.readOnly;
}

/* ------------------------------------------------------------------ *
 * Risk is COPY, never a skip.
 *
 * GrokVision.md §4.2 already promised "Risk / write hints → surface copy,
 * confirm severity." OtherFeaturesGrok.md §5.1: a write still always confirms,
 * exact JSON. Risk may change the heading, the badge, and how loud the card
 * is. It may not hide the card. confirmKind never returns a skip.
 * ------------------------------------------------------------------ */

export const RISK = {
  READ: "read_only",
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  FINANCIAL: "financial",
};

export const CONFIRM_KIND = {
  READ: "read-consent",
  WRITE: "write-always",
};

export function parseRisk(raw) {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase().replace(/[-\s]/g, "_").slice(0, 24);
  if (v === "readonly") return RISK.READ;
  if (v === RISK.READ || v === RISK.LOW || v === RISK.MEDIUM || v === RISK.HIGH || v === RISK.FINANCIAL) {
    return v;
  }
  return null;
}

/**
 * Live readOnlyHint wins. A write that claims read_only is a lie — treat it as
 * a medium write (loud), not a silent read. Unknown writes are medium, not low.
 */
export function riskOf(descriptor) {
  if (!descriptor || descriptor.readOnly) return RISK.READ;
  const r = parseRisk(descriptor.risk);
  if (!r || r === RISK.READ) return RISK.MEDIUM;
  return r;
}

/** What the surface must show. Writes always get a card. */
export function confirmKind(descriptor) {
  if (descriptor?.readOnly) return CONFIRM_KIND.READ;
  return CONFIRM_KIND.WRITE;
}

export const RISK_COPY = {
  [RISK.READ]: {
    badge: "reads",
    badgeClass: "read",
    confirm:
      "You will confirm this read by name before it runs. The result stays in this panel.",
    loud: false,
  },
  [RISK.LOW]: {
    badge: "draft",
    badgeClass: "draft",
    confirm:
      "You will pick a source and approve the exact JSON. This is a draft write — it should not send or charge.",
    loud: false,
  },
  [RISK.MEDIUM]: {
    badge: "changes data",
    badgeClass: "changes",
    confirm: "You will pick a source and approve the exact JSON. This changes data in the other app.",
    loud: false,
  },
  [RISK.HIGH]: {
    badge: "destructive",
    badgeClass: "destructive",
    confirm:
      "You will pick a source and approve the exact JSON. This cannot be undone from here.",
    loud: true,
  },
  [RISK.FINANCIAL]: {
    badge: "charges money",
    badgeClass: "financial",
    confirm:
      "You will pick a source and approve the exact JSON. This charges money. This cannot be undone from here.",
    loud: true,
  },
};

/** Reads stay "reads". Undeclared writes stay "writes". Declared risk is a second badge. */
export function riskBadge(descriptor) {
  if (!descriptor || descriptor.readOnly) {
    return { text: "reads", className: "read", extra: null };
  }
  const declared = parseRisk(descriptor.risk);
  if (!declared || declared === RISK.READ) {
    return { text: "writes", className: "write", extra: null };
  }
  const copy = RISK_COPY[declared];
  return {
    text: "writes",
    className: "write",
    extra: { text: copy.badge, className: copy.badgeClass },
  };
}

export function executePathCopy(transport) {
  if (transport === TRANSPORT.EXTENSION) {
    return "Runs in that app's own page, in your session. The hub is this device and never sees the values.";
  }
  return "Runs in that app's own page, in your session. The hub relays ciphertext and never sees the values.";
}

/**
 * Live tools win on schema and readOnly. If the live tool has no risk (native
 * Chrome may drop unknown annotations), keep the last-seen / poster hint so
 * the surface still has copy.
 */
export function withPreservedRisk(nextCaps, prevCaps) {
  const prev = new Map((prevCaps ?? []).map((c) => [c?.name, parseRisk(c?.risk)]));
  return (nextCaps ?? []).map((c) => {
    if (parseRisk(c?.risk)) return c;
    const old = prev.get(c?.name);
    return old ? { ...c, risk: old } : c;
  });
}

/** Sanitise a connectome.json capability list. Poster, never authority. */
export function posterCapabilities(list) {
  if (!Array.isArray(list)) return [];
  return list
    .slice(0, 50)
    .map((c) => ({
      name: String(c?.name ?? ""),
      description: String(c?.summary ?? c?.description ?? ""),
      inputSchema: { type: "object", properties: {} },
      readOnly: c?.write === false,
      untrusted: false,
      risk: parseRisk(c?.risk),
    }))
    .filter((c) => c.name);
}

/** Stable id for one directed pair of tools. This is the unit of consent (§6.1). */
export function edgeKey(source, target) {
  return `${source.origin}|${source.tool}=>${target.origin}|${target.tool}`;
}

/**
 * Hash of a tool's inputSchema, stored on the edge grant.
 * A grant is invalidated when the schema moves underneath it -> FAILURE.SCHEMA_DRIFT.
 * (GrokVisionResponse.md §3, "No versioning anywhere".)
 */
export async function schemaHash(inputSchema) {
  const canonical = canonicalJson(parseInputSchema(inputSchema));
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return b64url(new Uint8Array(digest)).slice(0, 22);
}

/** Deterministic JSON: object keys sorted, so a hash is stable across engines. */
export function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
}

/* ------------------------------------------------------------------ *
 * Membership — GrokVisionResponse.md Gap 2 + Gap 3.
 *
 * A membership record is NOT an observation. It survives the tab.
 * `source` says how we learned about the app:
 *   observed  the hub saw a WebMCP handshake in a live tab
 *   declared  the origin published /.well-known/connectome.json
 *   imported  the user added it from an export
 *
 * Membership is keyed by ORIGIN, always. `name` is a label the app chose; the
 * surface must never render the label without the origin, or App A can appear
 * inside App B wearing App B's neighbour's name.
 * ------------------------------------------------------------------ */

export const MEMBER_SOURCE = { OBSERVED: "observed", DECLARED: "declared", IMPORTED: "imported" };

/**
 * Parse an origin-served /.well-known/connectome.json poster.
 * Absence of a name is allowed; we never invent one.
 */
export function parseConnectomeManifest(json, origin) {
  const launch = (() => {
    try {
      const u = new URL(json?.launch, origin);
      return u.origin === origin ? u.toString() : null;
    } catch {
      return null;
    }
  })();
  const capabilities = posterCapabilities(json?.capabilities);
  return {
    origin,
    identity: {
      name: typeof json?.name === "string" ? json.name.slice(0, 60) : null,
      icon: typeof json?.icon === "string" ? json.icon.slice(0, 300) : null,
      launch,
    },
    capabilities,
  };
}

export function membershipRecord({ origin, name, icon, launch, capabilities, source }) {
  return {
    origin,
    name: name || hostLabel(origin),
    /** True only when the label came from the origin itself, not from us guessing. */
    nameAttested: Boolean(name),
    icon: icon ?? null,
    launch: launch ?? null,
    capabilities: capabilities ?? [],
    source: source ?? MEMBER_SOURCE.OBSERVED,
    firstSeen: Date.now(),
    lastSeen: Date.now(),
    /** Set when the origin sends Permissions-Policy: tools=(). Soft de-membership. */
    blocked: false,
  };
}

/** Fallback label. Deliberately ugly, so a missing manifest is visible, not papered over. */
export function hostLabel(origin) {
  try {
    return new URL(origin).host;
  } catch {
    return String(origin);
  }
}

/* ------------------------------------------------------------------ *
 * Edge grants — GrokVisionResponse.md Gap 5.
 *
 * THE RULE THAT MAKES THIS CONSISTENT WITH GrokVision.md §6.2:
 *   An edge grant authorises the hub to PROPOSE this edge, and to run the
 *   named source read. It NEVER authorises a write. Writes always confirm,
 *   exact JSON, every single time.
 * ------------------------------------------------------------------ */

export const GRANT_SCOPE = { ONCE: "once", SESSION: "session", UNTIL_REVOKED: "until-revoked" };

export function edgeGrant({ source, target, scope, targetSchemaHash }) {
  return {
    key: edgeKey(source, target),
    source,
    target,
    scope: scope ?? GRANT_SCOPE.SESSION,
    targetSchemaHash: targetSchemaHash ?? null,
    granted: Date.now(),
    revoked: null,
    uses: 0,
  };
}

export function grantIsLive(grant, sessionId) {
  if (!grant || grant.revoked) return false;
  if (grant.scope === GRANT_SCOPE.ONCE) return grant.uses === 0;
  if (grant.scope === GRANT_SCOPE.SESSION) return grant.sessionId === sessionId;
  return true;
}

/* ------------------------------------------------------------------ *
 * Provenance — GrokVisionResponse.md Gap 11 / E4.
 *
 * Every field on the confirm card carries where its value came from.
 * This is what turns §6.3's "typed preview" from truthful into informative,
 * and it is the only defence the user has against B's output being laundered
 * into a write against A.
 * ------------------------------------------------------------------ */

export const PROV = {
  /** Read out of the source app by a tool the user named. */
  READ: "read",
  /** Produced by the mapper from field names alone. */
  MAPPED: "mapped",
  /** The user typed it into the confirm card. */
  TYPED: "typed",
  /** The mapper had nothing and the field is required. Blocks approval. */
  MISSING: "missing",
  /** Constant baked into a hand-written adapter. */
  CONSTANT: "constant",
};

/**
 * @param {any} value
 * @param {keyof typeof PROV | string} how
 * @param {string|null} fromOrigin  origin the value originated in, or null
 * @param {boolean} untrusted       source tool carried untrustedContentHint
 */
export function provenanced(value, how, fromOrigin, untrusted = false) {
  return { value, how, fromOrigin: fromOrigin ?? null, untrusted: Boolean(untrusted) };
}

/** Strip provenance wrappers to the exact JSON that will be sent. */
export function plainArgs(provenancedArgs) {
  const out = {};
  for (const [k, v] of Object.entries(provenancedArgs)) out[k] = v.value;
  return out;
}

/* ------------------------------------------------------------------ *
 * Schema-only mapping contract — GrokVisionResponse.md E3.
 *
 * The Mapper NEVER receives values. It receives shapes and returns a field
 * correspondence map. The hub applies the map to the real data locally.
 * That is what makes a cloud mapper compatible with §6, and it is why the
 * hub can call an LLM without importing one (GrokVision.md §3.2).
 * ------------------------------------------------------------------ */

/** @typedef {{ from: string|null, constant?: any, confidence: number, why: string }} FieldMapping */

/** Build the request. Asserts, loudly, that no values are travelling. */
export function mapperRequest({ sourceTool, targetTool }) {
  const req = {
    protocolVersion: PROTOCOL_VERSION,
    source: {
      origin: sourceTool.origin,
      tool: sourceTool.name,
      description: sourceTool.description,
      fields: describeShape(sourceTool.outputShape ?? {}),
    },
    target: {
      origin: targetTool.origin,
      tool: targetTool.name,
      description: targetTool.description,
      schema: targetTool.inputSchema,
      required: targetTool.inputSchema?.required ?? [],
    },
  };
  assertNoValues(req);
  return req;
}

/**
 * Turn a real payload into field names + types ONLY. Values are discarded here,
 * on the device, before anything is sent anywhere.
 */
export function describeShape(payload, prefix = "") {
  const out = [];
  for (const [k, v] of Object.entries(payload ?? {})) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out.push(...describeShape(v, path));
    } else {
      out.push({ path, type: Array.isArray(v) ? "array" : typeof v });
    }
  }
  return out;
}

/**
 * Guard against a future refactor quietly reintroducing egress.
 * A shape descriptor may only ever carry `path` and `type`.
 */
export function assertNoValues(req) {
  for (const f of req.source.fields) {
    const keys = Object.keys(f).sort().join(",");
    if (keys !== "path,type") {
      throw new Error(`mapper request would leak values: field carries [${keys}]`);
    }
  }
  return true;
}

/** Read `a.b.c` out of a payload. */
export function pluck(payload, path) {
  return path.split(".").reduce((acc, k) => (acc == null ? undefined : acc[k]), payload);
}

/**
 * Apply a field correspondence map to the real payload, locally, producing
 * provenance-tagged args ready for the confirm card.
 */
export function applyMapping(mapping, sourcePayload, sourceTool, targetTool) {
  const args = {};
  const required = new Set(targetTool.inputSchema?.required ?? []);
  const props = targetTool.inputSchema?.properties ?? {};
  for (const field of Object.keys(props)) {
    const rule = mapping[field];
    if (rule && rule.from) {
      const value = pluck(sourcePayload, rule.from);
      if (value !== undefined) {
        args[field] = provenanced(value, PROV.READ, sourceTool.origin, sourceTool.untrusted);
        continue;
      }
    }
    if (rule && "constant" in rule) {
      args[field] = provenanced(rule.constant, PROV.CONSTANT, null, false);
      continue;
    }
    if (required.has(field)) {
      args[field] = provenanced(undefined, PROV.MISSING, null, false);
    }
  }
  return args;
}

/**
 * Minimal structural validation against the target inputSchema.
 * Never coerces. A mismatch is FAILURE.SCHEMA_INVALID and the user decides.
 */
export function validateArgs(args, inputSchema) {
  const problems = [];
  const props = inputSchema?.properties ?? {};
  for (const field of inputSchema?.required ?? []) {
    if (args[field] === undefined || args[field] === null || args[field] === "") {
      problems.push({ field, problem: "required, but empty" });
    }
  }
  for (const [field, value] of Object.entries(args)) {
    const spec = props[field];
    if (!spec || value === undefined) continue;
    const actual = Array.isArray(value) ? "array" : typeof value;
    if (spec.type && spec.type !== actual && !(spec.type === "integer" && actual === "number")) {
      problems.push({ field, problem: `expected ${spec.type}, got ${actual}` });
    }
  }
  return problems;
}

/* ------------------------------------------------------------------ *
 * Blind relay crypto — GrokVisionResponse.md §4.2, Q2.
 *
 * Only used by TRANSPORT.EDGE. Each page session generates an ECDH P-256 pair
 * in the browser; peers derive a pairwise AES-GCM key; the Durable Object sees
 * `{ from, to, bytes, at }` and ciphertext. It never holds a private key, so it
 * cannot read a payload even if it wanted to.
 *
 * Under TRANSPORT.EXTENSION none of this runs: the hub is the user's own device
 * and plaintext never leaves it at all.
 * ------------------------------------------------------------------ */

export async function generateSessionKeys() {
  return crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveKey"]);
}

export async function exportPublicKey(keyPair) {
  const raw = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  return b64url(new Uint8Array(raw));
}

export async function importPublicKey(b64) {
  return crypto.subtle.importKey(
    "raw",
    unb64url(b64),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
}

export async function deriveSharedKey(myKeyPair, theirPublicKeyB64) {
  const theirs = await importPublicKey(theirPublicKeyB64);
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: theirs },
    myKeyPair.privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/** @returns {Promise<{iv: string, ct: string}>} */
export async function seal(sharedKey, plainObject) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = new TextEncoder().encode(JSON.stringify(plainObject));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, sharedKey, bytes);
  return { iv: b64url(iv), ct: b64url(new Uint8Array(ct)) };
}

export async function unseal(sharedKey, sealed) {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64url(sealed.iv) },
    sharedKey,
    unb64url(sealed.ct)
  );
  return JSON.parse(new TextDecoder().decode(plain));
}

/* ------------------------------------------------------------------ *
 * small helpers
 * ------------------------------------------------------------------ */

export function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function unb64url(str) {
  const s = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "=".repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function newId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

/** Origin of a URL, or null. Used everywhere identity matters. */
export function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
