/**
 * Fetch a spoke's poster: `/.well-known/connectome.json`.
 *
 * Reached from POST /api/declare when the user typed an origin. The good
 * parts that were already here stay: the origin is parsed and re-serialised,
 * the protocol is http(s) only, redirects are refused, and no credentials
 * travel. REVIEW.md G4 is what this file adds:
 *
 *   - AbortSignal.timeout(), so a hostile origin that accepts and never
 *     responds cannot pin a Worker invocation until the platform kills it.
 *   - A byte cap before parse, so res.json() is never pointed at an unbounded
 *     body.
 *   - A short-TTL KV cache keyed by origin. Read/write is request-scoped: it
 *     happens because the user typed an origin and pressed Add. No background
 *     refresh, no cron.
 *
 * A KV miss, a KV failure, or an absent binding all degrade to a live fetch
 * rather than failing the declare (REVIEW.md Part 2: Cloudflare-native must
 * not become Cloudflare-required). Errors are not cached — a down origin
 * must be allowed to recover on the next Add.
 *
 * The record we store is the already-sanitised poster (name/icon/launch/
 * capabilities), never the raw body, so a cache hit does not re-parse
 * untrusted JSON through a different path.
 */

import { posterCapabilities } from "./vendor/protocol.js";

export const MANIFEST_TIMEOUT_MS = 5_000;
/** KV expirationTtl floor is 60s. Short on purpose: this is a poster, not a grant. */
export const MANIFEST_TTL_SECONDS = 60;
/** A connectome.json is a name, an icon and a short capability list. 16 KiB is generous. */
export const MANIFEST_MAX_BYTES = 16 * 1024;

export function manifestCacheKey(origin) {
  return `manifest:${origin}`;
}

/**
 * @param {string} originRaw
 * @param {object} [env]
 * @param {object} [io]  test seams: { fetch, timeoutMs }. Production leaves this unset.
 */
export async function fetchManifest(originRaw, env = {}, io = {}) {
  let origin;
  try {
    origin = new URL(String(originRaw ?? "")).origin;
  } catch {
    return { ok: false, status: 400, error: "that is not an origin" };
  }
  if (!/^https?:$/.test(new URL(origin).protocol)) {
    return { ok: false, status: 400, error: "origin must be http or https" };
  }

  const cached = await readCache(env, origin);
  if (cached) return { ok: true, record: cached, cached: true };

  const doFetch = io.fetch ?? globalThis.fetch;
  const timeoutMs = io.timeoutMs ?? MANIFEST_TIMEOUT_MS;
  const url = new URL("/.well-known/connectome.json", origin);

  let res;
  try {
    res = await doFetch(url, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
    return {
      ok: false,
      status: 404,
      error: timedOut
        ? "that origin did not answer in time — we don't invent a name"
        : "no connectome.json at that origin — we don't invent a name",
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      status: 404,
      error: "no connectome.json at that origin — we don't invent a name",
    };
  }

  const body = await readCapped(res, MANIFEST_MAX_BYTES);
  if (!body.ok) {
    return {
      ok: false,
      status: 400,
      error: "that origin published a manifest that is too large",
    };
  }

  let jsonBody;
  try {
    jsonBody = JSON.parse(new TextDecoder().decode(body.bytes));
  } catch {
    return { ok: false, status: 400, error: "that origin published something that is not a manifest" };
  }
  if (!jsonBody || typeof jsonBody !== "object" || Array.isArray(jsonBody)) {
    return { ok: false, status: 400, error: "that origin published something that is not a manifest" };
  }

  const record = {
    origin,
    identity: {
      name: typeof jsonBody.name === "string" ? jsonBody.name.slice(0, 60) : null,
      icon: typeof jsonBody.icon === "string" ? jsonBody.icon.slice(0, 300) : null,
      launch: sameOriginOnly(jsonBody.launch, origin),
    },
    capabilities: posterCapabilities(jsonBody.capabilities),
  };

  await writeCache(env, origin, record);
  return { ok: true, record };
}

async function readCache(env, origin) {
  try {
    const raw = await env?.MANIFESTS?.get?.(manifestCacheKey(origin), { type: "json" });
    if (raw && typeof raw === "object" && raw.origin === origin && raw.identity) {
      return raw;
    }
  } catch {
    /* degrade to live fetch */
  }
  return null;
}

async function writeCache(env, origin, record) {
  try {
    await env?.MANIFESTS?.put?.(manifestCacheKey(origin), JSON.stringify(record), {
      expirationTtl: MANIFEST_TTL_SECONDS,
    });
  } catch {
    /* a failed write is a cache miss next time, not a failed declare */
  }
}

/**
 * Cap the body WHILE reading. Checking Content-Length alone is not enough
 * (it can lie); buffering with res.json()/arrayBuffer() is how a Worker
 * eats an unbounded payload. Stop at MAX+1 and cancel the rest.
 */
export async function readCapped(res, maxBytes) {
  const declared = Number(res.headers?.get?.("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    try {
      await res.body?.cancel?.();
    } catch {
      /* already closed */
    }
    return { ok: false, tooLarge: true };
  }

  if (!res.body || typeof res.body.getReader !== "function") {
    // A test Response built from a string still has body; a stub might not.
    // Fall back to arrayBuffer and check length, which is safe only because
    // we already rejected an oversized Content-Length.
    try {
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength > maxBytes) return { ok: false, tooLarge: true };
      return { ok: true, bytes: buf };
    } catch {
      return { ok: false, tooLarge: false };
    }
  }

  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    let step;
    try {
      step = await reader.read();
    } catch {
      return { ok: false, tooLarge: false };
    }
    const { done, value } = step;
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        /* already cancelled */
      }
      return { ok: false, tooLarge: true };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes };
}

function sameOriginOnly(url, origin) {
  try {
    const u = new URL(url, origin);
    return u.origin === origin ? u.toString() : null;
  } catch {
    return null;
  }
}


