/**
 * Rate limiting for POST /map.
 *
 * Same contract as hub/gateway/src/limits.js: named `RATE_LIMITED` refusal,
 * keyed without using the client IP, degrade on a missing or throwing binding.
 * The mapper never sees the pairing cookie (different origin), so the key is
 * the already-allowlisted surface Origin — one bucket per hub UI, not per NAT.
 */

export const RATE_LIMITED = "RATE_LIMITED";

export function limitKey(request) {
  return request.headers.get("origin") || request.headers.get("Origin") || "anon";
}

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
      error: "too many mapping requests; fill the fields yourself or wait a moment",
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
