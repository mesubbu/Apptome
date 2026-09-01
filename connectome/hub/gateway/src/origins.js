/**
 * Local-dev join door (T1.5). Identity is the Origin header, not ?origin= / ?role=.
 *
 * T6.2 may add chrome-extension://<EXT_ID> to /api/* only. Not here. Not /hub.
 * T3.3's hostile stub is a fourth origin and must stay off this list.
 */

export const SURFACE_ORIGIN = "http://localhost:8790";

/** Pinned unpacked id (manifest `key`). /api/* only, never /hub. */
export const EXTENSION_ORIGIN = "chrome-extension://emdpceafindjgkgpgajjapoeklpjkogo";

export const ALLOWED_ORIGINS = [
  "http://localhost:8787",
  "http://localhost:8788",
  "http://localhost:8789",
  SURFACE_ORIGIN,
];

export function isAllowedOrigin(origin) {
  return Boolean(origin) && ALLOWED_ORIGINS.includes(origin);
}

export function isAllowedApiOrigin(origin) {
  return isAllowedOrigin(origin) || origin === EXTENSION_ORIGIN;
}

/** Bound at the socket. Query-param role is not authority. */
export function roleForOrigin(origin) {
  return origin === SURFACE_ORIGIN ? "surface" : "spoke";
}
