/**
 * Mapper Worker.
 *
 * POST /map: schema-only correspondence. Values never arrive; assertNoValues
 * is re-run here so a compromised or buggy client cannot smuggle them in.
 * GET /health. CORS for the surface origin only.
 *
 * TWO MAPPERS, ONE INTERFACE. `llm-mapper.js` runs Workers AI behind AI Gateway
 * and returns null whenever it cannot answer safely — no `env.AI` binding, model
 * error, or a reply that fails validation. `static-mapper.js` is deterministic
 * and always answers. So the LLM can only ever raise the floor, never lower it,
 * and an account with no AI binding behaves exactly as it did before.
 *
 * The hub still imports no model runtime (GrokVision.md §3.2) — it knows a
 * binding name and an HTTPS endpoint. `env.AI.run()` is request-scoped: it runs
 * because a user opened a confirm card, and nothing schedules it (§10).
 */

import { assertNoValues } from "../../../packages/protocol/protocol.js";
import { map as staticMap } from "./static-mapper.js";
import { map as llmMap } from "./llm-mapper.js";

/**
 * The one origin allowed to ask for a mapping. Environment-driven, so the same
 * Worker serves the local mesh and a real zone; the localhost value applies only
 * when `env.SURFACE_ORIGIN` is unset, which is how `pnpm dev` stays zero-config.
 *
 * This stays a single origin rather than a list. `/map` answers the hub UI and
 * nothing else — a spoke that could reach it directly would be a second door.
 */
const DEFAULT_SURFACE_ORIGIN = "http://localhost:8790";

function surfaceOrigin(env) {
  const raw = env?.SURFACE_ORIGIN;
  if (typeof raw !== "string" || !raw.trim()) return DEFAULT_SURFACE_ORIGIN;
  try {
    const { origin } = new URL(raw.trim());
    return origin === "null" ? DEFAULT_SURFACE_ORIGIN : origin;
  } catch {
    return DEFAULT_SURFACE_ORIGIN;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return preflight(request, env);

    if (url.pathname === "/health" && request.method === "GET") {
      return json({ ok: true, service: "connectome-mapper" }, 200, env);
    }

    if (url.pathname === "/map" && request.method === "POST") {
      const denied = corsDenied(request, env);
      if (denied) return denied;
      return handleMap(request, env);
    }

    return json({ ok: false, error: "not found" }, 404, env);
  },
};

async function handleMap(request, env) {
  let req;
  try {
    req = await request.json();
  } catch {
    return json({ ok: false, error: "body must be JSON" }, 400, env);
  }

  if (!req || typeof req !== "object" || !Array.isArray(req.source?.fields)) {
    return json({ ok: false, error: "source.fields required" }, 400, env);
  }

  try {
    assertNoValues(req);
  } catch (err) {
    return json({ ok: false, error: String(err?.message ?? err) }, 400, env);
  }

  // The guard above has already run, and llm-mapper runs it again itself before
  // it touches env.AI. Two independent asserts, because the one that matters is
  // the one living in the same file as the model call.
  const result = (await llmMap(req, env)) ?? (await staticMap(req, env));
  return json(result, 200, env);
}

function corsDenied(request, env) {
  const origin = request.headers.get("origin");
  // curl / same-machine checks have no Origin. A browser always sends one.
  if (origin && origin !== surfaceOrigin(env)) {
    return json({ ok: false, error: "origin not allowed" }, 403, env);
  }
  return null;
}

function preflight(request, env) {
  const origin = request.headers.get("origin");
  if (origin && origin !== surfaceOrigin(env)) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, {
    status: 204,
    headers: corsHeaders(env),
  });
}

function corsHeaders(env) {
  return {
    "access-control-allow-origin": surfaceOrigin(env),
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "600",
  };
}

function json(body, status = 200, env) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...corsHeaders(env),
    },
  });
}
