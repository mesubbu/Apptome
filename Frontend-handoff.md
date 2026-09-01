# Connectome frontend hand-off

You are taking over the **in-app surface**. That panel is the product. Everything else (gateway, Durable Object, mapper, stubs, extension) already works. Your job is to make the panel clearer, nicer, and harder to misuse — **without turning it into a chat app, a cockpit, or the CRM's own UI**.

Read this file before you touch CSS. If a sentence here disagrees with a clever idea you had, this file wins until a product owner says otherwise.

Product law (do not reopen): `GrokVision.md` §1 and §8.

---

## 0. What you are building, in one picture

The user is **already in Acme CRM** (`http://localhost:8787`), looking at a client named River North Studio.

They click a dark **Connectome** badge on the right edge of the CRM page.

A **narrow panel** slides over the right side of that same window. It is **not** the CRM. It lists **other apps by name** (Ledger, Tick). They pick Ledger → `create-invoice` → pick a CRM read → see the **exact JSON** that would be sent → click **Approve and send**. A draft invoice appears in Ledger. **They never left the CRM.**

If a screenshot of your work cannot answer “yes” to all four, you shipped the wrong product:

1. Still in an app they already use, not a generic agent shell?
2. Can they point at **another app, by name**, in that window?
3. Can they use that other app from here?
4. Did those two apps have to share a stack or schema? (Must be **no**.)

That test is `GrokVision.md` §2.4. Gate B screenshots that already pass it: `connectome/gates/gate-b/`.

---

## 1. Run it (copy-paste)

All commands are from **`connectome/`**, never from the Apptome repo root.

```bash
cd connectome
pnpm install
pnpm dev
```

Wait until the banner prints six URLs. Then:

| What | URL | You style this? |
|---|---|---|
| Acme CRM (host app) | http://localhost:8787 | **No.** Stub. Leave it looking like a boring CRM. |
| Ledger (invoicing) | http://localhost:8788 | **No.** |
| Tick (timers) | http://localhost:8789 | **No.** |
| **Surface (THE PRODUCT)** | http://localhost:8790 | **Yes.** |
| Gateway | http://localhost:8791 | No. |
| Mapper | http://localhost:8792 | No. |

Then:

1. Open Chrome. Open **CRM** and **Ledger** as two tabs.
2. In the CRM tab, click the vertical **Connectome** badge on the right.
3. The panel you see is `http://localhost:8790` inside an iframe. **That** is what you design.

Chrome's WebMCP flag is optional. A polyfill is already installed. You do not need `chrome://flags/#enable-webmcp-testing`.

Hot reload: the surface is static files under `connectome/hub/surface/public/`. Save `surface.css` / `surface.js` / `index.html` and refresh the CRM tab (or close and reopen the badge). If a change does not appear, hard-refresh the iframe origin: open `http://localhost:8790/` in its own tab once.

Ctrl-C stops the mesh.

---

## 2. Mental model (do not skip)

Three origins, three jobs. Mixing them up is how you leak data or fake a confirm.

```
┌─────────────────────────────────────────────────────────────┐
│  CRM window   origin http://localhost:8787                  │
│  (the user's app — you do not own this DOM)                 │
│                                                             │
│   clients list, River North Studio, …                       │
│                                                             │
│   ┌─ iframe #connectome-surface-frame ───────────────────┐  │
│   │  origin http://localhost:8790                         │  │
│   │  THIS is your UI. The CRM cannot read this DOM.       │  │
│   │  Confirm lives here. Payloads live here.              │  │
│   └───────────────────────────────────────────────────────┘  │
│                          ▲                                  │
│   badge #connectome-badge│  asks the hub to open the iframe │
│   (injected by the bridge; not the CRM's HTML)              │
└─────────────────────────────────────────────────────────────┘
```

- **CRM cannot** see Ledger's invoice fields. Do not `postMessage` payloads to `window.parent`. Ever. `config.js` exists to remind you. CI greps for `window.parent` under `hub/surface/`.
- **The iframe is hub origin** (`:8790`). That is the whole security model. Do not move this HTML onto `:8787`.
- **The badge does not open the iframe.** It asks the hub. A fake badge painted by a hostile page cannot produce a real surface. Do not “simplify” this into `iframe.src = ...` from the CRM.

Two transports, **one UI**. You do not design two panels.

| Transport | Label in the rooted bar | What it means for you |
|---|---|---|
| Edge | `edge hub` | WebSocket + sealed envelopes. Default without the extension. |
| Extension | `on-device hub` | Chrome extension. Payloads never leave the device. Needed for “Open in a background tab”. |

`HubClient` (`hub-client.js`) hides the difference. Call `client.invoke`, `client.grant`, `client.openApp`. Do not add a second client.

---

## 3. Files you may edit

Stay in this folder unless a task explicitly says otherwise:

```
connectome/hub/surface/public/
  index.html      chrome: header, rooted-in bar, search, #body, footer
  surface.css     all visual design
  surface.js      all views and the confirm flow  ← the product
  hub-client.js   how the panel talks to the hub  ← do not restyle; rarely touch
  config.js       EXT_ID, GATEWAY_URL, MAPPER_URL ← do not “clean up”
  _headers        Permissions-Policy: tools=()    ← do not remove
```

**Do not edit** (generated or not yours):

| Path | Why |
|---|---|
| `hub/surface/public/protocol/protocol.js` | Copy from `packages/protocol/`. `pnpm sync` overwrites it. |
| `packages/bridge/bridge.js` | Injects the badge + iframe. Only touch if you are changing **how the panel attaches**, not how it looks inside. |
| Stub apps under `apps/stub-*` | Those are fake CRMs. Making them pretty is not the product. |
| `hub/gateway/`, `hub/mapper/`, `extension/` | Backend / transport. |

If you need a new failure title, edit `FAILURE_COPY` in `packages/protocol/protocol.js`, then run `pnpm sync` from `connectome/`. Do not hard-code a parallel copy table in `surface.js`.

---

## 4. How the panel is attached (read once)

You will be tempted to restyle the **iframe** and the **badge**. They are **not** in `surface.css`. They are inline styles in the page bridge:

`connectome/packages/bridge/bridge.js` → `mountSurface()` and `installBadge()`.

Current iframe:

- `position: fixed; top: 0; right: 0;`
- `width: min(420px, 100vw); height: 100vh;`
- `z-index: 2147483646`
- `allow=""` (empty — **never** `allow="tools"`)
- `id="connectome-surface-frame"`
- URL: `http://localhost:8790/surface?host=<the app's origin>&session=...`

Current badge:

- `id="connectome-badge"`
- dark vertical tab, `z-index: 2147483645`
- click sends `{ t: "request-surface" }` to the hub, it does **not** create the iframe itself

The surface is a **420px-wide column**, not a full-page app. Design for ~360–420px. There is no separate mobile site. On a phone it should still be a full-height sheet (`100vw`).

SPA: wrangler serves `index.html` for `/surface`. Query params matter:

| Param | Meaning |
|---|---|
| `host` | Origin of the window you are attached to, e.g. `http://localhost:8787`. Directory must **hide** this origin. Rooted bar must **show** it. |
| `session` | Spoke session id. Pass through. Do not invent one. |
| `transport` | Informational. Real transport is chosen by `HubClient.connect()`. |

---

## 5. The chrome (always on screen)

`index.html` is the shell. `#body` is the only region `render()` replaces. **Do not** put the confirm card outside `#body`. **Do not** replace the header with a hamburger that hides whose panel this is.

```
┌──────────────────────────────────────┐
│ [◆▲] Connectome     Connections Pause × │  dark header (.chrome)
├──────────────────────────────────────┤
│ in  Acme CRM  http://localhost:8787  │  (.rooted) name AND origin
│                              edge hub│
├──────────────────────────────────────┤
│ [paused banner — only when paused]   │
├──────────────────────────────────────┤
│ [ Search apps and capabilities     ] │  search, NOT a prompt
├──────────────────────────────────────┤
│                                      │
│           #body  (views)             │
│                                      │
├──────────────────────────────────────┤
│ Apps stay origin-isolated. ...       │  footer — keep a version of this
└──────────────────────────────────────┘
```

### Anti-spoof mark (`#mark`)

On first load, `surface.js` picks two glyphs + a hue, stores them in **hub-origin** `localStorage` key `connectome.mark`, paints `#mark`, and sets CSS `--hue`.

A fake panel on another origin **cannot** read that value. That is the anti-phishing mechanism (Gate B, `gates/gate-b/08-real-mark.png` vs `09-hostile-fake.png`).

Rules:

- Do not move the mark into the CRM.
- Do not read/write `connectome.mark` from any other origin.
- You **may** restyle `.mark` (size, radius). Keep it visible in the header.
- `--hue` drives `--accent`. If you hard-code a brand blue and ignore `--hue`, every user's mark color stops matching the chrome and the mark gets weaker.

### Rooted-in bar

Always show **both**:

- host **name** (`#host-name`) — a label the app chose; untrusted text
- host **origin** (`#host-origin`) — who it actually is

Never show the name alone. App A could call itself “Ledger”.

Transport pill: `on-device hub` vs `edge hub`. Keep those two strings or Gate notes / tests that look for “on-device” will fail.

### Search

It filters the **directory of named apps and capabilities**. It is not ChatGPT.

Do **not** replace `#search` with a textarea that “just runs the query”. That quietly turns every other app into an anonymous backend (`GrokVision.md` §10).

---

## 6. Views (the state machine)

`state.view.name` is one of the strings below. `go({ name: "..." })` is how you navigate. `render()` is a full replace of `#body` (`replaceChildren`). There is no React, no router, no shadow DOM.

```
directory ──► member ──► read-consent ──► result
                │
                ├──► source-pick ──► confirm ──► result
                │                      │
                │                      └── Cancel ► failure (CONSENT_DENIED)
                │
                └── (app closed, has launch) ► Open in background tab
                         └── still on member, then confirm as usual

SCHEMA_DRIFT / APP_UNAVAILABLE / HUB_UNAVAILABLE ► failure
    action "open"  ► Open in a background tab
    action "grant" ► Allow it again (back to source-pick)
    action "retry" ► location.reload()
```

| `view.name` | Function | What the user sees |
|---|---|---|
| `directory` | `viewDirectory` | Other members as `.member-card`. Never the host app. Empty copy if none. **Add an app** at the bottom. |
| `member` | `viewMember` | One app: origin, presence, capabilities (`.cap`). If `present === false`, a notice + **Open … in a background tab**. |
| `read-consent` | `viewReadConsent` | “Run `list-invoices` in Ledger?” Reads are still named, one at a time. Opening the panel did **not** authorize a read. |
| `source-pick` | `viewSourcePick` | Write needs values. User picks **which host read** supplies them, or “Fill it in myself”. |
| `confirm` | `viewConfirm` | **The product.** Fields + provenance tags + **exact JSON** + Approve + Cancel + grant-scope select. |
| `result` | `viewResult` | “Done.” / “Result”, JSON of what was sent and what came back. “You are still in localhost:8787.” |
| `grants` | `viewGrants` | Connections list, Revoke, Forget, Export. |
| `failure` | `viewFailure` | Title from `FAILURE_COPY`. “Nothing further ran. Nothing was retried.” No silent retry. |

`window.__connectomeState` is a test hook. Leave it. Do not build a debug overlay on it for users.

---

## 7. Directory and member cards (copy these classes)

Gate drivers look for **text** and these class names. If you rename them, you break screenshots and future tests. Restyle freely; **keep the class names**.

| Class / attr | Role |
|---|---|
| `.member-card` | One other app. Click → member view. |
| `.member-card` `data-origin` | Full origin, e.g. `http://localhost:8788`. |
| `.member-card` `data-present` | `"1"` or `"0"`. |
| `.member-name` | Label (textContent). |
| `.member-origin` | Hostname. Always visible. `.unattested` if we invented the label. |
| `.member-meta` | “N capabilities” **or** “tools turned off by this site” when `blocked`. |
| `.presence.on` / `.presence.off` | Green / grey dot. Presence is **transport**, not membership. A grey dot still lists the app. |
| `.empty` | Honest empty: **“No other apps yet”**. Do not use a spinner that never ends. |
| `.add-app` `.add-app-input` `.add-app-label` | User types an origin that publishes `/.well-known/connectome.json`. We do **not** keep a directory of apps. |
| `.cap` | One capability. Disabled when paused. |
| `.cap-name` | Tool name, monospace. |
| `.badge.read` / `.badge.write` | `reads` / `writes`. Writes are visually hotter on purpose. |
| `.badge.untrusted` | “returns user text”. |
| `.notice` `.notice.ok` `.notice.bad` | Info / success / failure boxes. |
| `#json-preview` | The exact JSON on the confirm card. **This id is load-bearing.** |
| `#approve` | “Approve and send”. Disabled when `validateArgs` finds problems. |
| `#scope` | Grant duration: once / session / until-revoked. |
| `#paused-banner` | Hidden unless paused. |
| `#pause` | Label “Pause” / “Resume”. `.danger` when paused. |

Directory rule: **`otherMembers()` filters out `HOST_ORIGIN`**. The CRM must not see itself as a neighbor. If you “helpfully” show the host app in the list, you broke §5.4.

Presence rule: if Ledger's tab is closed, **do not remove the card**. Show it grey, open the member view, copy “Ledger isn't open.”, offer background open. Hiding it would make the graph a live tab list, which is explicitly not the product.

---

## 8. The confirm card (do not “simplify”)

This is the whole product. If you only remember one screen, remember this one.

A **write** always:

1. Shows every field of the target `inputSchema`.
2. Shows **where each value came from** (provenance).
3. Shows a `<pre id="json-preview">` of **exactly** the object that will be sent — not a summary, not a pretty table of “Invoice for River North, $180”.
4. Lets the user edit a field. Editing flips provenance to **you typed this**.
5. Blocks Approve when required fields are empty or types do not match. **Never coerce** (`"180"` → `180` silently in a way the user did not type; the input handler already parses numbers when the schema says number — do not add more magic).
6. On Cancel / close / navigate away: **nothing is written** (`CONSENT_DENIED`).
7. On Approve: `doWrite` → `client.grant` (metadata only) → `client.invoke` with that exact object → `client.useGrant`. One write, then stop. No retry button that re-sends.

### Provenance tags (must stay readable, not cute)

| `how` | Tag copy today |
|---|---|
| `read` | `read from localhost:8787` |
| `typed` | `you typed this` |
| `constant` | `fixed by the adapter` |
| `mapped` | `proposed by the mapper` |
| `missing` | `nothing found` |
| + `untrusted` | extra tag: `untrusted text from another app` |

Untrusted is the anti-injection affordance. If a note from CRM is someone else's free text, the user has to see that **before** they send it to Ledger. Do not hide provenance in a tooltip.

### Grant scope

The select under the JSON is **not** “auto-send next time”. Copy already says so. Keep that idea even if you rewrite the sentence:

> Remembering this connection lets your connectome **offer it again**. It never sends anything on its own.

Values: `once` | `session` | `until-revoked` (`GRANT_SCOPE` in protocol). Default `session`.

A live grant may skip **source-pick** (re-run the named host read and jump to confirm). It must **never** skip confirm. If you add “just send it, they already allowed this”, you have built a different product and CI / Gate E will fail.

### Mapper

`prepareConfirm` POSTs to `http://localhost:8792/map` with **field names and types only**. `assertNoValues` throws if a value sneaks in. You never show the mapper's internals. If the mapper is down, the user fills the form. The product still works. Do not block the confirm behind a spinner on `:8792`.

---

## 9. Failures (closed set)

Do not invent `DEGRADED`, `RETRYING`, or toast-and-continue. Titles live in `FAILURE_COPY`:

| Code | Title the user sees | Button |
|---|---|---|
| `APP_UNAVAILABLE` | That app isn't open | Open in a background tab |
| `TOOL_NOT_FOUND` | That capability is no longer offered | (refresh / back) |
| `CONSENT_REQUIRED` | You haven't allowed this connection yet | Allow it again |
| `CONSENT_DENIED` | You declined. Nothing was written. | none |
| `SCHEMA_INVALID` | The proposed values don't fit | edit |
| `TOOL_FAILED` | The app rejected the request | none |
| `AUTH_REQUIRED` | Sign in to that app first | Open in a background tab |
| `PERMISSION_BLOCKED` | That site has turned tools off | none |
| `HUB_UNAVAILABLE` | Can't reach your connectome | Try again |
| `SCHEMA_DRIFT` | That capability changed since you allowed it | Allow it again |

Always also say: **“Nothing further ran. Nothing was retried.”**

Open-or-focus: button copy is `Open ${name} in a background tab`. The extension creates the tab with `active: false` so **focus stays in the CRM**. You never `window.open` from the surface. You call `client.openApp(origin)`, then poll `refreshGraph()` until `present`. Edge transport returns `APP_UNAVAILABLE` for open — show that failure, do not pretend it opened.

---

## 10. DOM rules (non-negotiable)

Every string in this panel came from another application (names, descriptions, origins, JSON, errors). XSS here is a confused-deputy bug.

In `surface.js` today:

- `node()` + `textContent` only
- **zero** `innerHTML`
- **zero** `document.write`
- **zero** markdown rendering of tool descriptions

If you add a component framework, the rule does not change: treat all app-provided strings as text. No `v-html`, no `dangerouslySetInnerHTML`, no `innerHTML` in a “just this once” helper.

`description` on a tool is **untrusted**. Render it as a caption, never as HTML, never concatenate it into a prompt.

---

## 11. Visual design contract

The surface must look like **a different thing attached to this window**, from across the room (`surface.css` header comment). The CRM is light, blue-ish, “Acme”. The surface is:

- Dark header (`#0f1115`)
- One accent hue from the user's mark (`--hue` → `--accent`)
- System UI sans + monospace for origins, tool names, JSON
- Permanent footer that says whose panel this is

You **may**:

- Tighten spacing, type scale, radius, motion
- Improve empty states, focus rings, contrast, hit targets
- Make the confirm JSON easier to scan (still the exact object)
- Make provenance tags clearer
- Adapt layout inside 420px (stacking, scroll)

You **may not**:

- Match the CRM's brand so the panel “belongs” to Acme (that is spoofing)
- Drop the origin next to the name to “reduce noise”
- Drop the footer
- Use the host page's CSS variables
- Introduce a full-viewport cockpit / side-panel-as-home
- Add illustration that looks like a generic AI assistant shell

Color tokens are on `:root` in `surface.css`: `--ink`, `--ink-2`, `--ink-3`, `--line`, `--bg`, `--bg-2`, `--accent`, `--ok`, `--bad`, `--warn`. Prefer those.

Motion: keep it small. This is a consent surface, not a marketing page. If you add animation, do not delay the JSON or the Approve button.

---

## 12. Data you will render (shapes)

You do not fetch these with your own `fetch` except through `HubClient`. Graph updates arrive as `client.onGraph`.

Member:

```js
{
  origin: "http://localhost:8788",   // identity. always show
  name: "Ledger",                    // label. untrusted
  nameAttested: true,
  icon: "/icon.svg",                 // optional; today we show the first letter
  launch: "http://localhost:8788/",
  capabilities: [ /* see below */ ],
  source: "observed" | "declared" | "imported",
  present: true,                     // live tab? grey dot if false
  blocked: false                     // tools=() opt-out. member stays, tools empty
}
```

Capability:

```js
{
  name: "create-invoice",            // ASCII, hyphens
  description: "Creates a draft…",   // untrusted text
  inputSchema: { type: "object", properties: { ... }, required: [...] },
  readOnly: false,
  untrusted: false
}
```

Provenanced field (confirm):

```js
{ value: "River North Studio", how: "read", fromOrigin: "http://localhost:8787", untrusted: false }
```

`plainArgs(args)` strips provenance to the object `#json-preview` shows and `doWrite` sends.

HubClient methods you actually use:

| Method | When |
|---|---|
| `connect()` | boot |
| `graph()` | refresh directory |
| `invoke({ origin, toolName, args })` | reads, and writes **only from `doWrite`** |
| `grant({ source, target, scope, schemaHash })` | inside `doWrite`, before invoke |
| `useGrant(key)` | after a successful write |
| `grants()` / `revoke(key)` / `forget(origin)` | Connections view |
| `pause(boolean)` | header Pause |
| `declare(origin)` | Add an app |
| `openApp(origin)` | background tab |
| `exportAll()` | metadata download; must not contain payload values |
| `closeSurface()` | × |

Writes go through `viewConfirm` → `doWrite` → `client.invoke`. CI asserts that. If you add a second write button that calls `invoke` directly, `pnpm check` fails and you have skipped consent.

---

## 13. Copy-paste checklist before every PR

```bash
cd connectome
pnpm check          # must stay green; no mesh needed
```

Then actually click (the CSS/HTML you changed is not proven by `pnpm check`):

1. CRM + Ledger open → badge → still in CRM, surface says **in Acme CRM** + `http://localhost:8787`.
2. Directory shows **Ledger** + origin `localhost:8788`, not a nameless tool.
3. `create-invoice` → `get-open-client` → `#json-preview` contains `River North Studio` and `"amount": 180`.
4. Approve → “Done.” → draft in Ledger tab → CRM tab still in front.
5. Repeat, hit **Cancel** → “You declined. Nothing was written.” → no new invoice.
6. Close Ledger tab → surface in CRM still lists Ledger, grey dot, “isn't open”, capabilities remembered.
7. Pause → banner + disabled `.cap`.
8. Look at the mark in the header. A page at `:8793` (hostile stub, if running) cannot show the same glyphs.

If you changed layout or chrome, resize the iframe in DevTools to ~360px and ~420px. There is no second breakpoint file; it is one column.

---

## 14. Things people always try. Don't.

| Temptation | What to do instead |
|---|---|
| Chat box as the home screen | Keep named apps + search. Chat, if ever, is a **power mode on this same surface**, not the door. |
| “Auto-approve if they granted until-revoked” | Grant = propose again. Write = confirm every time. |
| Pretty summary instead of JSON | JSON stays. You may also show a summary **above** it, never instead of it. |
| `innerHTML` for markdown descriptions | `textContent`. |
| `window.parent.postMessage` to “tell the CRM” | Forbidden. Result stays in the surface. A write **into** the CRM is its own edge (`add-note`), confirmed the same way. |
| Hide origin to look modern | Origin is identity. Name is a sticker. |
| Hide closed apps | Grey presence. Offer open. |
| Style the CRM / Ledger to match the surface | Wrong direction. The surface must **not** look like the host. |
| Put the surface HTML on the CRM origin so CSS is easier | That lets the CRM forge Approve. Do not. |
| `allow="tools"` on the iframe | The surface must not run the host's tools itself. |
| Retry on `TOOL_FAILED` | Stop. Show what ran. |
| `<all_urls>` / cookies in the extension so previews work | Distortion tests fail. Out of scope. |
| New framework + new src tree | Allowed only if you keep origin isolation, textContent, confirm, class names tests rely on. Vanilla is the current stack on purpose. |
| Loading spinner as the empty directory | Honest copy: apps join by registering tools; they appear once opened with the hub, or via `/.well-known/connectome.json`. |

---

## 15. Suggested first tasks (safe)

These are real frontend work that does not reopen product law:

1. **Confirm scanability** — keep `#json-preview`, improve field layout, required markers, focus order (Search → cards → Approve). Keyboard: Enter on Approve only when enabled.
2. **Empty / missing / paused copy** — already written; make the empty dashed box and paused banner easier to see at 420px.
3. **Member cards** — presence dot + origin wrapping on long hostnames (`word-break` is already there). Optional: show `icon` if `member.icon` is a same-origin URL; never `innerHTML` an SVG string from the app.
4. **a11y** — `#connectome-surface-frame` has `title="Connectome"`. Add `aria-current` on the member you are viewing, `aria-live="polite"` on the result/failure notices if missing, visible focus on `.cap` / `.member-card`.
5. **Motion** — 150ms panel content fade on `go()`, no delay on confirm JSON.

Leave HubClient, grants math (`grantIsLive`, `schemaHash`), and `doWrite` ordering alone unless a bug is assigned.

---

## 16. If you get stuck

| Symptom | Likely cause |
|---|---|
| Badge missing | Mesh down, or CRM didn't load `/.webmcp/boot.js` from `:8791`. |
| Panel blank / “Can't reach your connectome” | Gateway `:8791` down. Edge-only. Extension would still work if loaded. |
| Directory empty with both tabs open | Wait 1s for HELLO; or you filtered search; or you are looking at the host as if it were a neighbor. |
| Confirm JSON empty | Pick `get-open-client` (or another read), or fill fields yourself. Mapper down is OK. |
| Approve disabled | `#problems` — required empty or type mismatch. |
| CSS change not showing | You edited a stub's CSS, or cached `:8790`. Hard-refresh. |
| `pnpm check` fails after a surface edit | You added `window.parent`, a second write path, or `handler:` . Read the FAIL line. |
| Mark is `??` | You are not on `:8790`. That is a fake. |

Status of gates (what “done” already looks like): `connectome/gates/gate-b.md` (the product), `gate-c.md`, `gate-d.md`, `gate-e.md`. Screenshots sit next to those files.

Stranger runbook: `connectome/README.md`.

---

## 17. Definition of done for a frontend change

A change is done when:

1. `cd connectome && pnpm check` passes.
2. You exercised the changed UI **in the CRM window** with Ledger open, the way a user would (not only a screenshot of `:8790` opened as a top-level tab).
3. The four screenshot questions in §0 are still yes.
4. Writes still show exact JSON and still require Approve.
5. Origins still sit next to names.
6. No `innerHTML`, no `window.parent`, no chat-as-home.

If you only opened `http://localhost:8790` as its own tab, you have not verified the product. The product is the panel **inside** an app.
