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
      if (request.method === "OPTIONS") return apiPreflight(request);
      const denied = hubJoinDenied(request);
      if (denied) return denied;
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("expected websocket", { status: 426 });
      }
      return hub(env, request).fetch(request);
    }

    // HTTP: graph sync and the consent ledger. Join door is Origin, not *.
    if (url.pathname.startsWith("/api/")) {
      if (request.method === "OPTIONS") return apiPreflight(request);
      const denied = apiJoinDenied(request);
      if (denied) return denied;
      if (url.pathname === "/api/declare" && request.method === "POST") {
        const body = await request.json().catch(() => null);
        let found;
        if (body?.identity && body?.origin) {
          found = { ok: true, record: body };
        } else {
          found = await fetchManifest(body?.origin);
        }
        if (!found.ok) {
          return withCors(request, json({ ok: false, error: found.error }, found.status));
        }
        const target = new URL(request.url);
        target.pathname = "/do/declare";
        const res = await hub(env, request).fetch(
          new Request(target, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(found.record),
          })
        );
        return withCors(request, res);
      }
      const doPath = url.pathname.replace(/^\/api\//, "/do/");
      const target = new URL(request.url);
      target.pathname = doPath;
      const res = await hub(env, request).fetch(new Request(target, request));
      return withCors(request, res);
    }

    return new Response("not found", { status: 404 });
  },
};

/**
 * One Durable Object per user.
 *
 * Local dev uses a fixed name. In production this is where Cloudflare Access or
 * a Turnstile-gated pairing token belongs, so that knowing an id is not the same
 * as being allowed to join someone's connectome (GrokVisionResponse.md §4.5).
 * A connectome is a set of the user's own signed-in sessions; it must never be
 * addressable by guessing.
 */
function hub(env, request) {
  const url = new URL(request.url);
  const who =
    url.searchParams.get("cx") ||
    request.headers.get("x-connectome-id") ||
    cookie(request, "cx") ||
    "local-dev";
  return env.HUB.get(env.HUB.idFromName(who));
}

function cookie(request, name) {
  const raw = request.headers.get("cookie") ?? "";
  const hit = raw.split(/;\s*/).find((c) => c.startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null;
}

function hubJoinDenied(request) {
  const origin = request.headers.get("Origin");
  if (!isAllowedOrigin(origin)) {
    return new Response("origin not allowed", { status: 403 });
  }
  return null;
}

function apiJoinDenied(request) {
  const origin = request.headers.get("Origin");
  if (origin) {
    return isAllowedApiOrigin(origin) ? null : new Response("origin not allowed", { status: 403 });
  }
  if (request.method !== "GET") {
    return new Response("origin required", { status: 403 });
  }
  return null;
}

function apiPreflight(request) {
  const origin = request.headers.get("Origin");
  if (!isAllowedApiOrigin(origin)) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type,x-connectome-id",
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

function withCors(request, res) {
  const origin = request.headers.get("Origin");
  const headers = new Headers(res.headers);
  if (isAllowedApiOrigin(origin)) {
    headers.set("access-control-allow-origin", origin);
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
