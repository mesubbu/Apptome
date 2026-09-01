/**
 * Mapper metrics. Match and refusal rates, never a field name, never a value.
 *
 * The mapper wrangler comment named this metric before any datapoint existed
 * (REVIEW.md G9). A consent product that cannot show its refusal rate cannot
 * evidence its central claim.
 *
 * The hashed edge is `source.origin->target.origin`. Field paths, `why` text
 * and `unmapped` names stay in the JSON the surface already has; they do not
 * enter Analytics Engine.
 */

export async function hashBlob(value) {
  if (value == null || value === "") return "";
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
  const hex = [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, 32);
}

export async function mapDataPoint(result, request) {
  const edge = `${request?.source?.origin ?? ""}->${request?.target?.origin ?? ""}`;
  const edgeHash = await hashBlob(edge);
  const unmapped = Array.isArray(result?.unmapped) ? result.unmapped.length : 0;
  const targets = Object.keys(result?.mapping ?? {}).length || unmapped;
  const matched = Math.max(0, targets - unmapped);
  return {
    blobs: [String(result?.mapper ?? "static"), edgeHash, unmapped ? "partial" : "matched"],
    doubles: [matched, unmapped],
    indexes: [edgeHash],
  };
}

export function writeMetric(binding, point) {
  try {
    binding?.writeDataPoint?.(point);
  } catch {
    /* degrade */
  }
}

export async function emitMapMetric(env, result, request) {
  const point = await mapDataPoint(result, request);
  writeMetric(env?.METRICS, point);
  return point;
}
