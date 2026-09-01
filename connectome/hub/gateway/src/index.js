/**
 * Gateway Worker.
 *
 * Two jobs, and deliberately no others:
 *
 *   1. Serve the page bridge. In production Cloudflare's WebMCP edge injection
 *      puts a <script> tag for /.webmcp/boot.js into a participating origin's
 *      HTML with no origin code change. Here the stub apps carry that one tag
 *      themselves, which is the same thing done by hand.
 *
 *   2. Route to the per-user HubDO — the connectome graph.
 *
 * It holds no state, makes no decisions, and never touches a payload.
 */

import { HubDO } from "./hub-do.js";
import { isAllowedOrigin, isAllowedApiOrigin } from "./origins.js";
import {
  clearCookie,
  connectomeId,
  isLocal,
  mintToken,
  pairCookie,
  pairingConfigured,
  verifyTurnstile,
} from "./pairing.js";

import protocolSrc from "./vendor/protocol.js.txt";
import bridgeSrc from "./vendor/bridge.js.txt";
import polyfillSrc from "./vendor/webmcp-polyfill.js.txt";

export { HubDO };

/**
 * One line, and an app is a member. This is what Cloudflare injects at the edge.
 *
 * `document.currentScript` is null inside a module, which is why autoStart()
 * looks the tag up by its data attribute instead.
 */
const BOOT_SRC = `import { autoStart } from "/.webmcp/bridge.js";\nawait autoStart();\n`;

const JS_FILES = {
  "/.webmcp/boot.js": BOOT_SRC,
  "/.webmcp/bridge.js": bridgeSrc,
  "/.webmcp/webmcp-polyfill.js": polyfillSrc,
  // bridge.js imports "../protocol/protocol.js", which resolves here.
  "/protocol/protocol.js": protocolSrc,
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      if (request.method === "OPTIONS") return starPreflight();
      return json({ ok: true, service: "connectome-gateway" });
    }

    const js = JS_FILES[url.pathname];
    if (js) {
      if (request.method === "OPTIONS") return starPreflight();
      return new Response(js, {
        headers: {
          "content-type": "text/javascript; charset=utf-8",
          // The bridge is loaded cross-origin by every spoke, exactly as an
          // edge-injected script would be. It carries no credentials and no
          // secrets, so `*` is correct rather than lazy.
          "access-control-allow-origin": "*",
          "cache-control": "no-store",
        },
      });
    }

    // WebSocket: edge transport. A spoke's bridge, or the surface, joining the graph.
    if (url.pathname === "/hub") {
      if (request.method === "OPTIONS") return apiPreflight(request, env);
      const denied = hubJoinDenied(request, env);
      if (denied) return denied;
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("expected websocket", { status: 426 });
      }
      const stub = await hub(env, request);
      if (!stub) return new Response("pairing required", { status: 401 });
      return stub.fetch(request);
    }

    // HTTP: graph sync and the consent ledger. Join door is Origin, not *.
    if (url.pathname.startsWith("/api/")) {
      if (request.method === "OPTIONS") return apiPreflight(request, env);
      const denied = apiJoinDenied(request, env);
      if (denied) return denied;

      // The pairing door itself. It must be reachable BEFORE a connectome id
      // exists, so it is handled ahead of every id-gated route below.
      if (url.pathname === "/api/pair") {
        return withCors(request, await pairRoute(request, env), env);
      }

      if (url.pathname === "/api/declare" && request.method === "POST") {
        const stub = await hub(env, request);
        if (!stub) return withCors(request, pairingRequired(env), env);
        const body = await request.json().catch(() => null);
        let found;
        if (body?.identity && body?.origin) {
          found = { ok: true, record: body };
        } else {
          found = await fetchManifest(body?.origin);
        }
        if (!found.ok) {
          return withCors(request, json({ ok: false, error: found.error }, found.status), env);
        }
        const target = new URL(request.url);
        target.pathname = "/do/declare";
        const res = await stub.fetch(
          new Request(target, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(found.record),
          })
        );
        return withCors(request, res, env);
      }
      const stub = await hub(env, request);
      if (!stub) return withCors(request, pairingRequired(env), env);
      const doPath = url.pathname.replace(/^\/api\//, "/do/");
      const target = new URL(request.url);
      target.pathname = doPath;
      const res = await stub.fetch(new Request(target, request));
      return withCors(request, res, env);
    }

    return new Response("not found", { status: 404 });
  },
};

/**
 * One Durable Object per user, or null if the caller may not address one.
 *
 * This used to take the DO name from `?cx=`, an `x-connectome-id` header, or an
 * unsigned cookie, defaulting to "local-dev" — so knowing an id was the same as
 * being that user (GrokVisionResponse.md §4.5, REVIEW.md G1). Now the id must be
 * one this gateway minted and signed. `src/pairing.js` is the whole door;
 * outside ENVIRONMENT=local there is no unauthenticated path to a graph.
 *
 * Null is a refusal, not an error. Callers turn it into 401 + PAIRING_REQUIRED
 * so the surface can offer the challenge instead of showing a dead panel.
 */
async function hub(env, request) {
  const who = await connectomeId(env, request);
  return who ? env.HUB.get(env.HUB.idFromName(who)) : null;
}

/**
 * A named refusal, not a blank 401. GrokVision.md §6.2 forbids silent failure;
 * the surface renders `code` as the pairing prompt.
 */
function pairingRequired(env) {
  return json(
    {
      ok: false,
      code: "PAIRING_REQUIRED",
      error: pairingConfigured(env)
        ? "this browser is not paired with a connectome yet"
        : "pairing is not configured on this gateway",
    },
    401
  );
}

/**
 * GET  /api/pair — is this browser paired, and which site key should the widget
 *                  use? The site key is public by design; the SECRET half never
 *                  leaves the Worker.
 * POST /api/pair — verify the challenge, mint a connectome, set the cookie.
 *
 * Request-scoped and human-present: it runs because someone clicked a checkbox.
 * It authorises addressing your own graph and nothing else — no write, no
 * standing permission. GrokVision.md §10's "Global 'allow this agent'" is a
 * different thing and is still rejected; consent stays per-edge.
 */
async function pairRoute(request, env) {
  if (request.method === "GET") {
    return json({
      ok: true,
      paired: Boolean(await connectomeId(env, request)),
      required: !isLocal(env),
      configured: pairingConfigured(env),
      siteKey: env?.TURNSTILE_SITE_KEY ?? null,
    });
  }

  // Exit is part of consent design (GrokVisionResponse.md Gap 10). Dropping the
  // cookie does not delete the graph — /api/forget does that — it detaches this
  // browser from it, which is the reversible half.
  if (request.method === "DELETE") {
    const res = json({ ok: true, paired: false });
    res.headers.set("set-cookie", clearCookie(env));
    return res;
  }

  if (request.method !== "POST") {
    return json({ ok: false, error: "method not allowed" }, 405);
  }

  if (!pairingConfigured(env)) {
    // Fail loudly. A gateway that cannot verify a challenge must not hand out
    // connectome ids, and must not look like it succeeded.
    return json(
      { ok: false, code: "PAIRING_UNCONFIGURED", error: "pairing is not configured on this gateway" },
      503
    );
  }

  const body = await request.json().catch(() => null);
  const verdict = await verifyTurnstile(env, body?.token, request.headers.get("CF-Connecting-IP"));
  if (!verdict.ok) {
    return json({ ok: false, code: "CHALLENGE_FAILED", error: verdict.error }, 403);
  }

  const token = await mintToken(env);
  if (!token) {
    return json({ ok: false, code: "PAIRING_UNCONFIGURED", error: "no signing key" }, 503);
  }

  const res = json({ ok: true, paired: true });
  res.headers.set("set-cookie", pairCookie(env, token));
  return res;
}

function hubJoinDenied(request, env) {
  const origin = request.headers.get("Origin");
  if (!isAllowedOrigin(origin, env)) {
    return new Response("origin not allowed", { status: 403 });
  }
  return null;
}

function apiJoinDenied(request, env) {
  const origin = request.headers.get("Origin");
  if (origin) {
    return isAllowedApiOrigin(origin, env)
      ? null
      : new Response("origin not allowed", { status: 403 });
  }
  if (request.method !== "GET") {
    return new Response("origin required", { status: 403 });
  }
  return null;
}

function apiPreflight(request, env) {
  const origin = request.headers.get("Origin");
  if (!isAllowedApiOrigin(origin, env)) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
      "access-control-allow-headers": "content-type,x-connectome-id",
      // The pairing cookie is the connectome id. Without this the browser drops
      // it on every cross-origin call and a paired user looks unpaired.
      // Safe only because the origin is echoed from the allowlist, never `*`.
      "access-control-allow-credentials": "true",
      "access-control-max-age": "600",
      vary: "Origin",
    },
  });
}

function starPreflight() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,OPTIONS",
      "access-control-max-age": "600",
    },
  });
}

function withCors(request, res, env) {
  const origin = request.headers.get("Origin");
  const headers = new Headers(res.headers);
  if (isAllowedApiOrigin(origin, env)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-credentials", "true");
    headers.set("vary", "Origin");
  }
  return new Response(res.body, { status: res.status, headers });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * T4.3: user typed an origin. We fetch its poster. We do not invent a name.
 * credentials omitted — this is a public well-known file, not a session.
 */
async function fetchManifest(originRaw) {
  let origin;
  try {
    origin = new URL(String(originRaw ?? "")).origin;
  } catch {
    return { ok: false, status: 400, error: "that is not an origin" };
  }
  if (!/^https?:$/.test(new URL(origin).protocol)) {
    return { ok: false, status: 400, error: "origin must be http or https" };
  }
  let res;
  try {
    res = await fetch(new URL("/.well-known/connectome.json", origin), { redirect: "error" });
  } catch {
    return {
      ok: false,
      status: 404,
      error: "no connectome.json at that origin — we don't invent a name",
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      status: 404,
      error: "no connectome.json at that origin — we don't invent a name",
    };
  }
  let jsonBody;
  try {
    jsonBody = await res.json();
  } catch {
    return { ok: false, status: 400, error: "that origin published something that is not a manifest" };
  }
  return {
    ok: true,
    record: {
      origin,
      identity: {
        name: typeof jsonBody.name === "string" ? jsonBody.name.slice(0, 60) : null,
        icon: typeof jsonBody.icon === "string" ? jsonBody.icon.slice(0, 300) : null,
        launch: sameOriginOnly(jsonBody.launch, origin),
      },
      capabilities: posterCapabilities(jsonBody.capabilities),
    },
  };
}

function sameOriginOnly(url, origin) {
  try {
    const u = new URL(url, origin);
    return u.origin === origin ? u.toString() : null;
  } catch {
    return null;
  }
}

function posterCapabilities(list) {
  if (!Array.isArray(list)) return [];
  return list
    .slice(0, 50)
    .map((c) => ({
      name: String(c?.name ?? ""),
      description: String(c?.summary ?? c?.description ?? ""),
      inputSchema: { type: "object", properties: {} },
      readOnly: c?.write === false,
      untrusted: false,
    }))
    .filter((c) => c.name);
}
