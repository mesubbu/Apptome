/**
 * Thin on-device hub. Graph metadata may sync to the DO. Payloads never do.
 * Mapping, confirm UI, and policy live in the surface, not here.
 *
 * chrome.storage.local is the Transport 2 graph. The gateway is sync + mapper
 * delivery, not a runtime requirement (Gate E local-first).
 */
import { M, FAILURE, failure, edgeKey } from "./vendor/protocol.js";

const GATEWAY = "http://localhost:8791";
const SURFACE_ORIGIN = "http://localhost:8790";
const STORE = "connectome.mirror";

/** tabId -> { port, origin, identity, tools, launch, blocked, at } */
const tabs = new Map();
/** callId -> resolve */
const pending = new Map();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "spoke") return;
  const tabId = port.sender?.tab?.id;
  const url = port.sender?.url || port.sender?.tab?.url;
  if (!tabId || !url) return;
  const origin = new URL(url).origin;
  tabs.set(tabId, { port, origin, identity: null, tools: [], launch: null, blocked: false, at: Date.now() });
  port.onMessage.addListener((msg) => onSpoke(tabId, msg));
  port.onDisconnect.addListener(() => {
    tabs.delete(tabId);
  });
});

chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (sender.origin !== SURFACE_ORIGIN) return;
  handleSurface(msg)
    .then(sendResponse)
    .catch((err) => sendResponse(failure(FAILURE.HUB_UNAVAILABLE, String(err?.message ?? err))));
  return true;
});

function onSpoke(tabId, msg) {
  const tab = tabs.get(tabId);
  if (!tab) return;
  switch (msg?.t) {
    case M.HELLO:
    case M.TOOLS_CHANGED:
      tab.identity = msg.identity ?? tab.identity;
      tab.tools = msg.tools ?? tab.tools;
      tab.launch = msg.identity?.launch ?? tab.launch;
      tab.blocked = Boolean(msg.blocked);
      tab.at = Date.now();
      syncGraph();
      return;
    case M.INVOKE_RESULT: {
      const resolve = pending.get(msg.callId);
      if (!resolve) return;
      pending.delete(msg.callId);
      resolve(msg);
      return;
    }
    case "request-surface":
      tab.port.postMessage({ t: "open-surface", reason: "badge" });
      return;
    case M.BYE:
      tabs.delete(tabId);
      return;
    default:
      return;
  }
}

async function handleSurface(msg) {
  switch (msg?.t) {
    case "ping":
      return { ok: true };
    case M.GRAPH_REQUEST:
      return graph();
    case M.INVOKE:
      return invoke(msg);
    case M.LIST_GRANTS:
      return listGrants();
    case M.GRANT_EDGE:
      return grantEdge(msg);
    case "grant-use":
      return useGrant(msg.key);
    case M.REVOKE_EDGE:
      return revokeGrant(msg.key);
    case M.FORGET_APP:
      return forgetApp(msg.origin);
    case M.PAUSE:
      return setPaused(msg.paused);
    case "export":
      return exportAll();
    case "declare":
      return declareApp(msg);
    case "audit":
      return listAudit();
    case M.OPEN_APP:
      return openApp(msg.origin);
    case "close-surface":
      return closeSurface(msg.host);
    default:
      return failure(FAILURE.HUB_UNAVAILABLE, msg?.t);
  }
}

function tabForOrigin(origin) {
  let best = null;
  for (const [id, tab] of tabs) {
    if (tab.origin !== origin) continue;
    if (!best || tab.at >= best.at) best = { id, tab };
  }
  return best;
}

async function invoke({ origin, toolName, args }) {
  const store = await loadStore();
  if (store.paused) return failure(FAILURE.HUB_UNAVAILABLE, "paused");
  if (store.forgotten.includes(origin)) return failure(FAILURE.APP_UNAVAILABLE, origin);
  const hit = tabForOrigin(origin);
  if (!hit) return failure(FAILURE.APP_UNAVAILABLE, origin);
  if (hit.tab.blocked) return failure(FAILURE.PERMISSION_BLOCKED, origin);
  const callId = crypto.randomUUID();
  return new Promise((resolve) => {
    pending.set(callId, resolve);
    hit.tab.port.postMessage({ t: M.INVOKE, callId, toolName, args: args ?? {} });
  });
}

async function openApp(origin) {
  const store = await loadStore();
  if (store.forgotten.includes(origin)) return failure(FAILURE.APP_UNAVAILABLE, origin);
  const existing = await chrome.tabs.query({ url: `${origin}/*` });
  if (existing.length) return { ok: true };
  const member = (store.members ?? []).find((m) => m.origin === origin);
  const launch = member?.launch || `${origin}/`;
  await chrome.tabs.create({ url: launch, active: false });
  return { ok: true };
}

function closeSurface(host) {
  const hit = tabForOrigin(host);
  if (hit) hit.tab.port.postMessage({ t: "close-surface" });
  return { ok: true };
}

async function graph() {
  const g = await syncGraph();
  const live = new Set([...tabs.values()].map((t) => t.origin));
  return {
    ...g,
    members: (g.members ?? []).map((m) => ({ ...m, present: live.has(m.origin) })),
  };
}

async function syncGraph() {
  const store = await loadStore();
  const forgotten = new Set(store.forgotten);
  const observations = [...tabs.values()]
    .filter((t) => !forgotten.has(t.origin))
    .map((t) => ({
      origin: t.origin,
      identity: t.identity,
      tools: t.blocked
        ? []
        : (t.tools ?? []).map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
            readOnly: Boolean(tool.readOnly),
            untrusted: Boolean(tool.untrusted),
          })),
      blocked: Boolean(t.blocked),
    }));
  const remote = await api("/api/sync", { observations });
  if (remote?.members) {
    await saveStore({ members: remote.members, paused: Boolean(remote.paused) });
    return remote;
  }
  return localGraph(store);
}

function localGraph(store) {
  const forgotten = new Set(store.forgotten ?? []);
  const byOrigin = new Map(
    (store.members ?? []).filter((m) => !forgotten.has(m.origin)).map((m) => [m.origin, { ...m }])
  );
  const live = new Set();
  for (const tab of tabs.values()) {
    if (forgotten.has(tab.origin)) continue;
    live.add(tab.origin);
    const prev = byOrigin.get(tab.origin);
    byOrigin.set(tab.origin, {
      origin: tab.origin,
      name: tab.identity?.name || prev?.name || hostLabel(tab.origin),
      nameAttested: Boolean(tab.identity?.name) || Boolean(prev?.nameAttested),
      icon: tab.identity?.icon ?? prev?.icon ?? null,
      launch: tab.identity?.launch ?? tab.launch ?? prev?.launch ?? `${tab.origin}/`,
      capabilities: tab.blocked ? [] : tab.tools?.length ? tab.tools : (prev?.capabilities ?? []),
      source: prev?.source ?? "observed",
      firstSeen: prev?.firstSeen ?? tab.at,
      lastSeen: tab.at,
      blocked: Boolean(tab.blocked),
      present: true,
    });
  }
  return {
    members: [...byOrigin.values()].map((m) => ({ ...m, present: live.has(m.origin) })),
    paused: Boolean(store.paused),
  };
}

async function listGrants() {
  const remote = await api("/api/grants");
  if (remote?.grants) {
    await saveStore({ grants: remote.grants });
    return remote;
  }
  const store = await loadStore();
  return { grants: store.grants ?? [] };
}

async function grantEdge(msg) {
  const rec = {
    key: edgeKey(msg.source, msg.target),
    source: msg.source,
    target: msg.target,
    scope: msg.scope,
    schemaHash: msg.schemaHash ?? null,
    granted: Date.now(),
    revoked: null,
    uses: 0,
    sessionId: msg.sessionId ?? null,
  };
  const store = await loadStore();
  const grants = [...(store.grants ?? []).filter((g) => g.key !== rec.key), rec];
  await saveStore({ grants });
  const remote = await api("/api/grant", {
    source: msg.source,
    target: msg.target,
    scope: msg.scope,
    schemaHash: msg.schemaHash,
    sessionId: msg.sessionId,
  });
  if (remoteDown(remote)) return { ok: true, key: rec.key };
  return remote;
}

async function useGrant(key) {
  const store = await loadStore();
  const grants = (store.grants ?? []).map((g) =>
    g.key === key && !g.revoked ? { ...g, uses: (g.uses ?? 0) + 1 } : g
  );
  await saveStore({ grants });
  const remote = await api("/api/grant-use", { key });
  if (remoteDown(remote)) return { ok: true, key };
  return remote;
}

async function revokeGrant(key) {
  const store = await loadStore();
  const grants = (store.grants ?? []).map((g) =>
    g.key === key ? { ...g, revoked: Date.now() } : g
  );
  await saveStore({ grants });
  const remote = await api("/api/revoke", { key });
  if (remoteDown(remote)) return { ok: true, key };
  return remote;
}

async function forgetApp(origin) {
  const store = await loadStore();
  await saveStore({
    forgotten: [...new Set([...(store.forgotten ?? []), origin])],
    members: (store.members ?? []).filter((m) => m.origin !== origin),
    grants: (store.grants ?? []).filter(
      (g) => g.source?.origin !== origin && g.target?.origin !== origin
    ),
  });
  const remote = await api("/api/forget", { origin });
  if (remoteDown(remote)) return { ok: true, origin };
  return remote;
}

async function setPaused(paused) {
  await saveStore({ paused: Boolean(paused) });
  const remote = await api("/api/pause", { paused });
  if (remoteDown(remote)) return { ok: true, paused: Boolean(paused) };
  return remote;
}

async function declareApp(msg) {
  const remote = await api("/api/declare", { origin: msg.origin });
  if (remoteDown(remote)) {
    return { ok: false, error: "no connectome.json at that origin — we don't invent a name" };
  }
  const store = await loadStore();
  await saveStore({
    forgotten: (store.forgotten ?? []).filter((o) => o !== msg.origin),
  });
  const g = await graph();
  return { ...remote, ...g };
}

async function listAudit() {
  const remote = await api("/api/audit");
  if (remote?.audit) return remote;
  return { audit: [] };
}

async function exportAll() {
  const remote = await api("/api/export");
  if (remote && remote.members && !remote.code) return remote;
  const store = await loadStore();
  return {
    exportedAt: Date.now(),
    members: store.members ?? [],
    grants: store.grants ?? [],
    note: "Metadata only. No app payload has ever been stored here.",
  };
}

function remoteDown(remote) {
  return remote?.ok === false && remote.code === FAILURE.HUB_UNAVAILABLE;
}

async function loadStore() {
  const got = await chrome.storage.local.get(STORE);
  const data = got[STORE] ?? {};
  return {
    members: data.members ?? [],
    grants: data.grants ?? [],
    paused: Boolean(data.paused),
    forgotten: data.forgotten ?? [],
  };
}

async function saveStore(partial) {
  const cur = await loadStore();
  await chrome.storage.local.set({ [STORE]: { ...cur, ...partial } });
}

function hostLabel(origin) {
  try {
    return new URL(origin).host;
  } catch {
    return String(origin);
  }
}

async function api(path, body) {
  try {
    const res = await fetch(new URL(path, GATEWAY), {
      method: body ? "POST" : "GET",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, code: FAILURE.HUB_UNAVAILABLE, detail: `${res.status}` };
    return json ?? { ok: true };
  } catch (err) {
    return { ok: false, code: FAILURE.HUB_UNAVAILABLE, detail: String(err?.message ?? err) };
  }
}
