/**
 * Mapper Worker.
 *
 * POST /map: schema-only correspondence. Values never arrive; assertNoValues
 * is re-run here so a compromised or buggy client cannot smuggle them in.
 * GET /health. CORS for the surface origin only.
 *
 * Do not import a model runtime. Do not write src/llm-mapper.js here.
 */

import { assertNoValues } from "../../../packages/protocol/protocol.js";
import { map } from "./static-mapper.js";

const SURFACE_ORIGIN = "http://localhost:8790";

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return preflight(request);

    if (url.pathname === "/health" && request.method === "GET") {
      return json({ ok: true, service: "connectome-mapper" });
    }

    if (url.pathname === "/map" && request.method === "POST") {
      const denied = corsDenied(request);
      if (denied) return denied;
      return handleMap(request);
    }

    return json({ ok: false, error: "not found" }, 404);
  },
};

async function handleMap(request) {
  let req;
  try {
    req = await request.json();
  } catch {
    return json({ ok: false, error: "body must be JSON" }, 400);
  }

  if (!req || typeof req !== "object" || !Array.isArray(req.source?.fields)) {
    return json({ ok: false, error: "source.fields required" }, 400);
  }

  try {
    assertNoValues(req);
  } catch (err) {
    return json({ ok: false, error: String(err?.message ?? err) }, 400);
  }

  const result = await map(req);
  return json(result);
}

function corsDenied(request) {
  const origin = request.headers.get("origin");
  // curl / same-machine checks have no Origin. A browser always sends one.
  if (origin && origin !== SURFACE_ORIGIN) {
    return json({ ok: false, error: "origin not allowed" }, 403);
  }
  return null;
}

function preflight(request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== SURFACE_ORIGIN) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

function corsHeaders() {
  return {
    "access-control-allow-origin": SURFACE_ORIGIN,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "600",
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...corsHeaders(),
    },
  });
}
