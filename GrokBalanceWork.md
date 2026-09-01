# Remaining work to complete Connectome

This is the build plan. It is the balance of work between `GrokVision.md` (product law), `GrokVisionResponse.md` (facts, gaps, architecture), and what is already on disk under `connectome/`.

`GrokVision.md` §1 and §8 win on intent. This file does not reopen them. It sequences the work that makes those sections true in a running system.

Second-pass (`FlashSays.md`) is folded in: the join door and surface-only invoke are T1, not appendix; consent is not a `confirmId` in the Durable Object; `pnpm check` is allowed to fail until T8 writes the file. `FlashSays.md` is not a competing spec.

---

## How to read this

| File | Authority |
|---|---|
| `GrokVision.md` | What the product is. Gates, join, locus, consent, distortion tests. |
| `GrokVisionResponse.md` | Spec corrections, gaps, two-transport architecture. Use its mechanisms. Do not use it to change the product. |
| `oldDocs/Master1.md` §7.6 | Gate A done-when (six checks). Cockpit allowed for A only. |
| `What'sBuilt.md` | Pointer to this file and `connectome/gates/`. Not a second status. |
| `FlashSays.md` | Second pass on this plan. Mechanisms adopted below. Do not implement from it. |
| **This file** | What is left, in order, with files and done-when. |

**Rule:** do not skip a gate. Do not pad a gate with ontology, cloud, a fourth adjacent stack, or a cockpit-as-product. Increment 0 exists only because the tree is not bootable yet; it is not a new product idea.

---

## 1. What “complete” means

The project is complete when all of the following are true.

### 1.1 Vision complete (Gates A–E)

A stranger, on this machine, with the Chrome WebMCP flag optional (polyfill is the primary path), can:

| Gate | Proof |
|---|---|
| **A** | Two stubs, two origins, one confirmed write `get-open-client → create-invoice`, six checks from `Master1.md` §7.6. Mediation is real. Not demoed as the product. |
| **B** | Same pair, **start inside the CRM window**. Surface is hub UI in that window. Invoicing is named. Exact JSON approved in the surface. Draft invoice appears in Ledger. Dismiss → no write. Ledger closed → clear stop **in the CRM**, no write. |
| **C** | Start inside Ledger. CRM is named. At least one CRM read is reachable. Not a CRM plugin. |
| **D** | Tick (the unlike third stub) appears by name inside CRM and Ledger, and they appear inside Tick. Visibility + one read. No shared business object. |
| **E** | Graph persists after a tab closes. Surface in A still names B. User-initiated open-or-focus, locus stays in A. Grants revocable. Kill switch works. |

### 1.2 Repo complete

Vision complete, plus:

- Both transports run against the same hub protocol.
- Distortion tests run in CI and fail the build if a rejected door is opened.
- `pnpm dev` brings the whole local mesh up.
- `GrokVision.md` §3.5 / §6.4 match the current WebMCP draft (the §1 corrections).

### 1.3 Explicitly not complete-when

These are other products, later transports, or rejected doors. They are **not** tasks in this file’s critical path:

- Canonical Business Objects, mapping-profile catalogs, “top N apps”
- Unattended templates, cron, queues, workflows, Durable Object `alarm()` used for work
- Cloudflare Browser Rendering, cookie copy, headless cloud sessions
- Hermes / Vendo / Buzz / Grok Bot as the hub
- Native cross-tab `executeTool`, `chrome.aiAgent`, `navigator.modelContext`
- `<all_urls>`, `chrome.cookies`
- “Remember and auto-write”
- Production marketplace, billing, multi-user SaaS
- Pixel-perfect embedding of B’s UI inside A

An optional appendix lists work that may follow completion. It is not required to close the project.

---

## 2. Decisions this plan takes (the unanswered Qs)

`GrokVisionResponse.md` §5 asked five questions. The code already assumes answers. This plan **locks** them so implementers do not re-litigate:

| Q | Decision |
|---|---|
| **Q1 Transport** | Two transports, one protocol. Local Transport 1 (script tag + DO) is finished first because the stubs and bridge already speak it. Transport 2 (thin extension) ships before Gate E, because open-or-focus and “any origin, not only our script tag” need it. |
| **Q2 Egress** | Never plaintext to Cloudflare. Schema-only mapper (values applied in the surface). Edge relay is sealed envelopes; DO logs `{from,to,bytes,at}` only. Extension transport: payloads stay on the device. |
| **Q3 Gate sequencing** | Gate A then B. Confirm UI is the **in-app surface**, not a cockpit. A debug workshop in the extension is allowed and must not be the only write path. This is more faithful to `GrokVision.md` than to `Master1.md` §7.4, and the vision wins. |
| **Q4 Document authority** | Merge the §1 factual corrections into `GrokVision.md` as a last increment, after the gates are green. Keep arguments in `GrokVisionResponse.md`. |
| **Q5 Domains** | Local `wrangler dev` on the ports below until Gate E is green. No zone required to complete the project. |

Two more locks, from the second pass. They were not in the original five questions. Do not re-litigate them either:

| Lock | Decision |
|---|---|
| **Join door** | Identity is the WebSocket / fetch **`Origin` header**. Allowlist on `/hub` and `/api/*` is the four client origins that talk to the gateway: three stubs + surface (see T1.5). Query-param `origin` / `role` and `HELLO.origin` are not identity. A pairing token in the boot script is not a door (the script is public). Cloudflare Access / Turnstile stay in the appendix, for a real zone. |
| **Who may invoke** | On the edge path, **only the surface session** may cause `executeTool`. Spoke-to-spoke `SEALED` is refused. Grants still mean “propose this edge and run the named source read”; they never buy a write. Confirm stays `viewConfirm` / `doWrite` in the surface. Do **not** restore pending-confirm / `confirmId` in the Durable Object for T0–T8. That would be a higher bar than Gate B and a product fork from the built HubDO. |

---

## 3. Current state — do not redo this

**The tree is at the T0 frontier.** The files below exist and are the starting point. `pnpm dev` and `pnpm check` fail at missing files. Nothing past Increment 0 is demonstrable on this machine until T0 is green.

Already written, and must be treated as the starting point:

| Area | Path | What it already is |
|---|---|---|
| Protocol | `connectome/packages/protocol/protocol.js` | Failures, membership, edge grants, provenance, schema-only mapper, blind-relay crypto. |
| Polyfill | `connectome/packages/bridge/webmcp-polyfill.js` | Same-API `document.modelContext` + `navigator.modelContextTesting`. |
| Bridge | `connectome/packages/bridge/bridge.js` | Two transports, discovery, page-world invoke, hub-origin iframe, mediated badge. |
| Hub DO | `connectome/hub/gateway/src/hub-do.js` | Graph, grants, pause, forget, export, metadata audit, sealed relay. No scheduler. |
| Gateway | `connectome/hub/gateway/src/index.js` | Serves `/.webmcp/boot.js`, WS `/hub`, HTTP `/api/*`. |
| Mapper (logic) | `connectome/hub/mapper/src/static-mapper.js` | Schema-only static correspondences. Synonym table is **not** a CBO. |
| Surface (UI) | `connectome/hub/surface/public/*` | Directory, named apps + origin, selected reads, provenance confirm, grants, pause, search-not-chat, anti-spoof mark. |
| CRM stub | `connectome/apps/stub-crm` | Acme CRM. Tools: `get-open-client`, `list-clients`, `add-note`. Port **8787**. |
| Invoicing stub | `connectome/apps/stub-invoicing` | Ledger. Tools: `create-invoice` (draft), `list-invoices`. Port **8788**. |
| Third stub | `connectome/apps/stub-notes` | **Tick** (timer). Tools: `start-timer`, `stop-timer`, `list-entries`. Port **8789**. Folder name is historical. |
| Manifests | each stub `public/.well-known/connectome.json` | Names, icons, launch, capability posters. |
| Sync script | `connectome/scripts/sync-bridge.mjs` | Exists; destinations are incomplete (see T0). |

Local ports (keep these):

| Service | Port |
|---|---|
| stub-crm | 8787 |
| stub-invoicing | 8788 |
| stub-notes (Tick) | 8789 |
| surface | 8790 |
| gateway | 8791 |
| mapper | 8792 |

---

## 4. Sequence

Each increment ends in a **demoable or checkable** state. Do not start N+1 until N’s done-when is green.

```
T0  Make the tree boot
T1  Finish local Transport 1 (right origin, join door, surface-only invoke)
T2  Gate A — mediation is real
T3  Gate B — the vision is real, one pair, one way     ← first product increment
T4  Gate C — not a launcher
T5  Gate D — heterogeneity
T6  Transport 2 — thin extension
T7  Gate E — presence as transport, locus unchanged
T8  Guardrails, docs, spec-fact merge
```

T0–T1 are scaffolding. T3 is the moment this is a product. T6 exists so §1.3 (“any app”) survives and so Gate E’s open-or-focus has a legal process. T8 closes the repo.

---

## 5. Tasks

Every task has an id, the files it owns, and a done-when. If a done-when cannot be shown, the task is not done.

---

### T0 — Make the tree boot

**Why.** `package.json` points at files that do not exist. `pnpm dev` cannot succeed. Nothing else is testable until this is green. `pnpm check` also fails today, because T8.1 has not written `ci/distortion-tests.mjs`; that failure is allowed until T8 (see T0.5).

#### T0.1 Vendor copies that HubDO and the surface actually import

`scripts/sync-bridge.mjs` copies protocol/bridge into destinations that are not the ones the running code imports.

- Gateway Worker serves `*.js.txt` — keep that.
- HubDO does `import … from "./vendor/protocol.js"` — that file is **not** produced today.
- Surface does `from "/protocol/protocol.js"` — that file is **not** in `hub/surface/public/`.

**Do:**

- Add copies:
  - `packages/protocol/protocol.js` → `hub/gateway/src/vendor/protocol.js`
  - `packages/protocol/protocol.js` → `hub/surface/public/protocol/protocol.js`
  - keep the existing `.txt` copies for the gateway static serve
  - keep the extension copies, but make those destinations succeed only after T6 creates `extension/` (or create the dirs now and write a stub `package.json`)
- Add `"sync": "node scripts/sync-bridge.mjs"` to the root `package.json`. Gateway comments already say `pnpm sync`; that script does not exist today.
- Run the script as part of `pnpm dev` (T0.4 preflight) and as a pre-check.
- Commit the generated vendor files **or** generate them on every dev/CI run; pick one and document it. Prefer generate-on-dev so `packages/` stays source of truth.

**Done when:** `pnpm sync` (and `node scripts/sync-bridge.mjs`) exits 0 and HubDO can resolve `./vendor/protocol.js`.

#### T0.2 Mapper Worker entry

`hub/mapper/wrangler.jsonc` has `"main": "src/index.js"`. That file does not exist. `src/llm-mapper.js` is also referenced and does not exist — do **not** write the LLM mapper now.

**Do:** write `hub/mapper/src/index.js`:

- `POST /map` → `assertNoValues(req)` (independent of the client) → `map()` from `static-mapper.js` → JSON.
- CORS for the surface origin (`http://localhost:8790`).
- `GET /health`.
- Reject any request whose source fields are not exactly `{path, type}`.

**Done when:** `pnpm --filter mapper dev` listens on 8792 and `POST /map` with a schema-only body returns a correspondence map.

#### T0.3 Surface Worker

`hub/surface/public/` is static files. There is no `package.json`, no wrangler config. Root script `dev:surface` cannot run. Bridge mounts `http://localhost:8790/surface`.

**Do:**

- Add `hub/surface/package.json` (`name: "surface"`, `dev: wrangler dev --port 8790`).
- Add `hub/surface/wrangler.jsonc`: assets from `./public`, `not_found_handling: "single-page-application"` so `/surface` serves the same panel as `/`.
- Headers: `Permissions-Policy: tools=()` (already in HTML; repeat on the response). Do not set `allow="tools"` on anything here.
- Do not give this Worker a Durable Object, a queue, or a cron.

**Done when:** `pnpm --filter surface dev` serves the panel at `http://localhost:8790/` and `http://localhost:8790/surface`.

#### T0.4 `scripts/dev.mjs`

Root `"dev": "node scripts/dev.mjs"` points at a missing file.

**Do:** write it. It must:

1. Run `pnpm sync` (`scripts/sync-bridge.mjs`). Fail if it exits non-zero.
2. Start, in parallel, the six wrangler procs on the ports in §3.
3. Fail clearly if a port is taken.
4. Print the six URLs and the Gate B instruction: open CRM, open Ledger, click the Connectome badge.

**Done when:** `pnpm dev` from `connectome/` brings all six up, and Ctrl-C tears them all down.

#### T0.5 Workspace hygiene so `pnpm install` works

- `pnpm-workspace.yaml` lists `extension`, which does not exist. Either remove it until T6 or add `extension/package.json` as a stub. Do not leave `pnpm install` broken.
- `"typecheck": "tsc -b packages/protocol"` — protocol is JS, there is no `tsconfig`. **Delete the script** or add a JSDoc `tsconfig` that typechecks `protocol.js`. Do not add a second TypeScript source tree. This is T0 work, not T8.
- Add a `pnpm-lock.yaml` (run `pnpm install` once) so CI is reproducible.
- Root `"check": "node ci/distortion-tests.mjs"` points at a file T8.1 writes. **Do not delete that script to make T0 green. Do not stub a file that claims the distortion tests pass.** `pnpm check` is allowed to fail until T8.1. After T8.1, it is the gate on every increment.

**Done when:** `pnpm install` in `connectome/` succeeds on a clean clone.

#### T0.6 Stub HTML already loads the bridge — leave it

All three stubs already include:

```html
<script type="module"
  src="http://localhost:8791/.webmcp/boot.js"
  data-connectome-hub="http://localhost:8791"
  data-connectome-surface="http://localhost:8790">
</script>
```

Do not replace this with an SDK. Do not add a React overlay. This **is** the local form of Transport 1.

**Done when:** (no code). Confirm the tags are still present after T0.1–T0.5.

---

### T1 — Finish local Transport 1 (right origin, join door, surface-only invoke)

**Why.** Even with T0 green, a write cannot be correct, for three independent reasons. All three close in this increment. A Gate B demo that a sealed envelope can skip is not `GrokVision.md` §6.2.

1. **Routing.** `HubClient.invoke` under the edge transport picks **the first other WebSocket**, not the session whose origin matches the target. With CRM + Ledger + surface connected, a `create-invoice` can land in the CRM. That fails Gate A check 4 and fails isolation.
2. **Join door.** `hub()` accepts any WebSocket, attacker-chosen `origin` / `role` query params, default DO name `"local-dev"`. `/api/*` is `Access-Control-Allow-Origin: *` with no check. A drive-by page can join the user’s DO, poison members, pause, revoke, forget, or export. This is T1, not appendix. Access / Turnstile remain appendix, for a real zone.
3. **Consent.** On `M.SEALED`, the spoke unseals from **any** peer and calls `executeTool`. HubDO relays to any session id with no grant check and no sender-role check. Confirm lives only in `surface.js`. The bridge threat note (“a forged run-this still dies at a confirm card”) is **false for the edge path**. Grants do not fix this: the sender of a write is the **surface**, and grants never authorize writes.

#### T1.1 Route sealed invokes by origin

**Files:** `hub/gateway/src/hub-do.js`, `hub/surface/public/hub-client.js`, protocol if a new message is needed.

**Do:**

- HubDO sessions already store `origin` (after T1.5, that origin is the `Origin` header). Broadcast a `sessionId → origin` map (public, like peer keys), or include origin on `PEER_KEYS`.
- `HubClient.invoke({ origin, toolName, args })` must seal to **a live session whose origin equals `origin`**. If several tabs share an origin, use the most recently `HELLO`’d. That is the T1 rule. Focus-wins needs a `FOCUS` ping and is T7 presence polish, not T1.
- If none: return `FAILURE.APP_UNAVAILABLE`. Do not pick a random peer.
- A single job that **reads CRM then writes Ledger** must talk to **two** peers. The current “one peer” variable cannot survive.

**Done when:** with CRM, Ledger, and Tick all open, invoking `create-invoice` from the CRM surface creates a draft **only** in Ledger, and invoking `list-entries` hits **only** Tick.

#### T1.2 Close / open surface over the edge socket

`HubClient.closeSurface()` sends `close-surface` on the surface’s socket. HubDO does not forward that to the host spoke, so the iframe is never removed.

The surface iframe URL has `?host=<spoke origin>`, but the surface WebSocket HELLO today sends `origin=http://localhost:8790` and does **not** send the host. Open and close are not symmetric: `request-surface` echoes `open-surface` on the **same** spoke socket; close must go from the **surface session** to the **spoke session**.

**Do:**

- `HubClient` puts `host` (the spoke origin from the iframe query) on the WebSocket, as a search param or on HELLO. HubDO stores it on the surface session.
- HubDO, on `close-surface` from a surface-role session, sends `close-surface` to the spoke session whose origin equals that `host`. If several tabs share the host origin, same rule as T1.1 (most recently `HELLO`’d).
- `request-surface` already echoes `open-surface` to the same spoke — keep that.

**Done when:** badge opens the panel; × removes the iframe from the host document.

#### T1.3 Mapper belt-and-braces on the Worker

Surface comments say the Worker re-asserts `assertNoValues` on arrival. T0.2 must actually do that. Add a unit-level check: a request that includes a `value` key on a field is **rejected**, not mapped.

**Done when:** a malicious `/map` body with values is 400 and no mapping is returned.

#### T1.4 HubDO must not see payloads on the HTTP API either

`/api/grant`, `/api/grants`, `/api/pause`, `/api/forget`, `/api/export` are metadata. Confirm they never accept args/results. Invoke on the edge path is **only** `M.SEALED`.

**Done when:** grepping `hub-do.js` shows no JSON parse of tool args except inside a `sealed` blob that is forwarded unread.

#### T1.5 Join door (local-dev, not Access)

**Files:** `hub/gateway/src/index.js`, `hub/gateway/src/hub-do.js`, a single config list of allowed origins (gateway, or shared with surface `config.js`).

**Do:**

- Allowlist the **`Origin` header** on `/hub` and `/api/*`. The list is `http://localhost:8787`, `:8788`, `:8789`, `:8790`. Reject anything else, including no-Origin non-GET. Preflight for `/api/*` must echo an allowed origin, not `*`.
- `/do/pause`, `/do/revoke`, `/do/forget`, `/do/export`, `/do/grant` inherit this. A drive-by page must not flip the kill switch.
- Session identity is the `Origin` header. Ignore `?origin=` and `HELLO.origin` for membership, grants, and relay. Those fields may still be sent; they are not authority.
- `role=surface` only when `Origin` is `http://localhost:8790`. Every other allowed origin is `spoke`. Ignore `?role=`.
- `upsertMember` uses the bound origin. A CRM tab that claims to be Ledger in the query string still registers as CRM.
- Do **not** add a pairing token to the boot script. The script is public; a shared secret in the page is not a join door.
- Cloudflare Access / Turnstile stay in the appendix.
- T3.3’s hostile stub is a fourth origin **not** on this list, and must not receive the bridge.
- Do not add `chrome-extension://` here. T6.2 adds the pinned extension origin to `/api/*` only (graph sync). Extension never opens `/hub` for payloads.

**Done when:** (a) a page whose `Origin` is not in the list cannot open `/hub` and cannot `POST /api/pause` (or grant / forget / export / revoke); (b) a CRM tab sending `?origin=http://localhost:8788` still appears as CRM; (c) a CRM tab sending `?role=surface` is still a spoke. T8.1 will automate (a)–(c); until then a curl / second-origin check recorded in the T1 notes is enough.

#### T1.6 Surface-only invoke (consent enforcement for the edge path)

**Files:** `hub/gateway/src/hub-do.js`, `packages/bridge/bridge.js`, `hub/surface/public/hub-client.js`. Protocol only if `PEER_KEYS` needs origin next to the key.

This is the enforcement point the second pass asked for. It is **not** pending-confirm in the DO, and it is **not** “relay only if the sender session holds a grant.” The sender of a write is the surface (`:8790`); grants are `CRM|get-open-client => Ledger|create-invoice`; grants never authorize writes.

**Do:**

- HubDO relays `M.SEALED` only from a **surface-role** session to a spoke session whose origin equals the addressed target (the `to` session’s origin, which T1.1 already requires). Spoke-to-spoke `SEALED` is refused. Unlisted senders never get this far (T1.5).
- `PageBridge` on the edge path: `handleInvoke` only when the sender’s origin is the configured surface origin (`data-connectome-surface`). That origin comes from the T1.1 session map / `PEER_KEYS`, not from a field the sender chose. If the map has no origin for `msg.from`, refuse. Unseal-from-any-peer then `executeTool` is the bug. Extension path: only the extension may call the spoke (T6; do not pretend that exists yet).
- Confirm remains `viewConfirm` / `doWrite` in the surface. T8.1 already asserts every write path in `surface.js` goes through those two. Do not add a second confirm UI.
- Do **not** mint `confirmId` in the DO. Do **not** have the spoke ask the DO whether a write was confirmed. If a later increment wants a one-time stamp so even hub-origin JS cannot fire a write without a card, name it as a higher bar than Gate B; it is not this task.

**Done when:** with all three stubs + surface connected, (1) a surface-originated `create-invoice` lands only in Ledger; (2) a `SEALED` `INVOKE` sent from the CRM session toward Ledger is refused and **no draft appears**; (3) an unlisted origin cannot cause a write. The bridge threat note must be true of the edge path, or deleted.

---

### T2 — Gate A: mediation is real

**Why.** `GrokVision.md` §14: if Gate A is not green, do not argue vision. Confirm lives in the surface (Q3). No dedicated cockpit confirm card.

Use CRM + Ledger only. Tick may be running; do not use it.

#### T2.1 The one edge

Static mapper must propose, for `get-open-client` → `create-invoice`:

| Target field | Source |
|---|---|
| `customerName` | `name` (synonym) |
| `customerEmail` | `email` |
| `amount` | `billableRate` → synonym `amount` / `rate` |
| `currency` | `currency` |
| `memo` | unmapped (user may type) |

The synonym table already contains these names (`name`/`customerName`, `email`/`customerEmail`, `billableRate`/`amount`/`rate`, `currency`). Do **not** add a pair-specific adapter unless this mapping actually fails. If it fails, add **one pair-specific rule in the static mapper for this proof only**, commented as a hand-written adapter, not a CBO. Prefer fixing names over inventing objects.

**Done when:** the confirm card, without typing, shows River North Studio / `ap@rivernorth.example` / `180` / `USD`.

#### T2.2 Six done-when checks (`Master1.md` §7.6)

A stranger can:

1. Load CRM (8787), Ledger (8788), gateway, surface, mapper (`pnpm dev`).
2. Open a client in the CRM.
3. Open the Connectome surface **from the CRM page** (badge). Approve one card.
4. See a new **draft** invoice in Ledger with that client’s name and rate. User still sees the CRM.
5. Repeat with Ledger closed → clear stop **in the surface**, no write.
6. Repeat and dismiss/cancel the card → no invoice.

**Done when:** all six have been executed and recorded (a short `connectome/gates/gate-a.md` checklist with date and pass/fail is enough). No other demo path is required.

#### T2.3 Isolation checks that travel with A

- CRM JS cannot `iframe.contentDocument` the surface (cross-origin).
- Approving a write does not put Ledger data into CRM JS.
- Tool descriptions render with `textContent` only (already the surface’s rule; do not regress).

**Done when:** a one-screen note in the Gate A checklist confirms the three bullets.

---

### T3 — Gate B: the vision holds in one direction

**Why.** First time the product is real. `GrokVision.md` §9 Gate B is the done-when. Do not add a third app here. Do not add a chat box.

#### T3.1 Screenshot test (`GrokVision.md` §2.4)

From inside the CRM window, a stranger can answer yes to:

1. Still in an app they already use (CRM), not a generic agent shell.
2. Point at **another app, by name** (Ledger), with the origin shown next to the label.
3. Use that other app from here (`create-invoice`, exact JSON, result in the surface).
4. Those two apps did not share a stack or schema to make this possible.

**Done when:** the Gate B checklist includes that screenshot test, plus Gate B items 1–8 from `GrokVision.md` §9.

#### T3.2 Empty / missing / paused copy

Exercise:

- Surface opened with only CRM connected → honest empty state (Gap 2 copy already exists; keep it).
- Ledger closed → `APP_UNAVAILABLE` in the CRM surface, no write.
- Kill switch (Pause) → no invoke.
- Cancel → `CONSENT_DENIED`, nothing written.

Gate B is a **first-time** confirm of the live schema. Grant reuse, `GRANT_SCOPE.SESSION` expiry, `uses` increment, and `SCHEMA_DRIFT` are T7.3. The drift **check** lives in the surface: before offering a stored edge, hash the live target `inputSchema` and compare it to the grant. Do not invent a second home for that check in T3.

**Done when:** each of the four has a pass in the Gate B checklist.

#### T3.3 Anti-spoof check (Gap 4)

`GrokVision.md` §3.3 asserts non-spoofability. The mark in hub-origin `localStorage` is the mechanism.

**Do:** add a tiny **hostile stub** (fourth origin **only for this check**, not a product member) that paints a fake “Connectome” panel in its own DOM, with a confirm button. Gate B extra check: *“Repeat with a hostile stub that paints a fake surface → the user can tell (mark missing or wrong).”*

Host permissions stay on the three product stubs plus surface/gateway. The hostile stub must **not** receive the bridge, so it cannot show the real mark.

**Done when:** the fake panel cannot display the real mark, and the real panel still can.

---

### T4 — Gate C: the graph is not a launcher

**Why.** If this fails, we built a CRM plugin.

#### T4.1 Start inside Ledger

From Ledger’s window, CRM is named. At least one CRM read (`get-open-client` or `list-clients`) is reachable. Result stays in the surface; Ledger JS does not receive it.

**Done when:** Gate C checklist: named CRM, one successful read, locus still Ledger.

#### T4.2 Reverse write (optional but cheap — still Gate C)

CRM already exposes `add-note`. A confirmed write Ledger → CRM (`list-invoices` or a typed note → `add-note`) proves the surface is not one-way. Mapper will not invent a Client object; a typed `clientId` + `note` is acceptable. This is still **not** a CBO.

**Done when:** a note appears on a CRM client, user still in Ledger, payload confirmed.

#### T4.3 Declared membership without this tab focused

`/.well-known/connectome.json` is served. Today it is only fetched when that app’s page is open (`fetchIdentity` in the bridge). Gap 2: the graph can only contain apps the user has already visited.

**Do (minimum, still not a registry we curate):**

- Surface empty/directory state: an “Add an app” control. User types an origin. Hub (or surface, then `POST /api/sync`) fetches `/.well-known/connectome.json` **from that origin** with `credentials: omit`. On success, insert a `source: declared` membership. Tools remain the authority for invoke; the manifest is a poster.
- Absence still joins: if there is no manifest, the origin is not added, and the copy says so. We do not invent a name.

Do **not** ship a built-in list of “top apps”. A local-dev convenience that pre-fills the three stub origins in the input placeholder is fine.

**Done when:** with only CRM open, the user can add `http://localhost:8788`, see “Ledger” by name (origin shown), and see it marked not-present until it is opened.

---

### T5 — Gate D: heterogeneity

**Why.** Tick’s objects are timers, not clients or invoices. Join must still hold.

`GrokVisionResponse.md` Gap 8: do **not** require a clever write mapper here. Prove **visibility + one read**.

#### T5.1 Named presence in all three windows

Tick appears by name inside CRM and inside Ledger. CRM and Ledger appear inside Tick.

**Done when:** three screenshots or a checklist row each.

#### T5.2 One read across an unlike pair

From CRM (or Ledger), run Tick’s `list-entries`. Result in the surface. Host JS does not receive it.

**Done when:** the list of time entries is visible in the surface inside CRM, and CRM’s document does not contain that JSON.

#### T5.3 Optional unlike write — **not** required to close D

A hand-written adapter Tick → Ledger (e.g. `label` → `memo`, `seconds` → nothing, user types `amount`) would prove join, not intelligence. If done, comment it as a per-edge adapter. If skipped, say so in the Gate D checklist. Do not invent a `TimeEntry` CBO.

---

### T6 — Transport 2: thin extension

**Why.** Script-tag join is heavier than “register tools, full stop”. The extension is what keeps `GrokVision.md` §1.3 (any app) true. It is also the only honest process for open-or-focus (Gate E).

Target: ~200 lines of extension-owned code. No mapping, no policy, no graph UI. Graph stays in the DO (metadata) and/or on the device.

#### T6.1 MV3 skeleton, pinned identity

**Do:**

- `connectome/extension/` with `manifest.json` (MV3).
- Pin a `key` so the id stays `lcenbblagdelcopdkggjmkpcjnmogdgn` (already in `hub/surface/public/config.js`). If the generated id differs, **change config.js to match**, do not guess.
- `host_permissions`: the three stub origins, `http://localhost:8790/*`, `http://localhost:8791/*`. **Not** `<all_urls>`. Repo-complete for these origins, not `GrokVision.md` §1.3 on arbitrary sites. Do not treat unpacked-extension + stubs as “any app” in the wild.
- `externally_connectable.matches`: surface origin only, so `chrome.runtime.sendMessage(EXT_ID, …)` from the surface works. **Never** `postMessage` to `window.parent` for hub traffic (that is the leak `config.js` already forbids).
- `content_scripts`: stub origins, `document_start`.
  - Isolated world: relay `{__connectome:"to-hub"}` ↔ service worker.
  - MAIN world: set `window.__CONNECTOME_EXTENSION__ = true`, inject the vendored bridge (or import it). Bridge then uses `TRANSPORT.EXTENSION` and does not open a DO WebSocket for payloads.
- Service worker: tab → origin → tools cache; `executeTool` **inside the page world** (send `M.INVOKE` to that tab’s bridge); `chrome.tabs.create({ url, active: false })` for open-or-focus later.
- No `chrome.cookies`. No side panel as the write path. A **debug workshop** side panel that dumps tabs/tools is allowed (Gate A workshop). It must not be the only confirm UI.

**Done when:** unpacked extension loads; CRM/Ledger detect `TRANSPORT.EXTENSION`; surface `connect()` prefers the extension and shows “on-device hub”.

#### T6.2 Extension transport: payloads never go to the DO

Under extension transport, `HubClient.invoke` is `chrome.runtime.sendMessage`. The SW asks the target tab’s bridge to `executeTool`. Results return on that channel.

The DO may still receive **graph sync** (`/api/sync` observations: origin, tool names, schemas). Never args, never results. Add the pinned extension origin (`chrome-extension://lcenbblagdelcopdkggjmkpcjnmogdgn`) to the gateway **`/api/*` allowlist only**. Do not let the extension open `/hub` for payloads.

**Done when:** DevTools on the gateway shows no request body containing `customerName`, `amount`, or invoice ids during a successful Gate B write.

#### T6.3 Re-run Gate A and Gate B on Transport 2

Same checklists. Both transports must pass A and B. If edge and extension disagree on confirm UX, the surface is wrong — there is one surface.

**Done when:** Gate A + B checklists have an “extension” column, all green.

---

### T7 — Gate E: presence as transport, locus unchanged

**Why.** Tabs are not the product. The graph is.

Much of the ledger already exists in HubDO (members, grants, pause, forget, export). This increment makes it **true in the UX** and adds launch.

#### T7.1 Persist origin → last-seen tools

Already in SQLite. Verify: close Ledger, reload CRM, open surface → Ledger still listed, `present: false`, capabilities remembered.

**Done when:** that sequence works across a gateway restart (DO storage), not just a tab close. Binary `present` (any live session of that origin) is enough to close E. Focus-wins and presence-decay are not required.

#### T7.2 Consenting open-or-focus

Surface already has an “Open in a background tab” button that calls `client.openApp`. Edge transport currently returns `APP_UNAVAILABLE`.

**Do:**

- Extension: `chrome.tabs.create({ url: launchUrl, active: false })` or focus an existing tab of that origin without stealing window focus.
- Never `active: true` as the default. CI (T8) greps for this.
- User stays in A. Fail copy if launch is missing.

**Done when:** Gate E checklist: from CRM, Ledger closed → offer open → Ledger loads in background → user never left CRM → then the write confirm still required.

#### T7.3 Edge-grant ledger is real, not decorative

Bugs in the current grant model to fix here (not earlier, unless they block A–D):

- `edgeGrant()` never stores `sessionId`; `grantIsLive()` for `GRANT_SCOPE.SESSION` cannot work.
- `uses` is never incremented; `ONCE` cannot expire.
- `SCHEMA_DRIFT` is defined and the confirm stores `schemaHash`; invoke never checks it.

**Do:** store `sessionId` on session-scoped grants; increment `uses` on a successful write; **in the surface**, before proposing an edge, hash the live target `inputSchema` and if it differs, show `SCHEMA_DRIFT` and demand a new grant. That is the one home for the check (named in T3.2 so T3 does not invent another). Optionally the spoke may refuse a write whose stamped grant hash does not match; not required to close E. **Still never auto-write.**

**Done when:** once-scope grant cannot be reused; session grant dies on reconnect; changed `create-invoice` schema surfaces `SCHEMA_DRIFT`.

#### T7.4 Exit (Gap 10)

Surface already has revoke, forget, pause, export. Verify and fill holes:

- Forget an app drops membership **and** grants that point at it (HubDO already deletes those — test it). Forget must **stick while the tab is still open**: refuse `HELLO` / `TOOLS_CHANGED` re-insert from that origin until the user re-adds it (T4.3 “Add an app”). Close live sessions for that origin. Otherwise exit is decorative.
- Do **not** overload `members.blocked` for forget. That column is app opt-out (`Permissions-Policy: tools=()`): the member remains, tools are empty, copy is `PERMISSION_BLOCKED`. Forget is user exit: the row is gone, and a forgotten-origin denylist (or a `forgotten` table) rejects re-observe until re-add. Two meanings, two states.
- Pause blocks invokes (HubDO already short-circuits non-graph messages — test it, including extension transport).
- Export is metadata only (assert the file contains no payload values).
- Optional: import from export. Not required to close E.
- App opt-out: `Permissions-Policy: tools=()` → `PERMISSION_BLOCKED` → `blocked: true` on the member. Already sketched in the bridge; prove it with a one-line header on a stub.

**Done when:** Gate E checklist has revoke / forget / pause / export / blocked rows, all green. Forget-while-tab-open does not resurrect the member on the next `HELLO`.

#### T7.5 Local-first mirror (E6) — required to close the project, not a side quest

If the gateway is down, the extension transport should still list last-seen members from `chrome.storage.local` and still confirm writes on-device. The DO is sync + mapper + UI delivery, not a runtime requirement for Transport 2.

**Do:** SW mirrors `{members, grants}` to `chrome.storage.local` on every graph update. Surface, when extension is reachable and gateway is not, still opens and still writes.

**Done when:** kill the gateway process; with the extension loaded and both stubs open, Gate B still succeeds. Edge-only mode (no extension) failing here is acceptable and must be copied as `HUB_UNAVAILABLE`.

---

### T8 — Guardrails, docs, spec-fact merge

**Why.** Without this, the next edit reopens a rejected door.

#### T8.1 Distortion tests (`ci/distortion-tests.mjs`)

Root `"check": "node ci/distortion-tests.mjs"` is a missing file. Implement E9 against **this** vision, not `oldDocs/connectome-build-plan.md`’s policy engine.

Minimum assertions (grep / static):

| Ban | Where |
|---|---|
| `chrome.cookies` | `extension/` |
| `"browser"` binding (Browser Rendering) | every `wrangler.jsonc` |
| `triggers.crons` / `queues` / `workflows` | every `wrangler.jsonc` |
| `alarm(` / `scheduled(` | `hub-do.js` |
| `<all_urls>` | extension manifest |
| `active:\s*true` on `tabs.create` | `extension/` |
| `window.parent` hub messages | `hub/surface/` |
| SOP-bypass language | `connectome/**/*.md`, comments |
| `navigator.modelContext` (except a Chrome 149 footnote) | runtime code |
| `handler:` as tool callback | stubs + polyfill |

Minimum positive assertions:

- Surface iframe is a different origin from every stub.
- Every write path in `surface.js` goes through `viewConfirm` / `doWrite`.
- Mapper Worker calls `assertNoValues`.
- Stubs register with `execute`, not `handler`.
- Gateway allowlists `Origin` on `/hub` and `/api/*` (T1.5). An unlisted origin cannot open `/hub`.
- Session origin is taken from the `Origin` header, not from `?origin=` / `HELLO.origin`.
- Spoke-to-spoke `SEALED` is refused; only a surface-role session may cause `executeTool` on the edge path (T1.6).

Wire `pnpm check` into whatever CI this repo gets. **Do not delete `ci/distortion-tests.mjs` to make T0 green.** Until T8.1 writes it, `pnpm check` is allowed to fail. After T8.1, it is the gate on every increment.

**Done when:** `pnpm check` fails if you add a `browser` binding, and passes on main.

#### T8.2 `provideContext` harness (E7)

Polyfill already installs `navigator.modelContextTesting`. Add a small automated test (node + playwright **or** a headless wrangler + puppeteer — pick one, stay on Cloudflare-friendly tooling) that:

- `provideContext` swaps tools atomically.
- Asserts “invoicing has no `create-invoice`” → `TOOL_NOT_FOUND`.
- Asserts schema change → `SCHEMA_DRIFT` once T7.3 exists.

**Done when:** one command exercises those three without clicking.

#### T8.3 Merge facts into `GrokVision.md`

Q4. After gates are green, edit `GrokVision.md` §3.5, §4.1, §6.4:

- `getTools` / `executeTool` are normative on `ModelContext`; still frame-tree scoped, not cross-tab.
- `exposedTo` + Permissions-Policy `tools` is real; still not the cross-tab path; it **is** the hosted-slot path.
- Origin trial window Chrome 149–156; polyfill is the primary path; `navigator.modelContext` is gone.
- Do not otherwise rewrite §1 or §8.

**Done when:** an implementer can follow `GrokVision.md` without hitting a stale API name.

#### T8.4 Runbook

Add `connectome/README.md` (this is the one markdown file the code tree needs):

- What the product is (one sentence from `GrokVision.md` §1.1).
- `pnpm install && pnpm dev`.
- Ports table.
- Gate B stranger path.
- Chrome flag optional because of the polyfill.
- What not to add (link to `GrokVision.md` §10).

**Done when:** a new clone reaches Gate B from the README alone.

#### T8.5 Close the log

Replace `What'sBuilt.md` with a pointer: “status lives in `GrokBalanceWork.md` §3 and the gate checklists under `connectome/gates/`.” Do not keep two statuses.

---

## 6. Known holes in existing code (do not ignore)

These are already on disk. They are assigned above; collected here so they cannot be “forgotten because the file looks finished.”

| Hole | Assigned |
|---|---|
| No `extension/` | T6 |
| No `ci/distortion-tests.mjs` | T8.1 — do not delete the `check` script in T0 |
| No `scripts/dev.mjs` | T0.4 |
| No `hub/mapper/src/index.js` | T0.2 |
| No surface package/wrangler | T0.3 |
| Vendor copies don’t match imports; no `"sync"` script | T0.1 |
| Edge invoke picks a random peer | T1.1 |
| `close-surface` not forwarded; `host` not on the surface socket | T1.2 |
| No Origin allowlist; query-param `origin`/`role` trusted | T1.5 |
| Spoke executes `SEALED` from any peer; confirm is UI-only | T1.6 |
| `GRANT_SCOPE.SESSION` has no `sessionId` | T7.3 |
| `uses` never incremented | T7.3 |
| `SCHEMA_DRIFT` never checked (check lives in the surface) | T7.3 |
| Forget does not stick: live `HELLO` re-inserts the member | T7.4 |
| Declared membership only if the page is open | T4.3 |
| `openApp` no-ops without the extension | T7.2 |
| `typecheck` script is a lie | T0.5 |
| Workspace lists missing `extension` | T0.5 / T6 |
| Folder `stub-notes` is the Tick app | leave the folder; copy always says Tick |

---

## 7. File map after completion

```
Apptome/
├─ GrokVision.md                 product law (facts patched in T8.3)
├─ GrokVisionResponse.md         review; not an implementer spec
├─ GrokBalanceWork.md            this plan (second pass folded in)
├─ FlashSays.md                  second pass; do not implement from it
├─ What'sBuilt.md                pointer to this file (T8.5)
└─ connectome/
   ├─ packages/protocol/         shared protocol (source of truth)
   ├─ packages/bridge/           polyfill + page bridge (source of truth)
   ├─ apps/stub-crm/             :8787
   ├─ apps/stub-invoicing/       :8788  (Ledger)
   ├─ apps/stub-notes/           :8789  (Tick)
   ├─ hub/gateway/               :8791  Worker + HubDO
   ├─ hub/mapper/                :8792  POST /map, static only
   ├─ hub/surface/               :8790  THE PRODUCT
   ├─ extension/                 Transport 2, pinned id, stub origins only
   ├─ scripts/dev.mjs            boots the mesh
   ├─ scripts/sync-bridge.mjs    vendors protocol/bridge
   ├─ ci/distortion-tests.mjs    §8 as code
   ├─ gates/                     Gate A–E checklists
   └─ README.md                  stranger path
```

Still no: Browser Rendering, Cron, Queues, Workflows, CBO package, chat shell, cockpit-as-product.

---

## 8. Suggested working order for an implementer

Do this in commits that match increment ids, so a reverted T6 cannot take T3 with it.

1. **T0** — boot. Stop when `pnpm dev` prints six URLs. `pnpm check` may still fail; do not delete the missing CI file.
2. **T1** — origin-routed invoke + `host` on close-surface + join door (T1.5) + surface-only invoke (T1.6). Stop when a wrong-app write is impossible **and** a spoke-to-spoke `SEALED` writes nothing **and** an unlisted origin cannot join or mutate `/api/*`.
3. **T2** — Gate A checklist, six checks.
4. **T3** — Gate B checklist, including hostile stub. **This is the product.** Demo this, not A.
5. **T4** then **T5** — C then D. Do not swap them.
6. **T6** — extension. Re-run A and B on it.
7. **T7** — persist, launch, grants that work, local-first.
8. **T8** — CI, facts, README.

If time runs out, the honest cut line is **T3 green**. Anything short of T3 is scaffolding. Anything after T3 is reach. Do not ship T6–T8 and call it the product if T3 is red.

---

## 9. Appendix — after the project is complete

Not required. Do not start these to “help” T0–T8.

| Item | When it becomes legal |
|---|---|
| `src/llm-mapper.js` behind AI Gateway | After T1.3’s `assertNoValues` is CI-enforced. Same `/map` interface. Hub still does not import a model. |
| Cloudflare Access / Turnstile pairing of DO ids | Before any non-localhost deploy. `local-dev` as the DO name is a demo-only hole. T1.5 is the localhost door (Origin allowlist). A pairing token in the boot script is not a substitute. |
| Real hostnames, edge injection of `/.webmcp/boot.js` with no stub `<script>` | After T3, when a zone exists. Transport 2 still required for non-Cloudflare origins. |
| Hosted slot (`exposedTo` + `allow="tools"` iframe in an app-chosen column) | After T3. Sugar, not join. |
| Vectorize capability search | After the directory is real (T3). Search-shaped, not chat-shaped. |
| Import of an exported graph | After T7.4 export is proven. |
| Chrome 149 `navigator.modelContext` fallback | Only if someone must run 149. Default: no. |

---

## 10. Distortion-test reminder for every task

Before merging any increment, the change must still pass `GrokVision.md` §8:

1. **Locus** — user uses B while still in A’s window.
2. **Named other** — B is an app, not an anonymous tool.
3. **Join ticket** — after registering tools (plus, for Transport 1, one script tag the hub injects), the vision holds. No SDK.
4. **Heterogeneity** — unlike apps join the same way.
5. **Ignorance** — A’s JS does not see B’s data by default.
6. **User as connector** — every write is exact JSON the user can refuse.
7. **Surface, not engine** — no scheduler, no unattended run, no templates.

A task that fails one of these is not remaining work. It is a different product. Drop it.
