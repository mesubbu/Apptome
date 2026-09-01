/**
 * Who is allowed to address a connectome.
 *
 * A connectome is the set of one user's own signed-in sessions. Before this
 * module, `hub()` took the Durable Object name straight from `?cx=`, an
 * `x-connectome-id` header, or an unsigned cookie, and fell back to the fixed
 * name "local-dev". Knowing an id was the same as being that user, so on a
 * public hostname a guessed id was a whole graph: read it, poison it, revoke
 * its grants, pause it, or export it (REVIEW.md G1).
 *
 * The fix has two halves, and both are needed:
 *
 *   1. The id is UNGUESSABLE. 32 random bytes, so it cannot be enumerated.
 *   2. The id is UNFORGEABLE. It is HMAC-signed, so a caller cannot invent one —
 *      only an id this gateway minted verifies.
 *
 * Minting is gated on Turnstile: a human asked for this connectome. That gate is
 * REQUEST-SCOPED and HUMAN-PRESENT, which is why it does not weaken GrokVision.md
 * §10. It runs because the user clicked, it authorises nothing but addressing
 * your own graph, and it grants no write. Per-edge consent is untouched: every
 * write still shows the exact JSON and can still be refused (§6.2). A pairing
 * token is not "allow this agent" — §10 rejects that, and so does this file.
 *
 * NOT a session, NOT an account, NOT credentials for any spoke. The hub never
 * touches a spoke's credentials; this only says which DO you may open.
 */

const COOKIE = "cx";
const TOKEN_VERSION = "v1";
/** 32 bytes. Enumeration is not a threat model we want to reason about. */
const ID_BYTES = 32;
const YEAR_SECONDS = 60 * 60 * 24 * 365;
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export const PAIR_COOKIE = COOKIE;

/**
 * Local dev only. FAILS CLOSED: anything other than the explicit string "local"
 * — including an unset var — is production, and production has no unauthenticated
 * path. A deploy that forgets to set ENVIRONMENT gets the strict door, not the
 * open one. `scripts/dev.mjs` passes ENVIRONMENT:local for the local mesh.
 */
export function isLocal(env) {
  return env?.ENVIRONMENT === "local";
}

/** Turnstile is configured only when both halves are present. */
export function pairingConfigured(env) {
  return Boolean(env?.TURNSTILE_SECRET && env?.PAIR_SECRET);
}

/* ------------------------------------------------------------------ *
 * The token: v1.<id>.<hmac>
 * ------------------------------------------------------------------ */

export async function mintToken(env) {
  const secret = env?.PAIR_SECRET;
  if (!secret) return null;
  const id = b64url(crypto.getRandomValues(new Uint8Array(ID_BYTES)));
  const body = `${TOKEN_VERSION}.${id}`;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), utf8(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

/**
 * Returns the connectome id, or null. Null covers every failure the same way —
 * malformed, wrong version, bad signature, no secret configured — because the
 * caller must not be able to tell "you guessed a real id but signed it wrong"
 * from "that is not an id at all".
 *
 * `crypto.subtle.verify` does the comparison, so it is constant-time and there
 * is no hand-rolled equality here to get wrong.
 */
export async function verifyToken(env, token) {
  const secret = env?.PAIR_SECRET;
  if (!secret || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [version, id, sig] = parts;
  if (version !== TOKEN_VERSION || !id || !sig) return null;
  const sigBytes = fromB64url(sig);
  if (!sigBytes) return null;
  let ok = false;
  try {
    ok = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      sigBytes,
      utf8(`${version}.${id}`)
    );
  } catch {
    return null;
  }
  return ok ? id : null;
}

/* ------------------------------------------------------------------ *
 * Turnstile
 * ------------------------------------------------------------------ */

/**
 * Verify a Turnstile response token server-side. The widget's own result is not
 * evidence — only siteverify is, and only with the secret, which is why
 * TURNSTILE_SECRET is a secret and never a plaintext var.
 */
export async function verifyTurnstile(env, token, remoteip) {
  if (!env?.TURNSTILE_SECRET) return { ok: false, error: "pairing is not configured" };
  if (typeof token !== "string" || !token) return { ok: false, error: "no challenge response" };

  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET);
  form.append("response", token);
  if (remoteip) form.append("remoteip", remoteip);

  let res;
  try {
    res = await fetch(SITEVERIFY, {
      method: "POST",
      body: form,
      // A hung challenge must not hold a Worker invocation open.
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { ok: false, error: "could not reach the challenge service" };
  }
  const body = await res.json().catch(() => null);
  if (body?.success === true) return { ok: true };
  return {
    ok: false,
    // Cloudflare's own codes, passed through as data for the surface to render.
    error: Array.isArray(body?.["error-codes"]) && body["error-codes"].length
      ? `challenge rejected (${body["error-codes"].join(", ")})`
      : "challenge rejected",
  };
}

/* ------------------------------------------------------------------ *
 * Cookie
 * ------------------------------------------------------------------ */

/**
 * SameSite is a var because it is a property of the DEPLOYED TOPOLOGY, not of
 * this code.
 *
 * `Lax` (the default) is correct when the hub, the surface and the spokes are
 * subdomains of one registrable domain — SameSite is site-based, not
 * origin-based, so hub.example.com and surface.example.com are same-site and the
 * cookie rides along. That is the topology the deploy targets.
 *
 * A genuinely cross-site mesh — spokes on domains the operator does not own,
 * which is the product's whole point — needs `None`, and then it is a
 * third-party cookie and subject to browser blocking. That ceiling is exactly
 * why the extension transport exists (GrokVisionResponse.md §4.3): when the
 * cookie cannot ride, the on-device hub still can.
 */
function sameSite(env) {
  const raw = String(env?.PAIR_COOKIE_SAMESITE ?? "Lax").trim().toLowerCase();
  if (raw === "none") return "None";
  if (raw === "strict") return "Strict";
  return "Lax";
}

export function pairCookie(env, token) {
  const mode = sameSite(env);
  // SameSite=None is invalid without Secure; browsers drop such a cookie
  // silently, which would look like "pairing succeeded but nothing works".
  const secure = mode === "None" || !isLocal(env);
  const attrs = [
    `${COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    `SameSite=${mode}`,
    `Max-Age=${YEAR_SECONDS}`,
  ];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}

export function clearCookie(env) {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=${sameSite(env)}; Max-Age=0`;
}

export function readCookie(request, name = COOKIE) {
  const raw = request.headers.get("cookie") ?? "";
  const hit = raw.split(/;\s*/).find((c) => c.startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null;
}

/* ------------------------------------------------------------------ *
 * The door
 * ------------------------------------------------------------------ */

/**
 * The connectome id for this request, or null if the caller may not address one.
 *
 * Order matters. A valid signed cookie wins everywhere, including locally, so a
 * paired browser behaves identically in both environments. Only after that does
 * the local escape hatch apply — and outside `ENVIRONMENT=local` there is no
 * escape hatch at all: `?cx=`, `x-connectome-id`, an unsigned cookie and the
 * "local-dev" default are all refused.
 */
export async function connectomeId(env, request) {
  const signed = await verifyToken(env, readCookie(request));
  if (signed) return signed;
  if (!isLocal(env)) return null;
  const url = new URL(request.url);
  return (
    url.searchParams.get("cx") ||
    request.headers.get("x-connectome-id") ||
    readCookie(request) ||
    "local-dev"
  );
}

/* ------------------------------------------------------------------ *
 * helpers
 * ------------------------------------------------------------------ */

function utf8(s) {
  return new TextEncoder().encode(s);
}

function hmacKey(secret) {
  return crypto.subtle.importKey("raw", utf8(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(text) {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  const padded = text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "=");
  try {
    const bin = atob(padded);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}
