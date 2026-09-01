/**
 * The DEFAULT mapper. Deterministic, no model, no network, no state.
 *
 * It sees field NAMES and TYPES only — never a value (GrokVisionResponse.md E3).
 * It proposes correspondences; the caller applies them to the real payload on
 * the user's device and the user still confirms the exact JSON (GrokVision.md
 * §6.2). So a wrong proposal here is a visible annoyance, never a silent write.
 *
 * Strategy, in rounds, so an exact match can never be stolen by another target
 * field's synonym:
 *   1  exact path match
 *   2  same name, different capitalisation
 *   3  synonym table (see below)
 *   4  type-compatible lone candidate, OPTIONAL fields only
 *   5  give up -> `unmapped`, with a reason a human can read
 */

/**
 * PER-EDGE CONVENIENCE. NOT A CANONICAL OBJECT MODEL.
 *
 * This is a short list of field-name coincidences that are genuinely common in
 * the wild. It is a shortcut for one edge at a time and nothing else. It must
 * NEVER become an admission requirement, a shared ontology, a catalog an app
 * has to speak in order to join, or a registry anyone curates — GrokVision.md
 * §10 rejects both "Canonical Business Objects as the language of join" and
 * "Top-N mapping profiles as admission". If this table ever grows a governance
 * process, an owner, or a version number, it has become the rejected product
 * and should be deleted instead.
 */
const SYNONYMS = [
  ["name", "customername", "clientname", "title", "label"],
  ["email", "customeremail"],
  ["amount", "total", "rate", "billablerate"],
  ["currency", "curr"],
  ["memo", "note", "description", "summary"],
  ["id", "clientid", "customerid"],
];

/**
 * Same interface as llm-mapper.js, so the two are swappable at the call site.
 *
 * This one is the FALLBACK and always answers; llm-mapper.js returns null when
 * it cannot answer safely. index.js resolves llm first, static second.
 */
export async function map(request, _env) {
  const fields = (request?.source?.fields ?? []).map((f) => ({
    path: String(f.path),
    type: String(f.type),
    leaf: norm(String(f.path).split(".").pop()),
  }));
  const props = request?.target?.schema?.properties ?? {};
  const required = new Set(request?.target?.required ?? request?.target?.schema?.required ?? []);
  const targets = Object.keys(props);

  const mapping = {};
  /** A source field feeds at most one target field: duplicating it is never a match, it is a guess. */
  const claimed = new Set();
  let open = targets;

  for (const round of ROUNDS) {
    const still = [];
    for (const field of open) {
      const hit = round.pick(field, props[field], fields, claimed, required);
      if (!hit) {
        still.push(field);
        continue;
      }
      claimed.add(hit.field.path);
      mapping[field] = { from: hit.field.path, confidence: round.confidence, why: hit.why };
    }
    open = still;
  }

  // Named refusals. The confirm card can say WHY a field is empty, which is the
  // difference between "we had nothing" and "we quietly guessed".
  for (const field of open) {
    mapping[field] = {
      from: null,
      confidence: 0,
      why: required.has(field)
        ? "no source field justifies this, and it is required — you have to type it"
        : "nothing in the source resembles this; left empty on purpose",
    };
  }

  const matched = targets.length - open.length;
  return {
    mapping,
    unmapped: open,
    mapper: "static",
    notes: `matched ${matched}/${targets.length} target fields by name; ${open.length} need a human`,
  };
}

const ROUNDS = [
  { confidence: 1, pick: pickExact },
  { confidence: 0.9, pick: pickCaseInsensitive },
  { confidence: 0.7, pick: pickSynonym },
  { confidence: 0.35, pick: pickLoneType },
];

function pickExact(field, spec, fields, claimed) {
  const f = fields.find((c) => c.path === field && !claimed.has(c.path) && typeOk(spec, c));
  return f ? { field: f, why: `the source calls it "${f.path}" too` } : null;
}

function pickCaseInsensitive(field, spec, fields, claimed) {
  const want = field.toLowerCase();
  const f = fields.find(
    (c) => c.path.toLowerCase() === want && !claimed.has(c.path) && typeOk(spec, c)
  );
  return f ? { field: f, why: `same name as "${field}", different capitalisation` } : null;
}

function pickSynonym(field, spec, fields, claimed) {
  const wanted = norm(field);
  const group = groupOf(wanted);
  if (group < 0) return null;
  const candidates = fields
    .filter((c) => !claimed.has(c.path) && groupOf(c.leaf) === group && typeOk(spec, c))
    .sort((a, b) => rank(a, wanted) - rank(b, wanted) || a.path.localeCompare(b.path));
  if (candidates.length === 0) return null;
  const [f] = candidates;
  const others = candidates.slice(1).map((c) => c.path);
  const why = `"${f.path}" is a common alias for "${field}"`;
  return { field: f, why: others.length ? `${why} (also possible: ${others.join(", ")})` : why };
}

/**
 * Last resort, and deliberately timid: only when the target field is OPTIONAL,
 * and only when the type leaves exactly one possibility in the whole source.
 * Guessing on a REQUIRED field is precisely where a wrong guess turns into a
 * bad write, so a required field with no justification is reported as unmapped
 * instead — GrokVision.md §8 test 6, the user is the connector, not us.
 */
function pickLoneType(field, spec, fields, claimed, required) {
  if (required.has(field)) return null;
  const compatible = fields.filter((c) => typeOk(spec, c));
  if (compatible.length !== 1) return null;
  const [f] = compatible;
  if (claimed.has(f.path)) return null;
  return { field: f, why: `the only ${f.type} field the source offers, so nothing else could fit` };
}

/** JSON Schema type vs the `typeof` we got from describeShape(). Never coerces. */
function typeOk(spec, field) {
  const want = spec?.type;
  if (!want) return true;
  if (want === field.type) return true;
  return want === "integer" && field.type === "number";
}

function norm(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function groupOf(normalised) {
  return SYNONYMS.findIndex((g) => g.includes(normalised));
}

function rank(field, wanted) {
  return field.leaf === wanted ? 0 : 1;
}
