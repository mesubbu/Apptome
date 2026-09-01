/**
 * HubDO — one Durable Object per user. This is the connectome graph.
 *
 * GrokVision.md §3.4 says the graph is the product and a live `{tab -> tools}`
 * matrix is not. This object is the graph: it persists membership and consented
 * edges, and it survives every tab.
 *
 * WHAT IT IS
 *   - A registry of members (origin-keyed), so the surface inside App A can name
 *     App B whether or not B's tab is focused.
 *   - A ledger of edge grants, revocable, with a kill switch.
 *   - A BLIND relay for the edge transport: it forwards sealed envelopes between
 *     the user's own page sessions and holds no key, so it cannot read a payload.
 *
 * WHAT IT IS EXPRESSLY NOT
 *   - A scheduler. There is no alarm() and no scheduled() handler, and CI enforces
 *     that (ci/distortion-tests.mjs). The moment this object can act on its own,
 *     the user has stopped being the connector and this became the iPaaS that
 *     GrokVision.md §9/§10 rejects.
 *   - A place where plaintext payloads live. Under the edge transport it sees
 *     ciphertext and metadata. Under the extension transport it sees only the
 *     graph — the payloads never leave the device at all.
 *   - A policy engine. No budgets, no templates, no unattended grants.
 */

import {
  M,
  MEMBER_SOURCE,
  membershipRecord,
  edgeKey,
  GRANT_SCOPE,
  FAILURE,
  failure,
} from "./vendor/protocol.js";
import { isAllowedOrigin, roleForOrigin } from "./origins.js";

export class HubDO {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;
    /** sessionId -> { ws, origin, role, host, publicKey, helloAt } — dies with the isolate; restored from WS tags */
    this.sessions = new Map();
    this.#migrate();
  }

  #migrate() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS members (
        origin        TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        name_attested INTEGER NOT NULL DEFAULT 0,
        icon          TEXT,
        launch        TEXT,
        capabilities  TEXT NOT NULL DEFAULT '[]',
        source        TEXT NOT NULL,
        first_seen    INTEGER NOT NULL,
        last_seen     INTEGER NOT NULL,
        blocked       INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS grants (
        key            TEXT PRIMARY KEY,
        source_origin  TEXT NOT NULL,
        source_tool    TEXT NOT NULL,
        target_origin  TEXT NOT NULL,
        target_tool    TEXT NOT NULL,
        scope          TEXT NOT NULL,
        schema_hash    TEXT,
        granted        INTEGER NOT NULL,
        revoked        INTEGER,
        uses           INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS audit (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        at        INTEGER NOT NULL,
        kind      TEXT NOT NULL,
        edge      TEXT,
        outcome   TEXT,
        bytes     INTEGER
      );
      CREATE TABLE IF NOT EXISTS settings (
        k TEXT PRIMARY KEY,
        v TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS forgotten (
        origin TEXT PRIMARY KEY,
        at     INTEGER NOT NULL
      );
    `);
    try {
      this.sql.exec("ALTER TABLE grants ADD COLUMN session_id TEXT");
    } catch {
      /* already migrated */
    }
  }

  /* ================= HTTP ================= */

  async fetch(request) {
    const url = new URL(request.url);

    if (request.headers.get("Upgrade") === "websocket") {
      return this.#acceptSocket(request, url);
    }

    switch (url.pathname) {
      case "/do/graph":
        return json(await this.graph());
      case "/do/sync":
        return json(await this.sync(await request.json()));
      case "/do/declare":
        return json(await this.declare(await request.json()));
      case "/do/grants":
        return json({ grants: this.listGrants() });
      case "/do/grant":
        return json(this.grant(await request.json()));
      case "/do/grant-use":
        return json(this.useGrant((await request.json()).key));
      case "/do/revoke":
        return json(this.revoke((await request.json()).key));
      case "/do/forget":
        return json(this.forget((await request.json()).origin));
      case "/do/pause":
        return json(this.setPaused((await request.json()).paused));
      case "/do/audit":
        return json({ audit: this.recentAudit() });
      case "/do/export":
        return json(this.exportAll());
      default:
        return new Response("not found", { status: 404 });
    }
  }

  /* ================= graph ================= */

  /**
   * Membership is keyed by ORIGIN and never by label. The label is what the app
   * called itself; the origin is who it actually is. The surface renders both,
   * always, because otherwise App A can appear inside App B wearing a name that
   * is not its own (GrokVisionResponse.md Gap 3).
   */
  upsertMember({ origin, identity, capabilities, source, blocked }) {
    if (!origin || !/^https?:\/\//.test(origin)) return null;
    const src = source ?? MEMBER_SOURCE.OBSERVED;
    if (src !== MEMBER_SOURCE.DECLARED) {
      const banned = this.sql.exec("SELECT origin FROM forgotten WHERE origin = ?", origin).toArray()[0];
      if (banned) return null;
    }
    const now = Date.now();
    const existing = this.sql.exec("SELECT * FROM members WHERE origin = ?", origin).toArray()[0];
    const rec = membershipRecord({
      origin,
      name: identity?.name ?? null,
      icon: identity?.icon ?? null,
      launch: identity?.launch ?? null,
      capabilities: capabilities ?? [],
      source: source ?? MEMBER_SOURCE.OBSERVED,
    });

    if (existing) {
      // Once we have OBSERVED real tools we never downgrade to a DECLARED poster:
      // the manifest is advertising, the tools are the truth.
      const keepSource =
        existing.source === MEMBER_SOURCE.OBSERVED ? MEMBER_SOURCE.OBSERVED : rec.source;
      // blocked is app opt-out (tools=()): member stays, tools are empty.
      // An empty unblocked HELLO keeps last-seen tools (the tab closed / not yet registered).
      const caps = blocked
        ? []
        : (capabilities?.length ? capabilities : JSON.parse(existing.capabilities)) ?? [];
      this.sql.exec(
        `UPDATE members SET name=?, name_attested=?, icon=?, launch=?, capabilities=?, source=?,
         last_seen=?, blocked=? WHERE origin=?`,
        rec.nameAttested ? rec.name : existing.name,
        rec.nameAttested ? 1 : existing.name_attested,
        rec.icon ?? existing.icon,
        rec.launch ?? existing.launch,
        JSON.stringify(caps),
        keepSource,
        now,
        blocked ? 1 : 0,
        origin
      );
    } else {
      this.sql.exec(
        `INSERT INTO members (origin,name,name_attested,icon,launch,capabilities,source,first_seen,last_seen,blocked)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        origin,
        rec.name,
        rec.nameAttested ? 1 : 0,
        rec.icon,
        rec.launch,
        JSON.stringify(rec.capabilities),
        rec.source,
        now,
        now,
        blocked ? 1 : 0
      );
    }
    return this.member(origin);
  }

  member(origin) {
    const row = this.sql.exec("SELECT * FROM members WHERE origin = ?", origin).toArray()[0];
    return row ? rowToMember(row) : null;
  }

  async graph() {
    const members = this.sql
      .exec("SELECT * FROM members ORDER BY name COLLATE NOCASE")
      .toArray()
      .map(rowToMember);
    // `present` is transport, not membership (GrokVision.md §7). A member the hub
    // cannot reach right now is still a member; the surface says so and offers to
    // open it, rather than hiding it or inventing presence.
    const live = new Set([...this.sessions.values()].map((s) => s.origin));
    return {
      members: members.map((m) => ({ ...m, present: live.has(m.origin) })),
      paused: this.isPaused(),
    };
  }

  /**
   * Called by the extension transport over plain HTTP. Carries the GRAPH only:
   * origins, app identity, tool descriptors. Never a payload. Under this
   * transport the hub is the user's own device and no app data leaves it.
   */
  async sync({ observations }) {
    for (const obs of observations ?? []) {
      this.upsertMember({
        origin: obs.origin,
        identity: obs.identity,
        capabilities: (obs.tools ?? []).map(publicCapability),
        source: MEMBER_SOURCE.OBSERVED,
        blocked: obs.blocked,
      });
    }
    return this.graph();
  }

  /**
   * User-typed origin that published /.well-known/connectome.json.
   * The manifest is a POSTER. Tools stay the authority for invoke.
   * Gateway fetched the file; we store what it returned, never a payload.
   */
  async declare({ origin, identity, capabilities }) {
    this.sql.exec("DELETE FROM forgotten WHERE origin = ?", origin);
    const rec = this.upsertMember({
      origin,
      identity,
      capabilities: capabilities ?? [],
      source: MEMBER_SOURCE.DECLARED,
    });
    if (!rec) return { ok: false, error: "that is not an origin" };
    this.#audit("declare-app", origin, "ok");
    await this.#broadcastGraph();
    return { ok: true, ...(await this.graph()) };
  }

  forget(origin) {
    // Exit is part of consent design (GrokVisionResponse.md Gap 10). Forgetting an
    // app must also drop every edge that pointed at it — a dangling grant is a
    // grant the user thinks they revoked.
    // Forgotten ≠ blocked. blocked is app opt-out (tools=()). Forget is user exit:
    // the row is gone, and HELLO/sync must not resurrect it until Add an app.
    this.sql.exec("DELETE FROM members WHERE origin = ?", origin);
    this.sql.exec("DELETE FROM grants WHERE source_origin = ? OR target_origin = ?", origin, origin);
    this.sql.exec("INSERT OR REPLACE INTO forgotten (origin, at) VALUES (?, ?)", origin, Date.now());
    for (const [id, s] of [...this.sessions]) {
      if (s.origin === origin && s.role === "spoke") {
        try {
          s.ws.close();
        } catch {
          /* already gone */
        }
        this.sessions.delete(id);
      }
    }
    this.#audit("forget-app", origin, "ok");
    this.#broadcastGraph();
    return { ok: true, origin };
  }

  /* ================= grants ================= */

  /**
   * An edge grant authorises the hub to PROPOSE this edge and to run the named
   * source read. It never authorises a write. Writes confirm, exact JSON, every
   * time (GrokVision.md §6.2 + GrokVisionResponse.md Gap 5).
   */
  grant({ source, target, scope, schemaHash, sessionId }) {
    const key = edgeKey(source, target);
    const now = Date.now();
    this.sql.exec(
      `INSERT INTO grants (key,source_origin,source_tool,target_origin,target_tool,scope,schema_hash,granted,revoked,uses,session_id)
       VALUES (?,?,?,?,?,?,?,?,NULL,0,?)
       ON CONFLICT(key) DO UPDATE SET scope=excluded.scope, schema_hash=excluded.schema_hash,
         granted=excluded.granted, revoked=NULL, uses=0, session_id=excluded.session_id`,
      key,
      source.origin,
      source.tool,
      target.origin,
      target.tool,
      scope ?? GRANT_SCOPE.SESSION,
      schemaHash ?? null,
      now,
      sessionId ?? null
    );
    this.#audit("grant-edge", key, "ok");
    return { ok: true, key };
  }

  useGrant(key) {
    if (!key) return { ok: false };
    this.sql.exec("UPDATE grants SET uses = uses + 1 WHERE key = ? AND revoked IS NULL", key);
    return { ok: true, key };
  }

  revoke(key) {
    this.sql.exec("UPDATE grants SET revoked = ? WHERE key = ?", Date.now(), key);
    this.#audit("revoke-edge", key, "ok");
    return { ok: true, key };
  }

  listGrants() {
    return this.sql
      .exec("SELECT * FROM grants ORDER BY granted DESC")
      .toArray()
      .map((r) => ({
        key: r.key,
        source: { origin: r.source_origin, tool: r.source_tool },
        target: { origin: r.target_origin, tool: r.target_tool },
        scope: r.scope,
        schemaHash: r.schema_hash,
        granted: r.granted,
        revoked: r.revoked,
        uses: r.uses,
        sessionId: r.session_id,
      }));
  }

  /** The kill switch. A confused-deputy design needs one (GrokVisionResponse.md Gap 10). */
  setPaused(paused) {
    this.sql.exec(
      "INSERT INTO settings (k,v) VALUES ('paused',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v",
      paused ? "1" : "0"
    );
    this.#audit("pause", null, paused ? "paused" : "resumed");
    for (const s of this.sessions.values()) send(s.ws, { t: M.PAUSED, paused: Boolean(paused) });
    return { ok: true, paused: Boolean(paused) };
  }

  isPaused() {
    const row = this.sql.exec("SELECT v FROM settings WHERE k = 'paused'").toArray()[0];
    return row?.v === "1";
  }

  exportAll() {
    return {
      exportedAt: Date.now(),
      members: this.sql.exec("SELECT * FROM members").toArray().map(rowToMember),
      grants: this.listGrants(),
      note: "Metadata only. No app payload has ever been stored here.",
    };
  }

  /* ================= blind relay (edge transport) ================= */

  #acceptSocket(request, url) {
    const sessionId = url.searchParams.get("session");
    // Identity is the Origin header. ?origin= and ?role= are not authority (T1.5).
    const origin = request.headers.get("Origin");
    if (!sessionId) return new Response("session required", { status: 400 });
    if (!isAllowedOrigin(origin)) return new Response("origin not allowed", { status: 403 });

    const role = roleForOrigin(origin);
    const host = role === "surface" ? url.searchParams.get("host") || "" : "";

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    // Hibernation: tags survive the isolate going to sleep. Origin/role/host must
    // live here, not in HELLO, or a wake would re-bind identity from the client.
    this.ctx.acceptWebSocket(server, [sessionId, origin, role, host]);
    this.sessions.set(sessionId, {
      ws: server,
      origin,
      role,
      host: host || null,
      publicKey: null,
      helloAt: 0,
    });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const session = this.#sessionFromSocket(ws);
    if (!session) return;
    const sessionId = this.ctx.getTags(ws)[0];

    if (this.isPaused() && msg.t !== M.GRAPH_REQUEST) {
      return send(ws, { t: M.PAUSED, paused: true });
    }

    switch (msg.t) {
      case M.HELLO:
      case M.TOOLS_CHANGED: {
        // Bound origin is the Origin header (tags). HELLO.origin is a poster, not identity.
        session.publicKey = msg.publicKey ?? session.publicKey;
        session.helloAt = Date.now();
        if (session.role === "surface") {
          if (typeof msg.host === "string" && msg.host) session.host = msg.host;
          this.#broadcastPeerKeys();
          return this.#broadcastGraph();
        }
        this.upsertMember({
          origin: session.origin,
          identity: msg.identity,
          capabilities: (msg.tools ?? []).map(publicCapability),
          source: MEMBER_SOURCE.OBSERVED,
          blocked: msg.blocked,
        });
        this.#broadcastPeerKeys();
        return this.#broadcastGraph();
      }

      case M.GRAPH_REQUEST:
        return send(ws, { t: M.GRAPH, ...(await this.graph()) });

      case M.SEALED: {
        // THE BLIND RELAY. Forward ciphertext unread. Never JSON.parse the blob.
        // T1.6: only surface ↔ spoke. Spoke-to-spoke is a write primitive; refuse it.
        const peer = this.sessions.get(msg.to);
        const allowed =
          peer &&
          ((session.role === "surface" && peer.role === "spoke") ||
            (session.role === "spoke" && peer.role === "surface"));
        const outcome = !peer ? "no-peer" : allowed ? "forwarded" : "refused";
        this.#audit("relay", `${sessionId}->${msg.to}`, outcome, msg.sealed?.ct?.length ?? 0);
        if (!peer || !allowed) {
          return send(ws, { t: M.RESULT, callId: msg.callId, ...failure(FAILURE.APP_UNAVAILABLE) });
        }
        return send(peer.ws, { t: M.SEALED, callId: msg.callId, from: sessionId, sealed: msg.sealed });
      }

      case "request-surface": {
        // A spoke's page-edge badge asked for the surface. The request is mediated:
        // the page cannot mount hub UI itself, it can only ask the hub to.
        if (session.role !== "spoke") return;
        return send(ws, { t: "open-surface", reason: "badge" });
      }

      case "close-surface": {
        // Surface session → host spoke. Not the inverse of request-surface (T1.2).
        if (session.role !== "surface") return;
        const host = session.host;
        if (!host) return;
        const spoke = this.#latestSession({ origin: host, role: "spoke" });
        if (spoke) send(spoke.ws, { t: "close-surface" });
        return;
      }

      case M.BYE:
        this.sessions.delete(sessionId);
        return this.#broadcastGraph();

      default:
        return undefined;
    }
  }

  async webSocketClose(ws) {
    const tag = this.ctx.getTags(ws)[0];
    this.sessions.delete(tag);
    await this.#broadcastGraph();
  }

  async webSocketError(ws) {
    const tag = this.ctx.getTags(ws)[0];
    this.sessions.delete(tag);
  }

  #sessionFromSocket(ws) {
    const [sessionId, origin, role, host] = this.ctx.getTags(ws);
    if (!sessionId) return null;
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        ws,
        origin,
        role,
        host: host || null,
        publicKey: null,
        helloAt: 0,
      };
      this.sessions.set(sessionId, session);
    }
    session.ws = ws;
    return session;
  }

  #latestSession({ origin, role }) {
    let best = null;
    for (const s of this.sessions.values()) {
      if (origin && s.origin !== origin) continue;
      if (role && s.role !== role) continue;
      if (!best || (s.helloAt ?? 0) >= (best.helloAt ?? 0)) best = s;
    }
    return best;
  }

  #broadcastPeerKeys() {
    const keys = {};
    for (const [id, s] of this.sessions) {
      if (!s.publicKey) continue;
      keys[id] = { publicKey: s.publicKey, origin: s.origin, helloAt: s.helloAt ?? 0 };
    }
    for (const s of this.sessions.values()) send(s.ws, { t: M.PEER_KEYS, keys });
  }

  async #broadcastGraph() {
    const graph = await this.graph();
    for (const s of this.sessions.values()) send(s.ws, { t: M.GRAPH, ...graph });
  }

  /** Metadata only. Never args, never results. */
  #audit(kind, edge, outcome, bytes = 0) {
    this.sql.exec(
      "INSERT INTO audit (at,kind,edge,outcome,bytes) VALUES (?,?,?,?,?)",
      Date.now(),
      kind,
      edge,
      outcome,
      bytes
    );
  }

  recentAudit(limit = 100) {
    return this.sql.exec("SELECT * FROM audit ORDER BY id DESC LIMIT ?", limit).toArray();
  }
}

/* ---------------- helpers ---------------- */

/**
 * What of a tool we are willing to persist and show. `description` is untrusted
 * text (GrokVision.md §6.2) and is carried as data — the surface renders it with
 * textContent, never innerHTML, and no mapper ever sees it as an instruction.
 */
function publicCapability(tool) {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    readOnly: Boolean(tool.readOnly),
    untrusted: Boolean(tool.untrusted),
  };
}

function rowToMember(row) {
  return {
    origin: row.origin,
    name: row.name,
    nameAttested: Boolean(row.name_attested),
    icon: row.icon,
    launch: row.launch,
    capabilities: JSON.parse(row.capabilities ?? "[]"),
    source: row.source,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
    blocked: Boolean(row.blocked),
  };
}

function send(ws, msg) {
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    /* socket already gone; the graph will notice on close */
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
