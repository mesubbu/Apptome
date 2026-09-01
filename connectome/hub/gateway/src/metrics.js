/**
 * Audit metrics. Metadata only.
 *
 * REVIEW.md G9: observability was enabled and nothing was measured. The honest
 * metrics for a consent product are per-edge match and refusal rates
 * (GrokVisionResponse.md §4.5). HubDO.#audit already receives (kind, edge,
 * outcome, bytes) and already carries "Never args, never results."
 *
 * Blobs carry a HASHED edge, not the raw `source→target` origin pair, and
 * never a field name, never a value. Analytics Engine failure degrades:
 * the SQLite row is the source of truth the user can still export; a down
 * dataset must not fail a relay.
 *
 * writeDataPoint is fire-and-forget (void, not a Promise). Do not await it.
 */

/** Rolling cap for the per-DO audit table. recentAudit() reads 100; we keep a little more. */
export const AUDIT_KEEP = 200;

export function auditWatermark(maxId, keep = AUDIT_KEEP) {
  const max = Number(maxId) || 0;
  const cap = Number(keep) || AUDIT_KEEP;
  return max > cap ? max - cap : 0;
}

export async function hashBlob(value) {
  if (value == null || value === "") return "";
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
  const hex = [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, 32);
}

/**
 * Shape written to Analytics Engine. Callers must not add field names.
 *
 * blob1 = kind, blob2 = hashed edge, blob3 = outcome
 * double1 = bytes
 * index1 = hashed Durable Object id (per-user, not the connectome name)
 */
export async function auditDataPoint(kind, edge, outcome, bytes, indexSeed) {
  return {
    blobs: [String(kind ?? ""), await hashBlob(edge ?? ""), String(outcome ?? "")],
    doubles: [Number(bytes) || 0],
    indexes: [await hashBlob(indexSeed ?? "")],
  };
}

export function writeMetric(binding, point) {
  try {
    binding?.writeDataPoint?.(point);
  } catch {
    /* degrade */
  }
}

export async function emitAuditMetric(env, indexSeed, kind, edge, outcome, bytes) {
  const point = await auditDataPoint(kind, edge, outcome, bytes, indexSeed);
  writeMetric(env?.METRICS, point);
  return point;
}
