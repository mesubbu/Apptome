/**
 * The join door (T1.5). Identity is the Origin header, not ?origin= / ?role=.
 *
 * Origins are ENVIRONMENT-DRIVEN, so the same code is the localhost mesh and a
 * real zone. `env.ALLOWED_ORIGINS` is a comma-separated list of spoke origins;
 * `env.SURFACE_ORIGIN` is the hub UI. When both are unset the local mesh values
 * below apply, so `pnpm dev` still needs no configuration.
 *
 * The vars REPLACE the defaults rather than extending them. A production
 * gateway must not carry localhost on its allowlist just because it inherited
 * it, and an operator who lists three origins has said what the allowlist is.
 *
 * T6.2 adds chrome-extension://<EXT_ID> to /api/* only. Not here. Not /hub.
 * Spokes join /hub (they are WebSocket clients). They do not call /api/* —
 * that door is the surface and the extension, because a listed spoke Origin
 * plus a SameSite=Lax pairing cookie is otherwise graph-admin (FlashSay2ndPass N2).
 * T3.3's hostile stub is a fourth origin and must stay off this list — it is
 * absent from the defaults, and nothing here can add it back.
 */

/** The local mesh. Used only when the vars are unset. */
export const DEFAULT_SURFACE_ORIGIN = "http://localhost:8790";
export const DEFAULT_SPOKE_ORIGINS = [
  "http://localhost:8787",
  "http://localhost:8788",
  "http://localhost:8789",
];

/**
 * Pinned unpacked id (manifest `key`). /api/* only, never /hub.
 *
 * Deliberately NOT env-driven. The pin is the security property: an attacker who
 * can name the extension id can otherwise mint himself a hub-privileged origin.
 * Changing it is a code change and a code review, not a deploy-time var.
 */
export const EXTENSION_ORIGIN = "chrome-extension://emdpceafindjgkgpgajjapoeklpjkogo";

export function surfaceOrigin(env) {
  return normalise(env?.SURFACE_ORIGIN) ?? DEFAULT_SURFACE_ORIGIN;
}

/**
 * The surface is always on its own allowlist. It is a *client* of /hub, not
 * merely the thing /hub serves — leaving it out locks the hub UI out of the hub.
 * So it is appended here rather than trusted to appear in the operator's list.
 */
export function allowedOrigins(env) {
  const configured = parseList(env?.ALLOWED_ORIGINS);
  const spokes = configured.length ? configured : DEFAULT_SPOKE_ORIGINS;
  return unique([...spokes, surfaceOrigin(env)]);
}

export function isAllowedOrigin(origin, env) {
  return Boolean(origin) && allowedOrigins(env).includes(origin);
}

export function isAllowedApiOrigin(origin, env) {
  return origin === surfaceOrigin(env) || origin === EXTENSION_ORIGIN;
}

/** Bound at the socket. Query-param role is not authority. */
export function roleForOrigin(origin, env) {
  return origin === surfaceOrigin(env) ? "surface" : "spoke";
}

function parseList(raw) {
  if (typeof raw !== "string") return [];
  return unique(raw.split(",").map((entry) => normalise(entry)));
}

/**
 * An allowlist entry is an ORIGIN. `new URL(...).origin` is the whole check:
 * it drops any path, query or fragment a misconfigured var carried in, and
 * returns null for anything unparseable rather than admitting the raw string.
 * A comparison against a half-parsed value is how allowlists get bypassed.
 */
function normalise(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const { origin } = new URL(trimmed);
    return origin === "null" ? null : origin;
  } catch {
    return null;
  }
}

function unique(list) {
  return [...new Set(list.filter(Boolean))];
}
