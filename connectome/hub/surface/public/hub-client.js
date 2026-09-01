/**
 * How the surface reaches the hub.
 *
 * Same API, two transports (GrokVisionResponse.md §4.3):
 *
 *   extension  chrome.runtime.sendMessage to the pinned extension id. The hub is
 *              the user's own device: plaintext never leaves it, and Cloudflare
 *              holds only the graph.
 *
 *   edge       WebSocket to the per-user Durable Object, with ECDH-derived
 *              AES-GCM between page sessions. The DO relays sealed envelopes and
 *              holds no key, so it cannot read a payload it forwards.
 *
 * Nothing above this layer knows or cares which one is live.
 */

import { EXT_ID, GATEWAY_URL } from "./config.js";
import {
  M,
  TRANSPORT,
  FAILURE,
  failure,
  newId,
  generateSessionKeys,
  exportPublicKey,
  deriveSharedKey,
  seal,
  unseal,
  latestPeerId,
  parseConnectomeManifest,
} from "/protocol/protocol.js";

/**
 * Not a FAILURE code from the protocol taxonomy. Those describe an edge that
 * stopped; this describes a browser that has not been let in yet, which happens
 * before any edge exists. Keeping it separate stops it being rendered as
 * "nothing was written" when nothing was ever attempted.
 */
export const PAIRING_REQUIRED = "PAIRING_REQUIRED";

export class HubClient {
  constructor({ host, session }) {
    this.host = host;
    this.hostSession = session;
    this.transport = null;
    this.sessionId = newId("surf");
    this.ws = null;
    this.keyPair = null;
    this.sharedKeys = new Map();
    this.pending = new Map();
    this.onGraph = () => {};
    this.onPaused = () => {};
  }

  async connect() {
    if (await this.#extensionReachable()) {
      this.transport = TRANSPORT.EXTENSION;
      return this.transport;
    }
    this.transport = TRANSPORT.EDGE;
    // Ask BEFORE opening the socket. An unpaired /hub upgrade is refused with a
    // 401 the WebSocket API surfaces only as a generic `error` event, so the
    // panel would say "can't reach your connectome" when the truth is "this
    // browser has not been paired yet" — two different problems, two different
    // things for the user to do.
    const pairing = await this.pairStatus();
    if (pairing.required && !pairing.paired) {
      const err = new Error("pairing required");
      err.code = PAIRING_REQUIRED;
      err.pairing = pairing;
      throw err;
    }
    this.keyPair = await generateSessionKeys();
    await this.#openSocket();
    return this.transport;
  }

  /* ---------------- pairing (gateway/src/pairing.js) ---------------- */

  /**
   * The connectome id lives in an HttpOnly cookie, so this document cannot read
   * it — which is the point. The gateway is the only thing that can say whether
   * this browser is paired.
   */
  async pairStatus() {
    const res = await this.#api("/api/pair");
    if (res?.ok !== true) {
      // Treat an unreachable gateway as "not required": the caller is about to
      // fail with HUB_UNAVAILABLE anyway, and claiming a challenge is needed
      // would send the user to fix the wrong thing.
      return { paired: false, required: false, configured: false, siteKey: null };
    }
    return res;
  }

  /** Exchange a solved Turnstile challenge for a signed connectome cookie. */
  async pair(token) {
    return this.#api("/api/pair", { token });
  }

  async #extensionReachable() {
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) return false;
    try {
      const res = await this.#toExtension({ t: "ping" });
      return res?.ok === true;
    } catch {
      return false;
    }
  }

  #toExtension(msg) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(EXT_ID, { ...msg, host: this.host }, (res) => {
        const err = chrome.runtime.lastError;
        if (err) return reject(new Error(err.message));
        resolve(res);
      });
    });
  }

  async #openSocket() {
    const url = new URL("/hub", GATEWAY_URL);
    url.protocol = url.protocol.replace("http", "ws");
    url.searchParams.set("session", this.sessionId);
    // Origin/role are bound from the Origin header (T1.5). host is the spoke
    // this panel is attached to, so close-surface can find that tab (T1.2).
    if (this.host) url.searchParams.set("host", this.host);
    this.ws = new WebSocket(url);
    this.ws.addEventListener("message", (ev) => this.#onSocket(JSON.parse(ev.data)));
    await new Promise((res, rej) => {
      this.ws.addEventListener("open", res, { once: true });
      this.ws.addEventListener("error", () => rej(new Error("hub unreachable")), { once: true });
    });
    this.#sendSocket({
      t: M.HELLO,
      sessionId: this.sessionId,
      publicKey: await exportPublicKey(this.keyPair),
      tools: [],
      host: this.host || undefined,
    });
  }

  #sendSocket(msg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  async #onSocket(msg) {
    switch (msg.t) {
      case M.GRAPH:
        return this.onGraph(msg);
      case M.PAUSED:
        return this.onPaused(msg.paused);
      case M.PEER_KEYS: {
        this.peerKeys = msg.keys ?? {};
        for (const [peer, entry] of Object.entries(this.peerKeys)) {
          if (peer === this.sessionId) continue;
          const pub = entry?.publicKey;
          if (pub && !this.sharedKeys.has(peer)) {
            this.sharedKeys.set(peer, await deriveSharedKey(this.keyPair, pub));
          }
        }
        return;
      }
      case M.SEALED: {
        const key = this.sharedKeys.get(msg.from);
        const waiter = this.pending.get(msg.callId);
        if (!waiter) return;
        this.pending.delete(msg.callId);
        if (!key) return waiter(failure(FAILURE.HUB_UNAVAILABLE, "no peer key"));
        return waiter(await unseal(key, msg.sealed));
      }
      case M.RESULT: {
        const waiter = this.pending.get(msg.callId);
        if (!waiter) return;
        this.pending.delete(msg.callId);
        return waiter(msg);
      }
      default:
        return undefined;
    }
  }

  /* ---------------- the API the surface uses ---------------- */

  async graph() {
    if (this.transport === TRANSPORT.EXTENSION) return this.#toExtension({ t: M.GRAPH_REQUEST });
    return new Promise((resolve) => {
      const once = (g) => {
        this.onGraph = () => {};
        resolve(g);
      };
      this.onGraph = once;
      this.#sendSocket({ t: M.GRAPH_REQUEST });
    });
  }

  /**
   * Invoke one tool in one app.
   *
   * `args` for a READ is always {}. For a WRITE it is the exact JSON the user
   * approved a moment ago, unmodified — the surface never touches it between the
   * confirm and the send, because if it did, the thing the user approved and the
   * thing that ran would not be the same thing.
   */
  async invoke({ origin, toolName, args }) {
    if (this.transport === TRANSPORT.EXTENSION) {
      return this.#toExtension({ t: M.INVOKE, origin, toolName, args: args ?? {} });
    }
    const peer = latestPeerId(this.peerKeys, origin, this.sessionId);
    if (!peer) return failure(FAILURE.APP_UNAVAILABLE, origin);
    const key = this.sharedKeys.get(peer);
    if (!key) return failure(FAILURE.HUB_UNAVAILABLE, "no peer key");
    const callId = newId("call");
    const sealed = await seal(key, { t: M.INVOKE, toolName, args: args ?? {} });
    const answer = new Promise((resolve) => this.pending.set(callId, resolve));
    this.#sendSocket({ t: M.SEALED, callId, to: peer, from: this.sessionId, sealed });
    return answer;
  }

  async grants() {
    if (this.transport === TRANSPORT.EXTENSION) return this.#toExtension({ t: M.LIST_GRANTS });
    return this.#api("/api/grants");
  }

  async grant(payload) {
    const body = { ...payload, sessionId: this.sessionId };
    if (this.transport === TRANSPORT.EXTENSION) {
      return this.#toExtension({ t: M.GRANT_EDGE, ...body });
    }
    return this.#api("/api/grant", body);
  }

  async useGrant(key) {
    if (!key) return { ok: false };
    if (this.transport === TRANSPORT.EXTENSION) return this.#toExtension({ t: "grant-use", key });
    return this.#api("/api/grant-use", { key });
  }

  async revoke(key) {
    if (this.transport === TRANSPORT.EXTENSION) return this.#toExtension({ t: M.REVOKE_EDGE, key });
    return this.#api("/api/revoke", { key });
  }

  async forget(origin) {
    if (this.transport === TRANSPORT.EXTENSION) return this.#toExtension({ t: M.FORGET_APP, origin });
    return this.#api("/api/forget", { origin });
  }

  /**
   * T4.3: user typed an origin. This device fetches the poster
   * (`credentials: omit`). Absence is not a name. The hub stores the poster.
   */
  async declare(originRaw) {
    let origin;
    try {
      origin = new URL(originRaw).origin;
    } catch {
      return { ok: false, error: "that is not an origin" };
    }
    let json;
    try {
      const res = await fetch(new URL("/.well-known/connectome.json", origin), {
        credentials: "omit",
        cache: "no-store",
      });
      if (!res.ok) {
        return { ok: false, error: "no connectome.json at that origin — we don't invent a name" };
      }
      json = await res.json();
    } catch {
      return { ok: false, error: "no connectome.json at that origin — we don't invent a name" };
    }
    const record = parseConnectomeManifest(json, origin);
    if (this.transport === TRANSPORT.EXTENSION) return this.#toExtension({ t: "declare", ...record });
    return this.#api("/api/declare", record);
  }

  async pause(paused) {
    if (this.transport === TRANSPORT.EXTENSION) return this.#toExtension({ t: M.PAUSE, paused });
    return this.#api("/api/pause", { paused });
  }

  async exportAll() {
    if (this.transport === TRANSPORT.EXTENSION) return this.#toExtension({ t: "export" });
    return this.#api("/api/export");
  }

  /**
   * Open-or-focus a member. GrokVision.md §7.3: allowed as transport AFTER the
   * user asked for it, and it must not steal focus. `active: false` is enforced
   * in the extension, and by CI.
   */
  async openApp(origin) {
    if (this.transport === TRANSPORT.EXTENSION) return this.#toExtension({ t: M.OPEN_APP, origin });
    return failure(FAILURE.APP_UNAVAILABLE, "open-or-focus needs the extension transport");
  }

  async closeSurface() {
    if (this.transport === TRANSPORT.EXTENSION) return this.#toExtension({ t: "close-surface" });
    this.#sendSocket({ t: "close-surface" });
  }

  async #api(path, body) {
    const res = await fetch(new URL(path, GATEWAY_URL), {
      method: body ? "POST" : "GET",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      // The connectome id is an HttpOnly cookie on the GATEWAY's origin, and
      // this document is served from the surface origin. Without `include` the
      // browser omits it on every cross-origin call and a paired user is told,
      // correctly but uselessly, that they are not paired.
      credentials: "include",
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ...failure(FAILURE.HUB_UNAVAILABLE, json?.error ?? `${res.status}`),
        error: json?.error ?? `${res.status}`,
      };
    }
    return json;
  }
}
