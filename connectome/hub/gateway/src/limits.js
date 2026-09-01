/**
 * Rate limiting for the gateway doors.
 *
 * REVIEW.md G6: `/hub`, `/api/*` and `/map` were unmetered. On localhost
 * behind a four-origin allowlist that is fine; on a public hostname `/api/pair`
 * is a free id-minting endpoint and `/map` is a free Workers AI endpoint.
 *
 * Keyed by CONNECTOME ID, not IP, so a shared NAT does not throttle a whole
 * office. Before pairing there is no id — then the key is the already-
 * allowlisted Origin. CF-Connecting-IP is never the key.
 *
 * Rejections are a NAMED refusal (`RATE_LIMITED`), not a silent drop and not
 * `DEGRADED`. GrokVision.md §6.2: stop, show what ran. This is a door code,
 * not a protocol FAILURE — same reason PAIRING_REQUIRED lives outside that
 * taxonomy. Nothing was written; nothing was attempted.
 *
 * Degrades rather than fails: a missing binding, or a limiter that throws,
 * is treated as "allow". Local mesh and an account without the product still
 * work (REVIEW.md Part 2).
 */

import { connectomeId } from "./pairing.js";

export const RATE_LIMITED = "RATE_LIMITED";

export async function limitKey(env, request) {
  const who = await connectomeId(env, request);
  if (who) return who;
  const origin = request.headers.get("Origin") || request.headers.get("origin");
  return origin || "anon";
}

/**
 * @returns {Promise<Response|null>} a 429 to return, or null to proceed.
 */
export async function enforceLimit(env, key, binding = "RATE_LIMIT") {
  const limiter = env?.[binding];
  if (!limiter || typeof limiter.limit !== "function") return null;
  let success = true;
  try {
    const verdict = await limiter.limit({ key: String(key) });
    success = verdict?.success !== false;
  } catch {
    return null;
  }
  if (success) return null;
  return rateLimitedResponse();
}

export function rateLimitedResponse(retryAfter = 10) {
  return new Response(
    JSON.stringify({
      ok: false,
      code: RATE_LIMITED,
      error: "too many requests from this connectome; wait a moment and try again",
    }),
    {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": String(retryAfter),
      },
    }
  );
}
