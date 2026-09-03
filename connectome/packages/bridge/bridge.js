/**
 * Connectome page bridge.
 *
 * Runs in a spoke's own page, in the page's own world. One file, two transports
 * (GrokVisionResponse.md §4.3):
 *
 *   TRANSPORT.EDGE       loaded by a <script> tag that Cloudflare injects at the
 *                        edge as /.webmcp/bridge.js. Holds its own WebSocket to
 *                        the per-user Durable Object. Zero install.
 *   TRANSPORT.EXTENSION  injected into the MAIN world by the thin extension at
 *                        document_start. Talks to the extension's content script
 *                        by window.postMessage. Works on ANY origin, which is
 *                        what keeps GrokVision.md §1.3 ("any app") true.
 *
 * WHAT THIS FILE MAY NOT DO
 *   - It must not tell the page anything about any other app (§5.5). The member
 *     directory never enters this document. It is rendered inside a cross-origin
 *     iframe the page cannot read (§3.3).
 *   - It must not hold a confirm. The confirm lives in the surface, hub origin.
 *   - It must not invent presence. If a tool is gone, say so and stop (§7.2).
 *
 * THREAT NOTE (honest, because GrokVision.md §3.3 asserts non-spoofability
 * without giving a mechanism — GrokVisionResponse.md Gap 4):
 *   Under the extension transport, page <-> content-script messaging uses
 *   window.postMessage, which the host page can both read and forge. That is
 *   accepted, because it grants the page nothing: a forged "run this" message
 *   still terminates at a confirm card rendered inside the hub-origin surface
 *   iframe, which the page cannot draw in, read, or click. The page can start a
 *   proposal. Only the user can approve a write.
 *   Under the edge transport, only a surface-origin session may cause
 *   executeTool. Spoke-to-spoke SEALED is refused at the hub. A forged envelope
 *   from another app does not run a tool.
 */

import { installPolyfill, installTestingSurface } from "./webmcp-polyfill.js";
import {
  M,
  TRANSPORT,
  FAILURE,
  failure,
  toolDescriptor,
  newId,
  generateSessionKeys,
  exportPublicKey,
  deriveSharedKey,
  seal,
  unseal,
  originOf,
} from "../protocol/protocol.js";

/**
 * Chrome's documented executeTool takes a JSON string. The polyfill and the
 * community IDL take an object. Always stringify first (both Chrome and the
 * polyfill accept that). Retry with the object ONLY when the UA rejected the
 * argument shape — never on a tool that already ran and then threw.
 */
function isExecuteInputError(err) {
  const name = err?.name ?? "";
  const msg = String(err?.message ?? "");
  if (name === "DataError" || name === "SyntaxError") return true;
  return /failed to parse input arguments/i.test(msg);
}

async function executeRegisteredTool(registered, args) {
  const payload = args ?? {};
  const encoded = JSON.stringify(payload);
  try {
    return await document.modelContext.executeTool(registered, encoded);
  } catch (err) {
    if (!isExecuteInputError(err)) throw err;
    return await document.modelContext.executeTool(registered, payload);
  }
}

const SURFACE_FRAME_ID = "connectome-surface-frame";
const BADGE_ID = "connectome-badge";

export class PageBridge {
  /**
   * @param {object} cfg
   * @param {string} cfg.hubUrl      gateway origin, e.g. http://localhost:8791
   * @param {string} cfg.surfaceUrl  surface origin, e.g. http://localhost:8790
   * @param {string} [cfg.transport] TRANSPORT.* — auto-detected when omitted
   */
  constructor(cfg) {
    this.hubUrl = cfg.hubUrl;
    this.surfaceUrl = cfg.surfaceUrl;
    this.transport = cfg.transport ?? detectTransport();
    this.sessionId = newId("sess");
    this.origin = location.origin;
    this.impl = installPolyfill(document);
    installTestingSurface(document);
    this.identity = null;
    this.ws = null;
    /** peer public keys, edge transport only */
    this.keyPair = null;
    this.sharedKeys = new Map();
    /** sessionId -> origin, from PEER_KEYS. Hub-bound, not a field the sender chose. */
    this.peerOrigins = new Map();
    this.connected = false;
  }

  async start() {
    // App identity comes from the origin itself, never from us guessing, and never
    // from tool description text (which is untrusted). GrokVisionResponse.md Gap 3 / E2.
    this.identity = await fetchIdentity(this.origin);

    if (this.transport === TRANSPORT.EDGE) {
      this.keyPair = await generateSessionKeys();
      await this.openSocket();
    } else {
      this.listenToExtension();
    }

    // toolchange is normative in the current draft. A spoke that registers tools
    // late, or drops them on sign-out, must be reflected without polling.
    document.modelContext.addEventListener?.("toolchange", () => this.announce());

    await this.announce();
    this.installBadge();
    window.addEventListener("beforeunload", () => this.send({ t: M.BYE, sessionId: this.sessionId }));
    return this;
  }

  /* ---------------- discovery ---------------- */

  async collectTools() {
    try {
      const tools = await document.modelContext.getTools();
      return { tools: tools.map((t) => toolDescriptor(t, this.origin)), blocked: false };
    } catch (err) {
      // NotAllowedError means Permissions-Policy `tools=()`. That is the app's
      // unilateral opt-out lever. Soft de-membership, not a retry.
      if (err?.name === "NotAllowedError") return { tools: [], blocked: true };
      return { tools: [], blocked: false };
    }
  }

  async announce() {
    const { tools, blocked } = await this.collectTools();
    this.send({
      t: this.connected ? M.TOOLS_CHANGED : M.HELLO,
      sessionId: this.sessionId,
      origin: this.origin,
      transport: this.transport,
      identity: this.identity,
      publicKey: this.keyPair ? await exportPublicKey(this.keyPair) : null,
      impl: this.impl,
      tools,
      blocked,
    });
    this.connected = true;
  }

  /* ---------------- invocation ---------------- */

  /**
   * Run one of THIS app's tools, in THIS document, under THIS origin's session.
   * The hub never runs app logic; it only asks (Master1.md §1.5).
   */
  async handleInvoke(msg) {
    const { callId, toolName, args } = msg;
    const { tools, blocked } = await this.collectTools();
    if (blocked) {
      return this.respond(callId, failure(FAILURE.PERMISSION_BLOCKED, this.origin), msg.from);
    }
    const found = tools.find((t) => t.name === toolName);
    if (!found) {
      return this.respond(callId, failure(FAILURE.TOOL_NOT_FOUND, toolName), msg.from);
    }
    try {
      const registered = (await document.modelContext.getTools()).find((t) => t.name === toolName);
      if (!registered) {
        return this.respond(callId, failure(FAILURE.TOOL_NOT_FOUND, toolName), msg.from);
      }
      let data = await executeRegisteredTool(registered, args ?? {});
      if (typeof data === "string") {
        try { data = JSON.parse(data); } catch {}
      }
      return this.respond(
        callId,
        { ok: true, data, tool: { name: found.name, untrusted: found.untrusted, origin: this.origin } },
        msg.from
      );
    } catch (err) {
      const code = /auth|sign|login|401|403/i.test(String(err?.message)) ? FAILURE.AUTH_REQUIRED : FAILURE.TOOL_FAILED;
      return this.respond(callId, failure(code, String(err?.message ?? err)), msg.from);
    }
  }

  async respond(callId, payload, to) {
    if (this.transport === TRANSPORT.EDGE && to) {
      // Blind relay: the Durable Object must never see this. Seal to the peer.
      const key = this.sharedKeys.get(to);
      if (!key) return this.send({ t: M.INVOKE_RESULT, callId, to, ...failure(FAILURE.HUB_UNAVAILABLE, "no peer key") });
      return this.send({ t: M.SEALED, callId, to, from: this.sessionId, sealed: await seal(key, payload) });
    }
    // Extension transport: the hub is the user's own device. No ciphertext needed.
    return this.send({ t: M.INVOKE_RESULT, callId, sessionId: this.sessionId, ...payload });
  }

  /* ---------------- transports ---------------- */

  send(msg) {
    if (this.transport === TRANSPORT.EDGE) {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
      return;
    }
    // Namespaced so the host page's own postMessage traffic is never confused
    // with ours, and vice versa.
    window.postMessage({ __connectome: "to-hub", msg }, location.origin);
  }

  async openSocket() {
    const url = new URL("/hub", this.hubUrl);
    url.protocol = url.protocol.replace("http", "ws");
    url.searchParams.set("session", this.sessionId);
    this.ws = new WebSocket(url);
    this.ws.addEventListener("message", async (ev) => this.onHubMessage(JSON.parse(ev.data)));
    await new Promise((res, rej) => {
      this.ws.addEventListener("open", res, { once: true });
      this.ws.addEventListener("error", rej, { once: true });
    });
  }

  listenToExtension() {
    window.addEventListener("message", (ev) => {
      if (ev.source !== window) return;
      if (ev.origin !== location.origin) return;
      if (ev.data?.__connectome !== "to-page") return;
      this.onHubMessage(ev.data.msg);
    });
  }

  async onHubMessage(msg) {
    switch (msg?.t) {
      case M.INVOKE:
        // Plaintext INVOKE is the extension path. On the edge path the hub
        // never sends it; a forged one must not run a tool.
        if (this.transport === TRANSPORT.EDGE) return;
        return this.handleInvoke(msg);
      case M.PEER_KEYS: {
        // Public keys only. Deriving here means the DO holds no private key and
        // therefore cannot read a payload it relays (GrokVisionResponse.md §4.2).
        this.peerOrigins = new Map();
        for (const [peer, entry] of Object.entries(msg.keys ?? {})) {
          if (peer === this.sessionId) continue;
          const pub = entry?.publicKey;
          if (entry?.origin) this.peerOrigins.set(peer, entry.origin);
          if (pub && this.keyPair) this.sharedKeys.set(peer, await deriveSharedKey(this.keyPair, pub));
        }
        return;
      }
      case M.SEALED: {
        // T1.6: only the surface origin may cause executeTool. Origin comes
        // from the hub's PEER_KEYS map, not from a field the sender chose.
        const fromOrigin = this.peerOrigins.get(msg.from);
        if (!fromOrigin) return;
        const surfaceOrigin = originOf(this.surfaceUrl);
        if (!surfaceOrigin || fromOrigin !== surfaceOrigin) return;
        const key = this.sharedKeys.get(msg.from);
        if (!key) return;
        const inner = await unseal(key, msg.sealed);
        return this.handleInvoke({ ...inner, callId: msg.callId, from: msg.from });
      }
      case "open-surface":
        return this.mountSurface(msg.reason);
      case "close-surface":
        return this.unmountSurface();
      default:
        return undefined;
    }
  }

  /* ---------------- the in-app surface (§5.1) ---------------- */

  /**
   * Attach the surface to THIS WINDOW. It is hub-origin UI, not this app's DOM
   * (§3.3): a cross-origin iframe. This document cannot read it, cannot see
   * another app's payloads through it, and cannot forge a confirm inside it.
   *
   * Only ever called from a hub-initiated message. The page cannot call this,
   * and the badge below does not call it either — the badge asks the hub.
   */
  mountSurface(reason = "user") {
    if (document.getElementById(SURFACE_FRAME_ID)) return;
    const frame = document.createElement("iframe");
    frame.id = SURFACE_FRAME_ID;
    const url = new URL("/surface", this.surfaceUrl);
    url.searchParams.set("host", this.origin);
    url.searchParams.set("session", this.sessionId);
    url.searchParams.set("transport", this.transport);
    url.searchParams.set("reason", reason);
    frame.src = url.toString();
    // No `allow="tools"`: the surface must NOT be delegated this app's tool
    // permission. It reaches this app's tools through the hub, with consent,
    // not by holding a Permissions-Policy grant (GrokVision.md §6.4).
    frame.setAttribute("allow", "");
    frame.setAttribute("title", "Connectome");
    Object.assign(frame.style, {
      position: "fixed",
      top: "0",
      right: "0",
      width: "min(420px, 100vw)",
      height: "100vh",
      border: "0",
      borderLeft: "1px solid rgba(0,0,0,.14)",
      boxShadow: "0 0 40px rgba(0,0,0,.18)",
      zIndex: "2147483646",
      background: "#fff",
      colorScheme: "light",
    });
    document.documentElement.appendChild(frame);
  }

  unmountSurface() {
    document.getElementById(SURFACE_FRAME_ID)?.remove();
  }

  /**
   * A visible affordance on the page edge (§5.1: "a badge on the page edge").
   * It does not open the surface. It asks the hub to. The distinction matters:
   * the open gesture is mediated, so a page that redraws this badge to look
   * like something else still cannot produce a real surface.
   */
  installBadge() {
    if (document.getElementById(BADGE_ID)) return;
    const badge = document.createElement("button");
    badge.id = BADGE_ID;
    badge.type = "button";
    badge.textContent = "Connectome";
    Object.assign(badge.style, {
      position: "fixed",
      top: "50%",
      right: "0",
      transform: "translateY(-50%) rotate(180deg)",
      writingMode: "vertical-rl",
      padding: "12px 6px",
      font: "600 11px/1 ui-sans-serif, system-ui, sans-serif",
      letterSpacing: ".08em",
      color: "#fff",
      background: "#111827",
      border: "0",
      borderRadius: "6px 0 0 6px",
      cursor: "pointer",
      zIndex: "2147483645",
    });
    badge.addEventListener("click", () => this.send({ t: "request-surface", sessionId: this.sessionId }));
    document.documentElement.appendChild(badge);
  }
}

/* ---------------- helpers ---------------- */

function detectTransport() {
  return window.__CONNECTOME_EXTENSION__ ? TRANSPORT.EXTENSION : TRANSPORT.EDGE;
}

/**
 * GrokVisionResponse.md E2. Optional, static, origin-served. Absence still joins
 * (GrokVision.md §4.2) — you just get an ugly hostname label instead of a name,
 * and you are invisible in the graph until the app has been open once.
 *
 * The manifest is a POSTER, never an authority: tools remain the only source of
 * truth for what can actually be invoked.
 */
async function fetchIdentity(origin) {
  try {
    const res = await fetch(new URL("/.well-known/connectome.json", origin), {
      credentials: "omit",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    return {
      name: typeof json.name === "string" ? json.name.slice(0, 60) : null,
      icon: typeof json.icon === "string" ? json.icon.slice(0, 300) : null,
      launch: sameOriginOnly(json.launch, origin),
      capabilities: Array.isArray(json.capabilities) ? json.capabilities.slice(0, 50) : [],
    };
  } catch {
    return null;
  }
}

/** A launch URL may only point back into its own origin. Otherwise it is a redirector. */
function sameOriginOnly(url, origin) {
  try {
    const u = new URL(url, origin);
    return u.origin === origin ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Boot from a <script> tag's data-* attributes, so edge injection is one line. */
export async function autoStart() {
  if (window.__connectomeBridge) return window.__connectomeBridge;
  const el = document.currentScript ?? document.querySelector("script[data-connectome-hub]");
  const hubUrl = el?.dataset?.connectomeHub ?? "http://localhost:8791";
  const surfaceUrl = el?.dataset?.connectomeSurface ?? "http://localhost:8790";
  const bridge = new PageBridge({ hubUrl, surfaceUrl });
  window.__connectomeBridge = bridge;
  try {
    return await bridge.start();
  } catch {
    // A spoke must never break because the hub is down. It is still a working app.
    return bridge;
  }
}
