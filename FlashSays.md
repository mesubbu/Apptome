# FlashSays.md

Second-pass review of `GrokBalanceWork.md`, informed by — and only by — the four documents read in the requested order (`GrokVision.md`, `GrokVisionResponse.md`, `What'sBuilt.md`, `GrokBalanceWork.md`) and the codebase under `connectome/`.

Nothing in this file reopens `GrokVision.md` §1 or §8. Gaps listed here are gaps that exist in the plan or in the code the plan depends on — none are invented, and each cites its evidence.

---

## Part 1 — What the four documents establish

### 1.1 GrokVision.md — product law
- **The one sentence:** a user-authorized graph of opted-in apps plus a privileged hub, such that from inside any member app the user can reach any other member's capabilities, with the user still in the first app's window, approving every write.
- **Locus is the product.** Named presence of B, capability reach, exact-JSON confirm, and the result — all inside A's window. Pixel-perfect embedding is optional; requiring it would force an SDK and break heterogeneity.
- **Join = tool registration, nothing more.** No ontology, no SDK, no canonical objects.
- **Gates A–E** sequence the proofs: A = mediation works (two origins, one confirmed write); B = the vision is true for one pair, starting inside the CRM; C = reverse direction; D = a third, unlike app; E = persisted graph + launch-as-transport.
- **Distortion tests (§8)** are executable claims: locus, named other, join ticket, heterogeneity, ignorance, user-as-connector, surface-not-engine.

### 1.2 GrokVisionResponse.md — facts, gaps, architecture
- Corrects three stale WebMCP claims: `getTools`/`executeTool` are normative on `ModelContext` (with `origin` on each `RegisteredTool`); `exposedTo` + Permissions-Policy `tools` is a real cross-origin permission model (sanctioning the hosted slot and the edge-injected hub); origin trial pinned Chrome 149→156, so the **polyfill is the primary path**, not a fallback.
- Eleven gaps; the load-bearing ones: the graph has no defined way to become non-empty (Gap 2, fixed by membership records + `/.well-known/connectome.json`); no anti-spoof mechanism for the surface (Gap 4, fixed by the per-origin mark); no failure taxonomy (Gap 7, fixed as the `FAILURE` closed set); a silence on whether payloads may leave the device (Q2, answered: blind relay + schema-only mapping).
- Verdict: **two transports, one protocol** — a thin extension (hub on-device, plaintext never leaves) and an edge-injected bridge + per-user Durable Object acting as a blind relay (ciphertext only, no key held). Cloudflare-native is admissible because presence is transport, not product.
- Its build plan places `pending confirm` inside the hub DO. Remember this; it matters in Part 3.

### 1.3 What'sBuilt.md — stale session log
- Protocol module (failure taxonomy, edge-grant rule reconciling per-edge consent with always-confirm, per-field provenance, schema-only mapper contract with a values-guard, polyfill), the page bridge, the hub DO (graph, revocable consent ledger, kill switch, blind relay) were built in that session.
- It records one genuine security decision: the surface must reach the extension over a **direct channel to a fixed extension id**, never through the host window's postMessage. That decision is live in the code today (`hub/surface/public/config.js` `EXT_ID`).
- `GrokBalanceWork.md` is right to say it is a log, not status: it stops before the surface, the extension, CI, and gates.

### 1.4 GrokBalanceWork.md — the build plan under review
- Locks the five open questions (two transports; blind relay + schema-only; Gate A then B in one repo; merge the §1 fact corrections into the vision file).
- Sequences T0–T8: boot the mesh → origin-routed invoke → Gate A → **Gate B (the product)** → C → D → extension → persistence/launch/local-first → CI/facts/README. Honest cut line: T3 green.
- Defines repo-complete: both transports on one protocol, distortion tests in CI, `pnpm dev` boots the mesh, vision file facts patched.


---

## Part 2 — Codebase reality vs the plan

Studied: `packages/protocol/protocol.js`, `packages/bridge/bridge.js`, `packages/bridge/webmcp-polyfill.js`, `hub/gateway/src/index.js`, `hub/gateway/src/hub-do.js`, `hub/mapper/src/static-mapper.js`, `hub/surface/public/*`, all three stub apps, `scripts/sync-bridge.mjs`, all `wrangler.jsonc`/`package.json` files.

### 2.1 What exists and is sound
- **`packages/protocol/protocol.js`** — complete: `FAILURE` closed set with per-code copy, `PROV` provenance wrappers (`READ`/`CONSTANT`/`MISSING`), `membershipRecord`, `edgeKey`, grant scopes, ECDH P-256 → AES-GCM blind-relay crypto, `describeShape`/`applyMapping`, mapper values-guard, `schemaHash`. Matches GrokVisionResponse.md's fixes for Gaps 3, 4, 7 and E3.
- **`packages/bridge/bridge.js`** — `PageBridge` with both transports, identity from origin-served `/.well-known/connectome.json` (a POSTER, never authority), launch URL same-origin-only, mediated `request-surface` badge, cross-origin surface iframe, toolchange listener, soft de-membership on `NotAllowedError` (Gap 10). The threat note honestly states the postMessage trade-off under the extension transport.
- **`hub/gateway/src/hub-do.js`** — SQLite members/grants/audit/settings, origin-keyed membership with attested names, presence-as-transport (`present` flag from live sessions), revocable grants, kill switch enforced at the socket gate (`if (this.isPaused() && msg.t !== M.GRAPH_REQUEST)` — good), metadata-only audit, blind relay forwarding sealed envelopes.
- **`hub/gateway/src/index.js`** — serves the bridge as verbatim text (`/.webmcp/boot.js` et al.), routes WS to a per-user DO, correct comment trail about what is deliberately absent (Browser Rendering, crons, queues, workflows).
- **`hub/mapper/src/static-mapper.js`** — deterministic, rounds (exact → case → synonyms → lone-type on optional fields only), named refusals with human-readable `why`, never sees values.
- **Stubs** — CRM (`get-open-client`, `list-clients`, `add-note`), Ledger (`create-invoice`, `list-invoices`), Tick (`start-timer`, `stop-timer`, `list-entries`). Ignorant of the connectome; register on `document.modelContext`; degrade gracefully. Bridge script tag present in all three.
- **Surface** — anti-spoof mark in hub-origin localStorage, search-shaped directory, grants view with revoke/forget/export/pause, textContent-only DOM helpers.

### 2.2 What the plan requires that does not exist on disk
| Missing | Referenced by | Plan task |
|---|---|---|
| `scripts/dev.mjs` | `pnpm dev` | T0 — "six URLs" |
| `hub/gateway/src/vendor/*.js.txt` (3 files) | gateway imports; `sync-bridge.mjs` output | T0 boot fails without them |
| `hub/mapper/src/index.js` (worker entry) | `hub/mapper/wrangler.jsonc` `main` | T0/T1 — see Gap 3 |
| `extension/` (whole tree) | `pnpm-workspace.yaml`, `config.js` `EXT_ID` | T6 |
| `ci/distortion-tests.mjs` | `pnpm check`, gateway/mapper wrangler comments | T8 |
| `gates/` checklists | plan §7 tree | T2–T5 |
| `README.md` (stranger path) | plan §7 tree | T8 |
| `hub/surface/wrangler.jsonc` + `package.json` | `pnpm --filter surface dev`; port 8790 | T0 — see Gap 3 |
| tsconfig for `packages/protocol` | `pnpm typecheck` | T8 |

**Current state: the project is at the T0 frontier.** Nothing past Increment 0 is demonstrable on this machine today; `pnpm dev` and `pnpm check` both fail at the file level. That is exactly what the plan predicts for this stage — the finding is not that work is missing (it is, by design), but that several T0-critical files are unnamed by any task (Gap 3 below).

---

## Part 3 — Second-pass on GrokBalanceWork.md: gaps that exist

Each gap below is one the plan's own authority chain (`GrokVision.md`, `GrokVisionResponse.md`) or its own text requires, and which no task currently owns. Gaps 1 and 2 are the serious ones.

### Gap 1 — Consent is not enforced anywhere for the edge transport; the confirm can be bypassed
**Evidence:** `packages/bridge/bridge.js` (~lines 198–216): on `M.SEALED`, the bridge unseals the payload from **any** peer session (it derives a shared key with every peer delivered via `M.PEER_KEYS`) and calls `handleInvoke`, which runs the tool immediately. No grant check, no confirm evidence, no sender-role check. The hub DO's `M.SEALED` case relays to any session id without verifying an edge grant. The gateway accepts any WebSocket with attacker-chosen `origin` and `role` query params and no auth (`hub()` defaults to `"local-dev"`).

**Why it matters:** the entire consent model — "every write is exact JSON the user can refuse" (`GrokVision.md` §6.2, distortion test 6) — currently lives only in the surface's UI flow. Under the edge transport, any session that joins the DO (on localhost, that includes any web page the user visits, via `ws://localhost:8791/hub`) can seal an `INVOKE create-invoice` directly to a spoke's session and the spoke will execute it. The bridge's own threat note ("a forged 'run this' message still terminates at a confirm card") is not true of the edge path as built: the forged message terminates at `executeTool`.

**Note:** `GrokVisionResponse.md` §7's build plan put `pending confirm` inside the hub DO. The built `hub-do.js` dropped it. The plan (T1.1 "origin-routed invoke", T3 Gate B) never names where consent is enforced for the edge transport.

**What the plan needs:** an explicit task owning the enforcement point. Minimum viable design: the DO only relays `SEALED` when the sender session holds an active grant for that source→target edge, and stamps the envelope with a hub-issued `confirmId` minted at confirm time; the spoke bridge refuses any `INVOKE` not carrying a valid stamp. (The extension transport is structurally safer: the extension is the only thing that can call the spoke.)

### Gap 2 — No hub-join authentication or origin allowlist, even for the localhost demo
**Evidence:** `hub()` in `gateway/src/index.js` accepts `?cx=`, `x-connectome-id`, cookie, or the literal `"local-dev"`; `preflight()` sends `access-control-allow-origin: *` on `/api/*`, and the DO exposes `/do/pause`, `/do/revoke`, `/do/forget`, `/do/export`, `/do/grant` with no check. `upsertMember` accepts whatever `HELLO` claims.

**Why it matters:** the plan defers "Cloudflare Access / Turnstile pairing of DO ids" to the appendix as a *pre-non-localhost-deploy* item. But a drive-by page on any origin can already, today, (a) join the user's DO and become a peer (Gap 1 makes this a write primitive), (b) poison the member registry with fake apps and fake capabilities, (c) flip the kill switch, revoke grants, forget apps, or export the graph. The distortion tests assert the absence of scheduler doors; they do not assert the presence of a join door.

**What the plan needs:** a T1-scoped task (it is not appendix material): origin allowlist on `/hub` and `/api/*` (stub origins + surface origin, from config), rejection of cross-site browser-initiated hub requests, and a shared pairing token for local dev. CI should assert the allowlist exists.

### Gap 3 — T0's "six URLs" is unreachable, and no task owns the missing boot-critical files
**Evidence:** `hub/surface/` contains only `public/` — no `package.json`/`wrangler.jsonc`, so `pnpm --filter surface dev` fails and nothing serves :8790. `hub/mapper/wrangler.jsonc` declares `main: "src/index.js"`, but only `src/static-mapper.js` exists, so `wrangler dev --port 8792` fails; no task names the HTTP wrapper that binds `POST /map` to `map()` with the schema-only guard. `hub/gateway/src/vendor/` does not exist (`sync-bridge.mjs` was never run) so the gateway cannot even import. `scripts/dev.mjs` does not exist. The gateway comment says "`pnpm sync` refreshes them" but `package.json` has no `sync` script.

**What the plan needs:** T0 should enumerate its own file list — surface serving config, mapper worker entry (`hub/mapper/src/index.js` wrapping `static-mapper.js` + the values-guard at the endpoint), vendor sync step, dev orchestrator — instead of implying them from the §7 tree. Add `"sync": "node scripts/sync-bridge.mjs"` and have `dev.mjs` run sync as a preflight.

### Gap 4 — Origin→session routing and the multi-tab rule are unspecified
**Evidence:** `hub-client.js#invoke` (edge path) picks `Object.keys(this.peerKeys).find((id) => id !== this.sessionId)` — the first non-self peer. With three stubs + surface connected, that is an arbitrary app. The DO's `graph()` computes `present` per origin from live sessions but never publishes a session↔origin map, so the surface *cannot* address the right spoke even if it wanted to. T1.1 ("origin-routed invoke — stop when a wrong-app write is impossible") owns the outcome but the plan specifies no mechanism, and says nothing about the ambiguity case: two tabs of the same app both register `get-open-client` — which tab answers?

**What the plan needs:** T1.1 should name the design: the DO maintains the session registry (already exists: `sessionId -> {ws, origin, role}`), publishes or accepts an origin→session resolution, and rejects `SEALED` envelopes whose `to` session does not match the edge's target origin. For multi-tab, state the rule in the plan (suggested: most-recently-focused session wins, ties broken by the hub, never both).

### Gap 5 — Repo-complete items with no owner
- `pnpm typecheck` runs `tsc -b packages/protocol`, but there is no `tsconfig.json` anywhere under `packages/` — T8 will trip on its own definition of done. Either add the config to T0 or drop typecheck from repo-complete.
- `ci/distortion-tests.mjs` is referenced by two wrangler comments and the root `package.json` before T8 exists; fine, but the plan should say the repo does not pass `pnpm check` until T8, so nobody "fixes" it by deleting the script.

### Gap 6 — SCHEMA_DRIFT has a code, a column, and no enforcement location
**Evidence:** `FAILURE.SCHEMA_DRIFT` exists; the `grants` table stores `schema_hash`. Nothing in the bridge, the DO, or the visible surface flow compares the live `inputSchema` hash against the grant at invoke time. The plan never says *where* the drift check belongs.

**What the plan needs:** one sentence in T1 or T3: the surface (which holds the grant) verifies `schemaHash(target.inputSchema)` against the grant before rendering the confirm; on mismatch, raise `SCHEMA_DRIFT` and offer re-grant. Optionally the spoke bridge double-checks the stamped grant's hash (pairs with Gap 1's stamp).

### Not gaps (checked, found covered)
- Kill switch: enforced at the DO socket gate, not just the UI. ✔
- §5.5 leak: the bridge never stores or forwards `GRAPH` to the page; the member directory never enters the document. ✔
- Name/identity: membership is origin-keyed with an attested-name flag; labels are posters, not authority. ✔ (Gap 3 of the response doc.)
- Mapper sees names/types only, refusals are named, required fields are never guessed. ✔
- Extension transport direct-channel decision from `What'sBuilt.md` is preserved in `config.js`. ✔
- Blind relay: the DO holds no key; audit is metadata-only. ✔

---

## Part 4 — Possible enhancements (optional; none block T0–T8)

Ordered by value-to-effort. Everything here must still pass `GrokVision.md` §8 — each item is surface-or-transport, never engine.

1. **Enforce-and-assert consent at the relay** (folds Gap 1 + 2 into one CI rule): distortion test that a `SEALED` relay without an active grant/stamp is refused, and that an unlisted origin cannot open `/hub`. Single highest-value addition to `ci/distortion-tests.mjs`.
2. **Activity pane in the surface**: the DO already writes a metadata-only audit ledger (`recentAudit()` is exposed at `/do/audit`) but the surface shows only grants. Rendering "Ledger ← CRM, 3 calls, last 2 min" turns the consent story from a ledger into a living fact — and costs one view.
3. **Grant `uses` counter in the UI**: the schema already tracks `uses`; showing "allowed 12 times since Aug 28" on each grant row is free transparency.
4. **Mapper endpoint hardening**: make the values-guard a runtime check at `POST /map` (deep-scan the body for any non-schema-shaped leaf and 422), not just a CI invariant — the endpoint is the one place a future `llm-mapper.js` could leak values.
5. **Strengthen the anti-spoof mark**: glyphs + hue are memorable but forgeable by luck (8×6). Add a random short secret phrase rendered in the surface chrome; the host page still cannot read it cross-origin. Optional re-roll button.
6. **`dev.mjs` preflight**: run `sync-bridge.mjs`, then health-check all six ports before printing URLs, and print which transport each stub negotiated. Saves the next implementer an hour on every boot.
7. **`present` should age**: `graph()` marks a member present if any session origin matches. With multi-tab (Gap 4), presence flickers as tabs close; the surface should show presence with a short decay or a per-session count rather than a binary flip.
8. **`FORGET` should also close sessions**: `forget(origin)` deletes the member row and grants, but a live WS session for that origin re-registers on its next `HELLO`/`TOOLS_CHANGED`. After forgetting, the DO should refuse re-registration from that origin until the user re-adds it (a `blocked` column already exists — wire it to `forget`).

---

## Part 5 — Where this leaves the project

- The plan's shape is correct and its cut line (T3 green is the product; everything before is scaffolding; everything after is reach) is the right honest framing.
- The code that exists matches the plan's architecture faithfully — two transports, blind relay, provenance, taxonomy, origin-keyed membership — and several subtle rules (kill-switch at the socket gate, launch same-origin-only, textContent-only surface) are implemented exactly as the documents demand.
- The two changes this second pass asks of the plan itself: **(1)** give consent enforcement an architectural home for the edge transport with a CI assertion (Gap 1), and **(2)** pull hub-join authentication from the appendix into T1 (Gap 2). Everything else is file-level bookkeeping (Gap 3) or one-sentence specifications (Gaps 4–6).
- Recommended order for the next implementer: T0 with the explicit file list from Gap 3 → Gap 2 (allowlist) as part of T1 → Gap 1 (enforcement point) also in T1, *before* Gate B — because a Gate B demo that can be bypassed by a sealed envelope is not the product `GrokVision.md` §6.2 describes.




