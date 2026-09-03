/**
 * THE CONNECTOME SURFACE. This file is the product.
 *
 * GrokVision.md §2.1: "User is in the CRM, on a client. A connectome surface,
 * clearly not the CRM's own chrome, lists other opted-in apps. Invoicing is
 * there. 'Create draft invoice' is there. The exact JSON that would be sent is
 * there. The user approves. A draft invoice exists in the invoicing app. The
 * user still sees the CRM."
 *
 * This document runs on the HUB's origin, inside a cross-origin iframe attached
 * to the host app's window. The host app cannot read this DOM, cannot see another
 * app's payloads, and cannot forge a confirm (§3.3).
 *
 * It is a directory of named apps and their capabilities. It is not a chat box.
 * Search exists instead (GrokVisionResponse.md E8), because a search over a graph
 * keeps "named apps and capabilities" as the mental model, and a blank prompt
 * quietly turns every other app into an anonymous backend (§10).
 */

import { HubClient, PAIRING_REQUIRED, RATE_LIMITED } from "./hub-client.js";
import { MAPPER_URL } from "./config.js";
import {
  FAILURE,
  FAILURE_COPY,
  PROV,
  GRANT_SCOPE,
  hostLabel,
  describeShape,
  mapperRequest,
  applyMapping,
  plainArgs,
  provenanced,
  validateArgs,
  schemaHash,
  parseInputSchema,
  edgeKey,
  grantIsLive,
} from "/protocol/protocol.js";

const params = new URLSearchParams(location.search);
const HOST_ORIGIN = params.get("host") ?? "";
const HOST_SESSION = params.get("session") ?? "";

const client = new HubClient({ host: HOST_ORIGIN, session: HOST_SESSION });

const state = {
  transport: null,
  members: [],
  paused: false,
  view: { name: "directory" },
  filter: "",
  lastResult: null,
};
window.__connectomeState = state;

/* ================================================================== *
 * Anti-spoof mark — GrokVisionResponse.md Gap 4.
 *
 * GrokVision.md §3.3 asserts "A must not spoof it" without giving a mechanism.
 * Here is the mechanism. On first run the surface picks a mark and stores it in
 * ITS OWN origin's localStorage. Every real surface shows it. A host page can
 * paint a pixel-perfect fake panel, but it cannot read this value across origins,
 * so it cannot show the right mark. If the mark is missing or wrong, the panel
 * asking for your approval is not ours.
 * ================================================================== */

const MARKS = ["◆", "●", "▲", "■", "★", "✦", "⬢", "◈"];
const HUES = [212, 268, 340, 12, 158, 42];

function surfaceMark() {
  let raw = localStorage.getItem("connectome.mark");
  if (!raw) {
    const pick = {
      glyphs: [rand(MARKS), rand(MARKS)].join(""),
      hue: rand(HUES),
    };
    raw = JSON.stringify(pick);
    localStorage.setItem("connectome.mark", raw);
  }
  return JSON.parse(raw);
}

function rand(list) {
  return list[crypto.getRandomValues(new Uint32Array(1))[0] % list.length];
}

/* ================================================================== *
 * boot
 * ================================================================== */

async function boot() {
  const mark = surfaceMark();
  document.documentElement.style.setProperty("--hue", mark.hue);
  el("mark").textContent = mark.glyphs;

  try {
    state.transport = await client.connect();
  } catch (err) {
    // Two different stops. "Not paired" is a door the user can open; "hub
    // unreachable" is not. Showing the retry copy for the first one would tell
    // the user to keep reloading a page that will never change.
    state.view =
      err?.code === PAIRING_REQUIRED
        ? { name: "pair", pairing: err.pairing ?? {} }
        : err?.code === RATE_LIMITED
          ? { name: "rate-limited", detail: err.detail }
          : { name: "failure", code: FAILURE.HUB_UNAVAILABLE };
    return render();
  }

  client.onGraph = (g) => {
    state.members = g.members ?? [];
    state.paused = Boolean(g.paused);
    if (state.view.name === "directory") render();
  };
  client.onPaused = (p) => {
    state.paused = p;
    render();
  };

  await refreshGraph();
  wireChrome();
  render();
}

async function refreshGraph() {
  const g = await client.graph();
  state.members = g?.members ?? [];
  state.paused = Boolean(g?.paused);
}

let chromeWired = false;

/**
 * Idempotent, because boot() runs a second time after pairing succeeds. Without
 * the guard the pause button would fire twice per click — pausing and instantly
 * resuming — which is the kind of bug that looks like the hub ignoring you.
 */
function wireChrome() {
  if (chromeWired) return;
  chromeWired = true;
  el("close").addEventListener("click", () => client.closeSurface());
  el("home").addEventListener("click", () => go({ name: "directory" }));
  el("grants-link").addEventListener("click", () => openGrants());
  el("activity-link").addEventListener("click", () => openActivity());
  el("search").addEventListener("input", (e) => {
    state.filter = e.target.value;
    render();
  });
  el("pause").addEventListener("click", async () => {
    await client.pause(!state.paused);
    await refreshGraph();
    render();
  });
}

function go(view) {
  state.view = view;
  render();
}

/* ================================================================== *
 * this app, and the others
 * ================================================================== */

function hostMember() {
  return state.members.find((m) => m.origin === HOST_ORIGIN) ?? null;
}

/** §5.4: the directory is every OTHER member. Never this app. */
function otherMembers() {
  return state.members.filter((m) => m.origin !== HOST_ORIGIN);
}

function filtered() {
  const q = state.filter.trim().toLowerCase();
  const others = otherMembers();
  if (!q) return others.map((m) => ({ member: m, caps: m.capabilities }));
  return others
    .map((m) => ({
      member: m,
      caps: m.capabilities.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.description ?? "").toLowerCase().includes(q) ||
          m.name.toLowerCase().includes(q)
      ),
    }))
    .filter((r) => r.caps.length || r.member.name.toLowerCase().includes(q));
}

/* ================================================================== *
 * render
 * ================================================================== */

function render() {
  const host = hostMember();
  el("host-name").textContent = host?.name ?? hostLabel(HOST_ORIGIN);
  el("host-origin").textContent = HOST_ORIGIN;
  el("transport").textContent = state.transport === "extension" ? "on-device hub" : "edge hub";
  el("pause").textContent = state.paused ? "Resume" : "Pause";
  el("pause").classList.toggle("danger", state.paused);
  el("paused-banner").hidden = !state.paused;

  const body = el("body");
  body.replaceChildren();
  switch (state.view.name) {
    case "directory":
      return body.append(viewDirectory());
    case "member":
      return body.append(viewMember(state.view.origin));
    case "read-consent":
      return body.append(viewReadConsent(state.view));
    case "source-pick":
      return body.append(viewSourcePick(state.view));
    case "confirm":
      return body.append(viewConfirm(state.view));
    case "result":
      return body.append(viewResult(state.view));
    case "grants":
      return body.append(viewGrants(state.view));
    case "activity":
      return body.append(viewActivity(state.view));
    case "failure":
      return body.append(viewFailure(state.view));
    case "pair":
      return body.append(viewPair(state.view));
    case "rate-limited":
      return body.append(viewRateLimited(state.view));
    default:
      return body.append(viewDirectory());
  }
}

/* ================================================================== *
 * pairing — REVIEW.md G1
 *
 * A connectome is the set of one user's own sessions. Before the hub will open
 * one, it wants evidence that a human asked. The challenge is request-scoped and
 * grants nothing but addressing your own graph: no write, no standing
 * permission, no "allow this agent" (GrokVision.md §10). Every write still
 * confirms exact JSON afterwards.
 * ================================================================== */

const TURNSTILE_API = "https://challenges.cloudflare.com/turnstile/v0/api.js";

function viewPair(v) {
  const wrap = node("div", "stack");
  const box = node("div", "notice");
  box.append(strongText("Open your connectome"));
  box.append(
    pText(
      "This browser isn't paired with a connectome yet. A connectome is the set " +
        "of your own apps, so the hub asks for a quick check that a person is here."
    )
  );
  box.append(
    pText(
      "Pairing lets this browser reach your graph. It does not allow any app to " +
        "write anything — every write still shows you the exact JSON first."
    )
  );

  if (v.pairing?.configured === false) {
    box.append(
      pText("This gateway has no pairing keys configured, so it cannot open a connectome.")
    );
    wrap.append(box);
    return wrap;
  }

  const slot = node("div", "row");
  slot.id = "turnstile-slot";
  box.append(slot);

  const status = node("p", "muted");
  status.id = "pair-status";
  box.append(status);

  wrap.append(box);
  mountTurnstile(v.pairing?.siteKey, slot, status);
  return wrap;
}

/**
 * The widget is loaded on demand, only on this view. It is the one third-party
 * script the surface ever runs, and it renders into a slot rather than being
 * given the document — a hub-origin panel that asks for approvals should not
 * carry a foreign script it does not need.
 */
async function mountTurnstile(siteKey, slot, status) {
  if (!siteKey) {
    status.textContent = "This gateway did not supply a challenge key.";
    return;
  }
  try {
    await loadScript(TURNSTILE_API);
  } catch {
    status.textContent = "Could not load the challenge. Check your connection and reload.";
    return;
  }
  if (!window.turnstile) {
    status.textContent = "Could not load the challenge. Check your connection and reload.";
    return;
  }
  window.turnstile.render(slot, {
    sitekey: siteKey,
    callback: (token) => completePairing(token, status),
    "error-callback": () => {
      status.textContent = "That check did not complete. Try again.";
    },
    "expired-callback": () => {
      status.textContent = "That check expired. Try again.";
    },
  });
}

async function completePairing(token, status) {
  status.textContent = "Opening your connectome…";
  const res = await client.pair(token);
  if (res?.ok !== true) {
    // Named refusal, never a silent stop (§6.2).
    status.textContent = res?.error ?? "Pairing failed.";
    window.turnstile?.reset?.();
    return;
  }
  // The cookie is set. Re-run boot rather than reload so the anti-spoof mark and
  // the host attachment survive.
  state.view = { name: "directory" };
  await boot();
}

function viewRateLimited(v) {
  const wrap = node("div", "stack");
  const box = node("div", "notice");
  box.append(strongText("Too many requests"));
  box.append(
    pText(
      v?.detail
        ? String(v.detail)
        : "This connectome has made too many requests in a short time. Nothing further ran."
    )
  );
  box.append(pText("Wait a moment and try again. Nothing was written."));
  const row = node("div", "row");
  const again = node("button", "btn primary");
  again.textContent = "Try again";
  again.addEventListener("click", () => location.reload());
  row.append(again);
  box.append(row);
  wrap.append(box);
  return wrap;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      // A second challenge in the same panel must not re-add the tag.
      if (existing.dataset.loaded) resolve();
      else existing.addEventListener("load", () => resolve(), { once: true });
      return;
    }
    const tag = document.createElement("script");
    tag.src = src;
    tag.async = true;
    tag.addEventListener("load", () => {
      tag.dataset.loaded = "1";
      resolve();
    }, { once: true });
    tag.addEventListener("error", () => reject(new Error("script failed")), { once: true });
    document.head.append(tag);
  });
}

/* ---------------- directory ---------------- */

function viewDirectory() {
  const wrap = node("div", "stack");
  const results = filtered();

  if (!otherMembers().length) {
    // GrokVisionResponse.md Gap 2: the honest empty state. The graph can only
    // contain apps that have either been open once with the hub running, or that
    // publish /.well-known/connectome.json. Saying so beats a spinner that never
    // resolves and beats pretending the connectome is broken.
    wrap.append(
      empty(
        "No other apps yet",
        "An app joins by registering WebMCP tools. It appears here once it has been open once with the hub running, or as soon as it publishes /.well-known/connectome.json."
      )
    );
    wrap.append(addAppControl());
    return wrap;
  }

  if (!results.length) {
    wrap.append(empty("Nothing matches", `No capability or app matches “${state.filter}”.`));
    return wrap;
  }

  for (const { member, caps } of results) {
    // S1: the card is a div[role=button], not a <button>, so capability chips
    // inside it can be real buttons. Class name `.member-card` is load-bearing.
    const card = node("div", "member-card");
    card.dataset.origin = member.origin;
    card.dataset.present = member.present ? "1" : "0";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `${member.name} · ${hostLabel(member.origin)}`);
    const openMember = () => go({ name: "member", origin: member.origin });
    card.addEventListener("click", (e) => {
      if (e.target.closest(".member-chip")) return;
      openMember();
    });
    card.addEventListener("keydown", (e) => {
      if (e.target !== card) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openMember();
      }
    });

    card.append(paintMemberIcon(member));

    const text = node("span", "member-text");
    const title = node("span", "member-name");
    // Named presence (§1.2.1). textContent, never innerHTML: an app's own name is
    // still text that came from an app.
    title.textContent = member.name;
    text.append(title);

    // The origin is ALWAYS shown next to the label. GrokVisionResponse.md Gap 3:
    // the label is what the app calls itself, the origin is who it is. Showing a
    // name alone would let one app appear in the directory wearing another's.
    const org = node("span", "member-origin");
    org.textContent = hostLabel(member.origin);
    if (!member.nameAttested) org.classList.add("unattested");
    text.append(org);

    const meta = node("span", "member-meta");
    meta.textContent = member.blocked
      ? "tools turned off by this site"
      : `${caps.length} capabilit${caps.length === 1 ? "y" : "ies"}`;
    text.append(meta);

    if (!member.blocked && caps.length) {
      const chips = node("span", "member-chips");
      for (const cap of caps) {
        const chip = node("button", `member-chip ${cap.readOnly ? "read" : "write"}`);
        chip.type = "button";
        chip.textContent = cap.name;
        chip.disabled = state.paused;
        chip.title = cap.readOnly ? "reads" : "writes";
        chip.addEventListener("click", (e) => {
          e.stopPropagation();
          startEdge(member, cap);
        });
        chips.append(chip);
      }
      text.append(chips);
    }
    card.append(text);

    // Presence is transport, not membership (§7.1). Absent members stay listed.
    // The dot is never the only signal: the state is also written as text.
    const pres = node("span", "presence-wrap");
    const dot = node("span", `presence ${member.present ? "on" : "off"}`);
    dot.title = member.present ? "open now" : "not open";
    const plabel = node("span", "presence-label");
    plabel.textContent = member.present ? "open now" : "not open";
    pres.append(dot, plabel);
    card.append(pres);

    wrap.append(card);
  }
  wrap.append(addAppControl());
  return wrap;
}

function addAppControl() {
  const box = node("div", "add-app");
  const label = node("div", "add-app-label");
  label.textContent = "Add an app";
  const hint = node("p", "p");
  hint.textContent = "Type an origin that publishes /.well-known/connectome.json. We do not keep a list.";
  const row = node("div", "add-app-row");
  const input = node("input", "add-app-input");
  input.type = "url";
  input.placeholder = "http://localhost:8787  ·  8788  ·  8789";
  input.setAttribute("aria-label", "App origin");
  const btn = node("button", "btn");
  btn.type = "button";
  btn.textContent = "Add";
  const msg = node("div", "add-app-msg");
  const submit = async () => {
    msg.textContent = "";
    const origin = input.value.trim();
    const res = await client.declare(origin);
    if (!res?.ok) {
      msg.textContent = res?.error || res?.detail || "no connectome.json at that origin — we don't invent a name";
      return;
    }
    input.value = "";
    state.members = res.members ?? state.members;
    render();
  };
  btn.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
  row.append(input, btn);
  box.append(label, hint, row, msg);
  return box;
}

/* ---------------- one member ---------------- */

function viewMember(origin) {
  const member = state.members.find((m) => m.origin === origin);
  const wrap = node("div", "stack");
  if (!member) {
    wrap.append(empty("Gone", "That app is no longer in your connectome."));
    return wrap;
  }

  wrap.append(backBtn({ name: "directory" }));
  wrap.append(crumb(member.name, hostLabel(member.origin)));

  if (!member.present) {
    // §7.2 Gate B-D: fail clearly IN THE SURFACE INSIDE A, with a user-initiated
    // open control. Never a silent skip, never moving the user to B.
    const box = node("div", "notice");
    box.append(strongText(`${member.name} isn't open.`));
    box.append(
      pText(
        "Its capabilities are listed from what your connectome remembers. To run one, it needs to be open."
      )
    );
    if (member.launch) {
      const open = node("button", "btn");
      open.textContent = `Open ${member.name} in a background tab`;
      open.addEventListener("click", () => openInBackground(member, open));
      box.append(open);
    }
    wrap.append(box);
  }

  if (!member.capabilities.length) {
    wrap.append(
      empty(
        "No capabilities recorded",
        "This app is a member — it just has not told us what it can do yet. Visibility is part of accessibility."
      )
    );
    return wrap;
  }

  for (const cap of member.capabilities) {
    const row = node("button", `cap ${cap.readOnly ? "read" : "write"}`);
    row.disabled = state.paused;
    row.addEventListener("click", () => startEdge(member, cap));

    const head = node("span", "cap-head");
    const nm = node("span", "cap-name");
    nm.textContent = cap.name;
    head.append(nm);
    const badge = node("span", `badge ${cap.readOnly ? "read" : "write"}`);
    badge.textContent = cap.readOnly ? "reads" : "writes";
    head.append(badge);
    if (cap.untrusted) {
      const u = node("span", "badge untrusted");
      u.textContent = "returns user text";
      u.title = "Values from this tool are untrusted content. They are shown as data, never obeyed.";
      head.append(u);
    }
    row.append(head);

    const desc = node("span", "cap-desc");
    // Untrusted text (§6.2). Rendered as data, and never sent to a mapper as
    // anything other than an inert string.
    desc.textContent = cap.description || "No description offered.";
    row.append(desc);

    wrap.append(row);
  }
  return wrap;
}

/* ================================================================== *
 * starting an edge
 * ================================================================== */

async function startEdge(member, cap) {
  if (state.paused) return;

  // A remote READ is one consented step: name it, run it, show it here. The
  // result stays in the surface. It does NOT flow into the host page's JS —
  // that would be a second, separate edge the user has not asked for (§5.5).
  if (cap.readOnly) {
    return go({ name: "read-consent", member, cap });
  }

  // A remote WRITE needs context from this app. The user picks WHICH read
  // provides it. GrokVisionResponse.md Gap 6 fix #1: "surface opened" authorises
  // discovery, not invocation. Reads are selected, one at a time, by name.
  const host = hostMember();
  const reads = (host?.capabilities ?? []).filter((c) => c.readOnly);

  // SCHEMA_DRIFT lives here, not in invoke (T3.2 / T7.3). A stored grant whose
  // target schema moved is dead. Never auto-write to "help".
  const liveHash = await schemaHash(cap.inputSchema);
  const listed = await client.grants();
  const related = (listed?.grants ?? []).filter(
    (g) => g.target?.origin === member.origin && g.target?.tool === cap.name && !g.revoked
  );
  if (related.some((g) => g.schemaHash && g.schemaHash !== liveHash)) {
    return go({
      name: "failure",
      code: FAILURE.SCHEMA_DRIFT,
      member,
      cap,
      reads,
      detail: `${cap.name} in ${member.name} changed since you allowed it.`,
    });
  }

  const live = related.find((g) => grantIsLive(g, client.sessionId));
  if (live?.source?.tool && live.source.tool !== "(manual)") {
    const sourceCap = (host?.capabilities ?? []).find((c) => c.name === live.source.tool);
    if (sourceCap?.readOnly) {
      const res = await client.invoke({ origin: HOST_ORIGIN, toolName: sourceCap.name, args: {} });
      if (!res?.ok) {
        return go({ name: "failure", code: res?.code ?? FAILURE.TOOL_FAILED, detail: res?.detail, member });
      }
      return prepareConfirm({
        member,
        cap,
        sourceCap: { ...sourceCap, origin: HOST_ORIGIN },
        payload: res.data,
      });
    }
  }
  if (live?.source?.tool === "(manual)") {
    return prepareConfirm({ member, cap, sourceCap: null, payload: {} });
  }

  return go({ name: "source-pick", member, cap, reads });
}

async function openInBackground(member, button) {
  if (button) {
    button.disabled = true;
    button.textContent = `Opening ${member.name}…`;
  }
  const res = await client.openApp(member.origin);
  if (!res?.ok) {
    return go({
      name: "failure",
      code: res?.code ?? FAILURE.APP_UNAVAILABLE,
      detail: res?.detail,
      member,
    });
  }
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 300));
    await refreshGraph();
    const now = state.members.find((m) => m.origin === member.origin);
    if (now?.present) {
      go({ name: "member", origin: member.origin });
      return;
    }
  }
  go({ name: "member", origin: member.origin });
}

function viewReadConsent({ member, cap }) {
  const wrap = node("div", "stack");
  wrap.append(backBtn({ name: "member", origin: member.origin }));
  wrap.append(crumb(member.name, cap.name));
  const box = node("div", "notice");
  box.append(strongText(`Run ${cap.name} in ${member.name}?`));
  box.append(pText(cap.description || ""));
  box.append(
    pText(
      `It runs in ${hostLabel(member.origin)}'s own tab, under your own session there. The result is shown here, in this panel. Nothing is written, and ${hostLabel(HOST_ORIGIN)} does not receive it.`
    )
  );
  const row = node("div", "row");
  const run = node("button", "btn primary");
  run.textContent = "Run it";
  run.addEventListener("click", async () => {
    const res = await client.invoke({ origin: member.origin, toolName: cap.name, args: {} });
    if (!res?.ok) {
      return go({ name: "failure", code: res?.code ?? FAILURE.TOOL_FAILED, detail: res?.detail, member });
    }
    go({ name: "result", member, cap, data: res.data, wrote: false });
  });
  row.append(run, cancelBtn());
  box.append(row);
  wrap.append(box);
  return wrap;
}

function viewSourcePick({ member, cap, reads }) {
  const wrap = node("div", "stack");
  wrap.append(backBtn({ name: "member", origin: member.origin }));
  wrap.append(steps(WRITE_STEPS, 1));
  wrap.append(crumb(member.name, cap.name));

  const box = node("div", "notice");
  box.append(strongText(`${cap.name} needs values.`));
  box.append(
    pText(
      `Choose what in ${hostLabel(HOST_ORIGIN)} should provide them. Only the read you pick will run — opening this panel did not give anything permission to run.`
    )
  );
  wrap.append(box);

  if (!reads.length) {
    wrap.append(
      empty(
        "This app offers no reads",
        "Nothing here can supply context automatically. You can still fill the fields yourself."
      )
    );
    const manual = node("button", "btn primary");
    manual.textContent = "Fill it in myself";
    manual.addEventListener("click", () => prepareConfirm({ member, cap, sourceCap: null, payload: {} }));
    wrap.append(manual);
    return wrap;
  }

  for (const r of reads) {
    const row = node("button", "cap read");
    const head = node("span", "cap-head");
    const nm = node("span", "cap-name");
    nm.textContent = r.name;
    head.append(nm);
    row.append(head);
    const d = node("span", "cap-desc");
    d.textContent = r.description || "";
    row.append(d);
    row.addEventListener("click", async () => {
      const res = await client.invoke({ origin: HOST_ORIGIN, toolName: r.name, args: {} });
      if (!res?.ok) {
        return go({ name: "failure", code: res?.code ?? FAILURE.TOOL_FAILED, detail: res?.detail, member });
      }
      await prepareConfirm({ member, cap, sourceCap: { ...r, origin: HOST_ORIGIN }, payload: res.data });
    });
    wrap.append(row);
  }

  const manual = node("button", "btn");
  manual.textContent = "Fill it in myself";
  manual.addEventListener("click", () => prepareConfirm({ member, cap, sourceCap: null, payload: {} }));
  wrap.append(manual);
  return wrap;
}

/**
 * Ask the mapper for a FIELD CORRESPONDENCE, then apply it here, locally.
 *
 * GrokVisionResponse.md E3 / Gap 6: the mapper receives field paths, types, tool
 * names, descriptions and the target JSON Schema. It never receives a value. So a
 * mapper can live in a Worker, and even call a model, without a single byte of
 * app data leaving this device.
 */
async function prepareConfirm({ member, cap, sourceCap, payload }) {
  cap.inputSchema = parseInputSchema(cap.inputSchema);
  let mapping = {};
  let mapperName = "none";
  let notes = "";

  if (sourceCap) {
    const req = mapperRequest({
      sourceTool: { ...sourceCap, outputShape: payload },
      targetTool: { ...cap, origin: member.origin },
    });
    // mapperRequest() ran assertNoValues() on the way out. Belt and braces: the
    // Worker asserts it again on arrival, independently.
    try {
      const res = await fetch(new URL("/map", MAPPER_URL), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req),
      });
      if (res.ok) {
        const body = await res.json();
        mapping = body.mapping ?? {};
        mapperName = body.mapper ?? "static";
        notes = body.notes ?? "";
      } else {
        const body = await res.json().catch(() => null);
        // Named refusal, not a silent skip (§6.2). The mapper is still optional
        // — the user fills the fields — but they are told why it did not run.
        notes =
          body?.code === "RATE_LIMITED" || res.status === 429
            ? (body?.error ?? "Too many mapping requests — fill the fields yourself.")
            : "Mapper unreachable — fill the fields yourself.";
      }
    } catch {
      // The mapper is optional. Without it the user fills the fields. The product
      // is the surface, not the reasoner (§2.2).
      notes = "Mapper unreachable — fill the fields yourself.";
    }
  }

  const args = sourceCap
    ? applyMapping(mapping, payload, sourceCap, { ...cap, origin: member.origin })
    : blankArgs(cap);

  go({
    name: "confirm",
    member,
    cap,
    sourceCap,
    sourcePayload: payload,
    args,
    mapping,
    mapperName,
    notes,
    shape: sourceCap ? describeShape(payload) : [],
  });
}

function blankArgs(cap) {
  const out = {};
  for (const f of Object.keys(cap.inputSchema?.properties ?? {})) {
    out[f] = provenanced(undefined, PROV.MISSING, null, false);
  }
  return out;
}

/* ================================================================== *
 * THE CONFIRM CARD
 *
 * §6.2: writes always confirm, exact JSON, in the in-app surface. Dismiss,
 * navigate away or close cancels, and nothing is written.
 *
 * Plus GrokVisionResponse.md E4: every field says where its value came from.
 * That is what stops App B's untrusted output being laundered into a write the
 * user approves without realising whose text it is.
 * ================================================================== */

function viewConfirm(v) {
  const { member, cap, sourceCap, args } = v;
  const wrap = node("div", "stack");
  wrap.append(steps(WRITE_STEPS, 2));
  wrap.append(crumb(member.name, cap.name));

  const intro = node("div", "notice");
  intro.append(strongText(`${cap.name} in ${member.name}`));
  intro.append(pText(cap.description || ""));
  if (sourceCap) {
    intro.append(
      pText(
        `Values below were taken from ${sourceCap.name} in ${hostLabel(HOST_ORIGIN)} and matched to this app's fields by the ${v.mapperName} mapper. The mapper saw field names and types only — never your data.`
      )
    );
  }
  if (v.notes) intro.append(pText(v.notes));
  wrap.append(intro);

  const fields = node("div", "fields");
  const schema = parseInputSchema(cap.inputSchema);
  const props = schema.properties ?? {};
  const required = new Set(schema.required ?? []);

  for (const [name, spec] of Object.entries(props)) {
    const current = args[name] ?? provenanced(undefined, PROV.MISSING, null, false);
    const row = node("label", "field");

    const human = node("span", "field-label");
    human.textContent = humanizeField(name);
    row.append(human);

    const head = node("span", "field-head");
    const lbl = node("span", "field-name");
    lbl.textContent = name;
    head.append(lbl);
    if (required.has(name)) {
      const req = node("span", "badge req");
      req.textContent = "required";
      head.append(req);
    }
    const ty = node("span", "field-type");
    ty.textContent = spec.type ?? "any";
    head.append(ty);
    row.append(head);

    const input = node("input", "field-input");
    input.dataset.field = name;
    input.value = current.value ?? "";
    input.placeholder = current.how === PROV.MISSING ? "nothing found — type a value" : "";
    input.addEventListener("input", () => {
      const raw = input.value;
      const typed = spec.type === "number" || spec.type === "integer" ? Number(raw) : raw;
      // A value the user edits becomes THEIR value. Provenance changes with it,
      // because "you typed this" is a different claim from "it came from there".
      v.args[name] = provenanced(raw === "" ? undefined : typed, PROV.TYPED, null, false);
      refreshJson(v);
    });
    row.append(input);

    row.append(provenanceLine(current));
    fields.append(row);
  }
  wrap.append(fields);

  // The exact JSON. Not a summary of it, not a rendering of it — it.
  const jsonBox = node("div", "json");
  const jsonHead = node("div", "json-head");
  jsonHead.textContent = "Exactly this will be sent";
  jsonBox.append(jsonHead);
  const pre = node("pre", "json-body");
  pre.id = "json-preview";
  jsonBox.append(pre);
  wrap.append(jsonBox);

  // Grant scope. This is the ONLY thing consent buys: permission to propose this
  // edge again, and to run that named read. It never buys a write.
  const scope = node("div", "scope");
  scope.append(
    pText(
      "Remembering this connection lets your connectome offer it again without rebuilding it. It never sends anything on its own — every write still shows you this card."
    )
  );
  const sel = node("select", "scope-select");
  sel.id = "scope";
  for (const [label, value] of [
    ["Just this once", GRANT_SCOPE.ONCE],
    ["For this browsing session", GRANT_SCOPE.SESSION],
    ["Until I revoke it", GRANT_SCOPE.UNTIL_REVOKED],
  ]) {
    const opt = node("option");
    opt.value = value;
    opt.textContent = label;
    sel.append(opt);
  }
  sel.value = GRANT_SCOPE.SESSION;
  scope.append(sel);
  wrap.append(scope);

  const problems = node("div", "problems");
  problems.id = "problems";
  wrap.append(problems);

  // The decision is sticky: on long schemas Approve never leaves the viewport.
  const actions = node("div", "confirm-actions");
  const approve = node("button", "btn primary");
  approve.id = "approve";
  approve.textContent = "Approve and send";
  approve.addEventListener("click", () => doWrite(v));
  actions.append(approve, cancelBtn(FAILURE.CONSENT_DENIED));
  wrap.append(actions);

  queueMicrotask(() => refreshJson(v));
  return wrap;
}

function provenanceLine(p) {
  const line = node("span", "prov");
  const tag = node("span", `prov-tag ${p.how}`);
  switch (p.how) {
    case PROV.READ:
      tag.textContent = `read from ${hostLabel(p.fromOrigin)}`;
      // The chip carries the source app's colour: a visual trace from this
      // field back to the app the value came from, no reading required.
      if (p.fromOrigin) tag.style.setProperty("--app-hue", appHue(p.fromOrigin));
      break;
    case PROV.TYPED:
      tag.textContent = "you typed this";
      break;
    case PROV.CONSTANT:
      tag.textContent = "fixed by the adapter";
      break;
    case PROV.MAPPED:
      tag.textContent = "proposed by the mapper";
      break;
    default:
      tag.textContent = "nothing found";
  }
  line.append(tag);
  if (p.untrusted) {
    // The single most useful anti-injection affordance in the product: the user
    // can see which values are somebody else's free text.
    const warn = node("span", "prov-tag untrusted");
    warn.textContent = "untrusted text from another app";
    line.append(warn);
  }
  return line;
}

function refreshJson(v) {
  const exact = plainArgs(v.args);
  for (const k of Object.keys(exact)) if (exact[k] === undefined) delete exact[k];
  const pre = document.getElementById("json-preview");
  if (pre) highlightJson(pre, exact);

  const problems = validateArgs(exact, v.cap.inputSchema);
  const box = document.getElementById("problems");
  const approve = document.getElementById("approve");
  if (!box || !approve) return;
  box.replaceChildren();
  for (const input of document.querySelectorAll(".field-input[aria-invalid]")) {
    input.removeAttribute("aria-invalid");
  }
  // Never coerce silently (§4.4: "the user is the last schema check"). We block
  // and say what is wrong; we do not helpfully guess.
  for (const p of problems) {
    const line = node("div", "problem");
    line.textContent = `${p.field}: ${p.problem}`;
    box.append(line);
    const bad = document.querySelector(`.field-input[data-field="${CSS.escape(p.field)}"]`);
    if (bad) bad.setAttribute("aria-invalid", "true");
  }
  approve.disabled = problems.length > 0;
}

async function doWrite(v) {
  const exact = plainArgs(v.args);
  for (const k of Object.keys(exact)) if (exact[k] === undefined) delete exact[k];

  const source = v.sourceCap
    ? { origin: HOST_ORIGIN, tool: v.sourceCap.name }
    : { origin: HOST_ORIGIN, tool: "(manual)" };
  const target = { origin: v.member.origin, tool: v.cap.name };

  // Record the grant with a hash of the schema we just showed. If the target's
  // inputSchema moves later, the grant is stale and the surface says so rather
  // than reusing a mapping against a shape that no longer exists.
  const key = edgeKey(source, target);
  await client.grant({
    source,
    target,
    scope: document.getElementById("scope")?.value ?? GRANT_SCOPE.SESSION,
    schemaHash: await schemaHash(v.cap.inputSchema),
  });

  const res = await client.invoke({ origin: v.member.origin, toolName: v.cap.name, args: exact });
  if (!res?.ok) {
    // One write, then stop. No retry, no skip, no DEGRADED (§6.2, §10).
    return go({
      name: "failure",
      code: res?.code ?? FAILURE.TOOL_FAILED,
      detail: res?.detail,
      member: v.member,
      ran: exact,
    });
  }
  await client.useGrant(key);
  go({ name: "result", member: v.member, cap: v.cap, data: res.data, wrote: true, sent: exact, edge: key });
}

/* ---------------- result ---------------- */

function viewResult(v) {
  const wrap = node("div", "stack");
  wrap.append(crumb(v.member.name, v.cap.name));

  const box = node("div", "notice ok");
  box.setAttribute("aria-live", "polite");
  const mark = node("div", "result-mark");
  mark.setAttribute("aria-hidden", "true");
  box.append(mark);
  box.append(strongText(v.wrote ? "Done." : "Result"));
  box.append(
    pText(
      v.wrote
        ? `${v.cap.name} ran in ${v.member.name}. You are still in ${hostLabel(HOST_ORIGIN)}.`
        : `Read from ${v.member.name}. Shown here only — ${hostLabel(HOST_ORIGIN)} did not receive it.`
    )
  );
  wrap.append(box);

  // The product promise, visible from across the room: you never left your app.
  const host = hostMember();
  const locus = node("div", "locus");
  locus.style.setProperty("--app-hue", appHue(HOST_ORIGIN));
  locus.textContent = `You're still in ${host?.name ?? hostLabel(HOST_ORIGIN)} · ${HOST_ORIGIN}`;
  wrap.append(locus);

  if (v.sent) {
    wrap.append(jsonBlock("What was sent", v.sent));
  }
  // The result is untrusted data from another app. Rendered as JSON text, never
  // as HTML, never as instructions (§6.2).
  wrap.append(jsonBlock("What came back", v.data));

  const row = node("div", "row");
  const back = node("button", "btn");
  back.textContent = "Back to apps";
  back.addEventListener("click", () => go({ name: "directory" }));
  row.append(back);
  wrap.append(row);
  return wrap;
}

/* ---------------- failure ---------------- */

function viewFailure(v) {
  const copy = FAILURE_COPY[v.code] ?? { title: "Stopped", action: "none" };
  const wrap = node("div", "stack");
  const box = node("div", "notice bad");
  box.setAttribute("aria-live", "polite");
  const mark = node("div", "result-mark bad");
  mark.setAttribute("aria-hidden", "true");
  box.append(mark);
  box.append(strongText(copy.title));
  if (v.detail) box.append(pText(String(v.detail)));
  box.append(pText("Nothing further ran. Nothing was retried."));
  if (v.ran) box.append(jsonBlock("What we tried to send", v.ran));

  const row = node("div", "row");
  if (copy.action === "open" && v.member) {
    const open = node("button", "btn primary");
    open.textContent = `Open ${v.member.name} in a background tab`;
    open.addEventListener("click", () => openInBackground(v.member, open));
    row.append(open);
  }
  if (copy.action === "grant" && v.member && v.cap) {
    const again = node("button", "btn primary");
    again.textContent = "Allow it again";
    again.addEventListener("click", () =>
      go({ name: "source-pick", member: v.member, cap: v.cap, reads: v.reads ?? [] })
    );
    row.append(again);
  }
  if (copy.action === "retry") {
    const again = node("button", "btn primary");
    again.textContent = "Try again";
    again.addEventListener("click", () => location.reload());
    row.append(again);
  }
  const back = node("button", "btn");
  back.textContent = "Back to apps";
  back.addEventListener("click", () => go({ name: "directory" }));
  row.append(back);
  box.append(row);
  wrap.append(box);
  return wrap;
}

/* ---------------- grants ledger ---------------- */

async function openGrants() {
  const res = await client.grants();
  go({ name: "grants", grants: res?.grants ?? [] });
}

function viewGrants(v) {
  const wrap = node("div", "stack");
  wrap.append(backBtn({ name: "directory" }));
  wrap.append(crumb("Your connectome", "connections you have allowed"));

  const note = node("div", "notice");
  note.append(
    pText(
      "Each row is one direction between two capabilities. Allowing a connection lets it be offered again. It never authorises a write — every write shows you the exact JSON first."
    )
  );
  wrap.append(note);

  if (!v.grants.length) {
    wrap.append(empty("Nothing allowed yet", "Connections appear here as you approve them."));
  }

  for (const g of v.grants) {
    const row = node("div", "grant");
    const t = node("div", "grant-text");
    const line = node("div", "grant-line");
    line.textContent = `${hostLabel(g.source.origin)} · ${g.source.tool}  →  ${hostLabel(g.target.origin)} · ${g.target.tool}`;
    t.append(line);
    const meta = node("div", "grant-meta");
    const uses = Number(g.uses) || 0;
    const usesLabel = uses === 0 ? "not used yet" : uses === 1 ? "used 1 time" : `used ${uses} times`;
    meta.textContent = g.revoked
      ? `revoked ${new Date(g.revoked).toLocaleString()}`
      : `${g.scope} · allowed ${new Date(g.granted).toLocaleString()} · ${usesLabel}`;
    t.append(meta);
    row.append(t);
    if (!g.revoked) {
      const rev = node("button", "btn small danger");
      rev.textContent = "Revoke";
      rev.addEventListener("click", async () => {
        await client.revoke(g.key);
        openGrants();
      });
      row.append(rev);
    }
    wrap.append(row);
  }

  const tools = node("div", "row wrap");
  for (const m of otherMembers()) {
    const b = node("button", "btn small");
    b.textContent = `Forget ${m.name}`;
    b.title = `Removes ${m.origin} and every connection that pointed at it.`;
    b.addEventListener("click", async () => {
      await client.forget(m.origin);
      await refreshGraph();
      openGrants();
    });
    tools.append(b);
  }
  const exp = node("button", "btn small");
  exp.textContent = "Export everything";
  exp.addEventListener("click", async () => {
    const data = await client.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "connectome-export.json";
    a.click();
  });
  tools.append(exp);
  wrap.append(tools);
  return wrap;
}

async function openActivity() {
  const res = await client.audit();
  go({ name: "activity", audit: res?.audit ?? [] });
}

function viewActivity(v) {
  const wrap = node("div", "stack");
  wrap.append(backBtn({ name: "directory" }));
  wrap.append(crumb("Your connectome", "what ran"));

  const note = node("div", "notice");
  note.append(
    pText(
      "Metadata only — which edge, what kind of event, whether it forwarded or was refused. Never the JSON you approved, never a result."
    )
  );
  wrap.append(note);

  const rows = Array.isArray(v.audit) ? v.audit : [];
  if (!rows.length) {
    wrap.append(empty("Nothing yet", "Grants, relays, pauses and forgotten apps appear here as they happen."));
    return wrap;
  }

  for (const row of rows) {
    const item = node("div", "grant");
    const t = node("div", "grant-text");
    const line = node("div", "grant-line");
    line.textContent = [row.kind, row.edge, row.outcome].filter(Boolean).join(" · ");
    t.append(line);
    const meta = node("div", "grant-meta");
    meta.textContent = row.at ? new Date(row.at).toLocaleString() : "";
    t.append(meta);
    item.append(t);
    wrap.append(item);
  }
  return wrap;
}

/* ================================================================== *
 * tiny DOM helpers — textContent only, never innerHTML.
 * Every string in this surface came from another application.
 * ================================================================== */

function el(id) {
  return document.getElementById(id);
}

function node(tag, cls) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  return n;
}

function strongText(text) {
  const n = node("div", "strong");
  n.textContent = text;
  return n;
}

function pText(text) {
  const n = node("p", "p");
  n.textContent = text;
  return n;
}

function empty(title, body) {
  const box = node("div", "empty");
  box.append(strongText(title), pText(body));
  return box;
}

function crumb(title, sub) {
  const box = node("div", "crumb");
  box.setAttribute("aria-current", "page");
  const a = node("div", "crumb-title");
  a.textContent = title;
  const b = node("div", "crumb-sub");
  b.textContent = sub;
  box.append(a, b);
  return box;
}

function jsonBlock(label, data) {
  const box = node("div", "json");
  const head = node("div", "json-head");
  head.textContent = label;
  const pre = node("pre", "json-body");
  highlightJson(pre, data);
  box.append(head, pre);
  return box;
}

function cancelBtn(code) {
  const b = node("button", "btn");
  b.textContent = "Cancel";
  b.addEventListener("click", () => {
    if (code) return go({ name: "failure", code });
    go({ name: "directory" });
  });
  return b;
}

/* ================================================================== *
 * visual language helpers (KimiPlan.md §4)
 *
 * These paint. They never decide: no flow, no consent, no data handling
 * lives here.
 * ================================================================== */

/**
 * Deterministic per-origin hue — every app gets a stable "face" colour with
 * no network and no app-supplied asset. Used for avatars, provenance dots,
 * and the locus chip. Decorative only; identity is still the origin string.
 */
function appHue(origin) {
  let h = 0;
  for (const c of String(origin)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 360;
}

/** S2: `clientName` → "Client name". The mono `.field-name` still shows the raw key. */
function humanizeField(name) {
  const spaced = String(name)
    .replace(/[_\-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
  if (!spaced) return String(name);
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * S3: an <img> only when the icon URL resolves to THIS member's origin.
 * Paths like `/icon.svg` are fine. data:, javascript:, other origins, and
 * raw SVG markup are not — never innerHTML an app-supplied string.
 */
function sameOriginIconUrl(member) {
  const raw = member?.icon;
  if (typeof raw !== "string" || !raw.trim()) return null;
  if (raw.trimStart().startsWith("<")) return null;
  try {
    const url = new URL(raw, member.origin);
    if (url.origin !== member.origin) return null;
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function paintMemberIcon(member) {
  const icon = node("span", "member-icon");
  icon.style.setProperty("--app-hue", appHue(member.origin));
  icon.textContent = (member.name || "?").slice(0, 1).toUpperCase();
  const src = sameOriginIconUrl(member);
  if (!src) return icon;
  const img = node("img", "member-icon-img");
  img.alt = "";
  img.referrerPolicy = "no-referrer";
  img.addEventListener("error", () => img.remove());
  img.addEventListener("load", () => {
    icon.textContent = "";
    icon.append(img);
  });
  img.src = src;
  return icon;
}

/**
 * The JSON stays EXACT: the same characters as JSON.stringify, only wrapped
 * in spans for colour. Built with createElement + textContent — never
 * innerHTML — so the <pre>'s textContent is byte-identical to the payload,
 * and untrusted values stay inert text.
 *
 * Input is always our own JSON.stringify output, so a tiny tokenizer over a
 * well-formed string suffices: strings (with a trailing-colon check to tell
 * keys from string values), numbers, booleans, null; everything else is
 * plain text nodes.
 */
function highlightJson(pre, data) {
  const text = JSON.stringify(data, null, 2);
  pre.replaceChildren();
  const re =
    /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false)\b|\b(null)\b/g;
  let last = 0;
  let m;
  const paint = (cls, s) => {
    const sp = node("span", cls);
    sp.textContent = s;
    pre.append(sp);
  };
  while ((m = re.exec(text))) {
    if (m.index > last) pre.append(document.createTextNode(text.slice(last, m.index)));
    if (m[1] !== undefined) {
      if (m[2] !== undefined) {
        paint("tok-key", m[1]);
        pre.append(document.createTextNode(m[2]));
      } else {
        paint("tok-str", m[1]);
      }
    } else if (m[3] !== undefined) {
      paint("tok-num", m[3]);
    } else if (m[4] !== undefined) {
      paint("tok-bool", m[4]);
    } else if (m[5] !== undefined) {
      paint("tok-null", m[5]);
    }
    last = re.lastIndex;
  }
  if (last < text.length) pre.append(document.createTextNode(text.slice(last)));
}

/**
 * Orientation chips: where am I in the write flow. Purely informational —
 * they are not links and change no state.
 */
const WRITE_STEPS = ["Pick what to do", "Pick the source", "Check & approve"];

function steps(labels, nowIndex) {
  const row = node("div", "steps");
  labels.forEach((label, i) => {
    const s = node("span", "step" + (i < nowIndex ? " done" : i === nowIndex ? " now" : ""));
    s.textContent = `${i + 1} · ${label}`;
    row.append(s);
  });
  return row;
}

/** Quiet way back. Cancel on the confirm card remains the CONSENT_DENIED path. */
function backBtn(target) {
  const b = node("button", "back");
  b.type = "button";
  b.textContent = "‹ Back";
  b.addEventListener("click", () => go(target));
  return b;
}

boot();
