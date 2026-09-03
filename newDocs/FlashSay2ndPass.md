# FlashSay2ndPass.md

Second pass of `FlashSays.md`, against the connectome tree as it sits today (2026-09-02): `main` at `bce067f`, plus the uncommitted WebMCP native-compat edits in `packages/protocol/protocol.js`, `packages/bridge/bridge.js`, `packages/bridge/webmcp-polyfill.js`, `hub/gateway/src/hub-do.js`, and `hub/surface/public/surface.js`.

`FlashSays.md` was a review of `GrokBalanceWork.md` at the T0 frontier, later appended with a live-mesh verification (Part 6). This file does not reopen `GrokVision.md` §1 or §8. It asks only: which of those findings still describe the code, which were closed (and how), which prescriptions were rejected, and what the first pass could not have seen because the code did not exist yet.

Nothing here is invented. Each claim cites the file that currently holds it.

---

## Part 0 — What this pass actually ran

- Read `FlashSays.md` in full, then the current sources it named, plus the files that did not exist when Parts 1–5 were written (`pairing.js`, `origins.js`, `limits.js`, `manifest.js`, `llm-mapper.js`, `scripts/dev.mjs`, `scripts/deploy.mjs`, `extension/`, `ci/*`, `gates/*`, `REVIEW.md`).
- Re-checked the uncommitted WebMCP diff against Chrome’s documented `document.modelContext` contract (getTools stringifies `inputSchema`; `executeTool` takes a JSON string) and against the WebMCP IDL (which types `executeTool` as an object the UA serialises).
- Ran `pnpm check` from `connectome/` with the working tree as-is:

| Suite | Result |
|---|---|
| `ci/distortion-tests.mjs` | **254 passed, 0 failed** |
| `ci/provide-context.mjs` | **13 passed, 0 failed** |
| vitest (`gateway` + `hub-do` + `mapper`) | **21 passed, 0 failed** |
| **Total** | **288 / 288** |

That matches `FlashSays.md` Part 6’s count. It was run with vendored copies already on disk from a previous `pnpm sync`. A clean checkout is a different story — see Gap N1.

This pass did **not** re-drive the browser. The eight screenshots in `scratch/screenshots/` are still there. The CDP runner Part 6 points at (`scratch/e2e-runner.mjs`) is **not** on disk.

---

## Part 1 — Scorecard of FlashSays Gaps 1–10

| Gap | FlashSays claim | Status now | What closed it (or did not) |
|---|---|---|---|
| **1** Consent bypass on edge `SEALED` | Any peer could unseal and `executeTool`; hub relayed to any session | **Closed, by a different design than the one FlashSays prescribed** | HubDO forwards `SEALED` only surface↔spoke (`hub-do.js:439-452`). PageBridge ignores plaintext `INVOKE` on the edge path and refuses `SEALED` whose `PEER_KEYS` origin is not the surface (`bridge.js:216-243`). Distortion tests lock both (`ci/distortion-tests.mjs:993-1008`); hub-do tests refuse spoke-to-spoke even with `?role=surface` (`hub-do.test.js:207`). |
| **1 prescription** Mint a hub `confirmId`; spoke refuses unstamped `INVOKE` | **Rejected, on purpose** | `GrokBalanceWork.md` lock “Who may invoke”: confirm stays `viewConfirm` / `doWrite`; “Do **not** restore pending-confirm / `confirmId` in the Durable Object.” Residual of that choice is Gap N2. |
| **2** No join door: `hub()` defaults to `"local-dev"`, CORS `*`, `/do/*` unguarded | **Closed for unlisted origins; residual for listed spokes** | Origin allowlist (`origins.js`) on `/hub` and `/api/*`. Identity is the `Origin` header, not `?origin=` / `HELLO.origin` (`hub-do.js:417`). Production pairing is Turnstile + HMAC cookie (`pairing.js`); `ENVIRONMENT` unset fails closed (`pairing.js:43-45`, `connectomeId` at `:202-212`). Residual is Gap N2. |
| **3** T0 “six URLs” unreachable; missing `dev.mjs`, surface package, mapper entry, vendor, `pnpm sync` | **Closed** | All of those files exist. `pnpm dev` runs `sync-bridge.mjs` then `build-env.mjs`, asserts ports free, waits until listening, prints the six URLs (`scripts/dev.mjs`). |
| **4** Origin→session routing unspecified; first non-self peer | **Closed** | `latestPeerId` picks most-recent `helloAt` of that origin (`protocol.js:121-134`). HubDO `#latestSession` is the same rule (`hub-do.js:511-518`). `PEER_KEYS` carries `origin` + `helloAt`. Unit-checked in `scripts/t1-check.mjs`. Multi-tab rule is “most recently HELLOed wins, never both.” |
| **5** `pnpm typecheck` / missing `packages/protocol` tsconfig | **Closed by deletion, not by adding types** | Root `"check"` is distortion + provide-context + vitest. There is still no `tsconfig.json` anywhere under `connectome/`. The plan-complete item went away when typecheck left the script. |
| **6** `SCHEMA_DRIFT` has a code and a column, no check | **Closed** | `startEdge` hashes live `cap.inputSchema` against stored grants before offering the edge (`surface.js:606-622`). `doWrite` stores `schemaHash` at grant time (`surface.js:1033-1038`). `grantIsLive` enforces `ONCE` / `SESSION` (`protocol.js:299-302`). Gate E recorded it (`gates/gate-e.md` T7.3). CI replica in `ci/provide-context.mjs:113-154`. |
| **7** Native `getTools()` returns `inputSchema` as a JSON **string** | **Diagnosed correctly; fix is in the working tree, not yet shipped** | Uncommitted parses in `toolDescriptor`, `publicCapability`, `rowToMember`, `prepareConfirm`, `viewConfirm`. See Part 3 for defects in that fix. Chrome’s own getTools example and the spec’s “stringify the input schema” step agree with the diagnosis. |
| **8** Native `executeTool` wants a JSON **string**, not an object | **Diagnosed correctly; the fallback can double-run a write** | Uncommitted `handleInvoke` stringifies first, then on *any* throw retries with the object (`bridge.js:151-155`). Polyfill now accepts both (`webmcp-polyfill.js:141-142`). See Part 3. |
| **9** Wrangler `EROFS` on `$HOME/.wrangler` | **Environment, not product.** `scripts/dev.mjs` does not set `HOME` / `WRANGLER_HOME`. Still true in a read-only home. |
| **10** Mapper `wrangler dev` dies on Workers AI auth | **Closed for tests; open for `pnpm dev`** | `vitest.config.js` points the mapper project at `wrangler.test.jsonc` (no `ai` binding). `hub/mapper/wrangler.jsonc` still has `"ai": { "binding": "AI" }` and that is what `pnpm dev` boots. `llm-mapper.js` returns `null` when `env.AI` is missing or `run()` throws, but wrangler may refuse to start the Worker at all without account credentials. |

---

## Part 2 — Where FlashSays is now stale, or was wrong

### 2.1 Parts 1–5 describe a tree that no longer exists

“Current state: the project is at the T0 frontier. `pnpm dev` and `pnpm check` both fail at the file level” (`FlashSays.md` §2.2) is false today. Gates A–E have checklists and `results.json`. The extension tree exists. `README.md` is the stranger path. `pnpm check` is green (288). `pnpm dev` is a real orchestrator. `REVIEW.md` (AIL-24) and the AIL-25–28 commits already executed the appendix items FlashSays still treated as future work (pairing, env-driven origins, llm-mapper, deploy script, workerd tests, metrics, rate limits, manifest caps).

That is not a knock on the first pass. It is why a second pass is required: the document under review aged in place, and Part 6 was appended without rewriting Parts 1–5.

### 2.2 Gap 1’s *prescription* was not the product

The diagnosis was right: a forged `SEALED` used to terminate at `executeTool`. The proposed home for consent — a hub-issued `confirmId` the spoke checks — was explicitly refused once the plan absorbed the pass (`GrokBalanceWork.md:86, 317`). The built home is:

1. only the surface session may cause `executeTool`;
2. grants mean “propose this edge and run the named source read”;
3. every write still goes through `viewConfirm` / `doWrite` in hub-origin JS.

A second pass that re-asks for `confirmId` would be re-litigating a lock. The remaining hole is not “no stamp on the envelope”. It is “anything that can run as the surface origin, or that can hit `/api/*` with a listed Origin, is graph-admin.” That is Gap N2, below.

The threat note in `bridge.js:22-32` was updated and is now accurate for the WebSocket path. It is not accurate for `/api/*`.

### 2.3 Gap 2’s *prescription* is what shipped — and it is too coarse

FlashSays asked for “origin allowlist on `/hub` and `/api/*` (stub origins + surface origin).” That is exactly `isAllowedOrigin` / `isAllowedApiOrigin` (`origins.js:44-56`) and exactly the join-door lock in `GrokBalanceWork.md:85`. Drive-by origins can no longer join.

The allowlist for `/api/*` is the **same list** as `/hub`, plus the pinned extension origin. Spokes therefore inherit pause / revoke / forget / grant / export / declare. The code already knows how to split a door — `EXTENSION_ORIGIN` is `/api/*` only, never `/hub` (`origins.js:27-33, 54-56`) — and did not apply the inverse split (spokes `/hub` only, never `/api/*`).

### 2.4 Part 6 points at a runner that is not there

“An automated CDP runner (`scratch/e2e-runner.mjs`) was built…” — that path does not exist. `scratch/screenshots/01_crm_initial.png` … `08_ledger_offline.png` do. `pnpm test:e2e` is not in `connectome/package.json`. The screenshots are evidence the flow was driven; they are not a command the next person can rerun.

### 2.5 The vendor-sync suggestion fights the current generate-on-dev rule

Part 6 suggestion 3 wants CI to byte-compare `packages/*` against `hub/gateway/src/vendor/`, `hub/surface/public/protocol/`, `extension/vendor/`. Those destinations are **gitignored** (`connectome/.gitignore:5-9`). `sync-bridge.mjs:8-9` says so on purpose: “Generated copies are gitignored. Do not edit them.” A committed-copy diff cannot be the guard. The guard has to be “run `pnpm sync` before check and before deploy.” Today neither script does. That is Gap N1, and it is more load-bearing than a drift assertion.

---

## Part 3 — The uncommitted WebMCP fix (Gaps 7–8)

The diagnosis matches the platform:

- Chrome’s getTools walk serialises `inputSchema` to a JSON string; `cap.inputSchema?.properties` is then `undefined` and the confirm card collapses to `{}`. That is a real Gate B break under `chrome://flags/#enable-webmcp-testing`.
- Chrome’s `executeTool` documentation: arguments are “a valid JSON string.” Passing an object yields `UnknownError: Failed to parse input arguments`. The polyfill historically took an object. Native Chrome and the polyfill were not the same API.

The working-tree fix is the right *shape* (normalise on the way in, stringify on the way out) and it is not yet safe.

### N3 — `handleInvoke` retries every failure, so a write can run twice

```151:155:connectome/packages/bridge/bridge.js
      try {
        data = await document.modelContext.executeTool(registered, JSON.stringify(args ?? {}));
      } catch (callErr) {
        data = await document.modelContext.executeTool(registered, args ?? {});
      }
```

The polyfill now accepts a string, parses it, and calls `tool.execute`. On the primary path (no native WebMCP, which is what `README.md` tells people to run) the first call **already runs the tool**. If `execute` throws after a side effect — `create-invoice` pushed a draft, then rejected — the catch runs it again.

The fallback is only legitimate for the narrow native error “Failed to parse input arguments” / `DataError` when the UA wanted an object. Catching `TOOL_FAILED`, `NotFoundError`, missing-required, and post-write exceptions is a double-write primitive on the exact tool Gate B exists to confirm.

**Fix shape:** stringify always (polyfill accepts strings; Chrome wants strings). If a spec-IDL UA must receive an object, retry only when the error is a parse/type error *and* the first call cannot have reached `execute`. Do not catch-all.

### N4 — `viewConfirm` `JSON.parse`s without a try, and a failed parse in `prepareConfirm` is silent

`prepareConfirm` (`surface.js:764-767`):

```js
if (typeof cap.inputSchema === "string") {
  try { cap.inputSchema = JSON.parse(cap.inputSchema); } catch {}
}
```

On failure the string is left in place. `viewConfirm` (`surface.js:865`) then does:

```js
const schema = typeof cap.inputSchema === "string" ? JSON.parse(cap.inputSchema) : (cap.inputSchema ?? {});
```

No try. A broken native schema throws, and the confirm view is a blank panel rather than `SCHEMA_INVALID`.

`toolDescriptor` / `publicCapability` have the same silent catch, then fall through. `publicCapability` is worse: after a failed parse, `schema` is still a non-empty string, and `schema ?? { type: "object", properties: {} }` keeps the string (a string is truthy). That string then sits in SQLite `members.capabilities`. `startEdge` hashes it with `schemaHash`, which canonicalises a string differently than an object, so a later successful parse looks like `SCHEMA_DRIFT` against a grant that was never drifted.

**Fix shape:** one helper, used in every site: parse-or-empty-object, never parse-or-throw, never parse-or-keep-the-string. Hash after parse. `viewConfirm` must not be a second parser.

### N5 — the five-site parse is not the same parse

| Site | On string | On failure |
|---|---|---|
| `toolDescriptor` | `JSON.parse` | empty `{ type: "object", properties: {} }` |
| `publicCapability` | `JSON.parse` | **keeps the string** |
| `rowToMember` | mutates each cap | keeps the string |
| `prepareConfirm` | mutates `cap` | keeps the string |
| `viewConfirm` | `JSON.parse` | **throws** |

That is four behaviours for one native quirk. The spoke HELLO path uses `toolDescriptor` (good). The graph the surface hashes uses `publicCapability` (not good). The card the user sees uses `viewConfirm` (throws). Under native WebMCP these three are the same tool.

---

## Part 4 — New gaps this pass found

These are holes FlashSays could not see, or that only opened once its own prescriptions shipped.

### N1 — `pnpm check` and `pnpm deploy` do not vendor; vendor is gitignored

`connectome/.gitignore` excludes `hub/gateway/src/vendor/`, `hub/surface/public/protocol/`, `extension/vendor/`, `extension/protocol/`.

`HubDO` imports `./vendor/protocol.js`. The gateway Worker imports `./vendor/bridge.js.txt` (and the other two text modules) as the bytes it serves at `/.webmcp/*`. Those files exist on this machine because someone already ran `pnpm sync`. They will not exist in a GitHub Actions checkout.

`.github/workflows/check.yml` runs `pnpm install` then `pnpm check`. `"check"` is `distortion-tests && provide-context && vitest run` (`package.json:16`). No sync. Distortion tests skip the `vendor` directory on purpose (`ci/distortion-tests.mjs:31, 44-46`) and would still pass. Vitest has to instantiate the gateway Worker; that import will fail.

`scripts/deploy.mjs:73-74` runs `build-env.mjs` only — not `sync-bridge.mjs`. A clean `pnpm deploy` therefore ships a gateway that cannot resolve the protocol module and cannot serve the page bridge.

`pnpm dev` is the one entry that syncs first (`dev.mjs:53, 60-67`). Local happy-path hides the hole.

**What the tree needs:** `"check": "pnpm sync && …"` and `deploy.mjs` must run `sync-bridge.mjs` before any `wrangler deploy`. The FlashSays vendor-byte-compare is the wrong shape once copies are generated.

### N2 — A listed spoke is graph-admin, and the production topology makes the pairing cookie ride

`apiJoinDenied` (`index.js:255-266`) admits any `isAllowedApiOrigin`. That is every spoke plus the surface plus the extension. CORS echoes that origin with `access-control-allow-credentials: true` (`index.js:300-308`).

`docs/topology.md:1-8` puts hub, surface, and all three stubs on subdomains of one registrable domain so `SameSite=Lax` pairing cookies ride. Same-site is not same-origin: `crm.<zone>`’s JS may `fetch https://hub.<zone>/api/pause` with the cookie, and the allowlist will say yes.

On localhost the same fact holds without pairing: `ENVIRONMENT=local` falls back to `"local-dev"` (`pairing.js:207-211`), and `http://localhost:8787` → `http://localhost:8791` is same-site.

So XSS (or any script) in Acme CRM can, today:

- pause the connectome;
- revoke or mint grants;
- forget Ledger;
- export the graph;
- `POST /api/declare` with a fabricated poster (see N6) and un-forget an origin the user just removed.

Spoke-to-spoke `SEALED` is refused, so this is not a silent `create-invoice`. It is still a kill-switch / consent-ledger primitive from an app origin, which is the Gap 2 threat FlashSays named, minus only the drive-by-from-`evil.example` case.

Tests lock the unlisted-origin refusal (`gateway.test.js:27-47`) and do **not** lock “CRM cannot pause.” The join-door lock in the plan put stubs on `/api/*` deliberately; the production cookie topology is what turns that into admin.

**What the tree needs:** `/hub` = spokes + surface; `/api/*` = surface + extension. Spokes already have no reason to call `/api/*` — `PageBridge` is a WebSocket client. Distortion-test that a listed spoke Origin is 403 on `/api/pause`.

This is the highest-value remaining finding. It is not a `confirmId`.

### N6 — `POST /api/declare` trusts a client-supplied poster, so `fetchManifest` is dead on the product path

```116:125:connectome/hub/gateway/src/index.js
      if (url.pathname === "/api/declare" && request.method === "POST") {
        ...
        if (body?.identity && body?.origin) {
          found = { ok: true, record: body };
        } else {
          found = await fetchManifest(body?.origin, env);
        }
```

`HubClient.declare` (`hub-client.js:267-289`) always fetches `/.well-known/connectome.json` in the browser, runs `parseConnectomeManifest`, and POSTs that record. The record always has `identity` and `origin`. The gateway therefore **never** runs `manifest.js` (timeout, 16 KiB cap, no-credentials, no-redirect, KV cache — the whole of REVIEW.md G4) on the path the surface uses.

G4 is real code behind an `else` the product does not take. A listed origin (Gap N2) can declare any origin with any name, and `HubDO.declare` deletes that origin from `forgotten` first (`hub-do.js:247`), which is the un-forget door.

The poster is not authority for invoke — tools still come from HELLO — but it is authority for the name the user sees and for resurrection after Forget.

**What the tree needs:** the gateway always `fetchManifest(body.origin)` and ignores client `identity`. The browser fetch stays as fail-fast UX.

### N7 — Surface has no CSP, and hub-origin JS *is* the write gate

`hub/surface/public/index.html` sets `Permissions-Policy: tools=()` and nothing else. `_headers` is the same one line. There is no `Content-Security-Policy`.

Under the lock FlashSays lost (confirm lives in the surface, not in a DO stamp), XSS in the surface origin is `client.invoke(...)` with arbitrary args. The anti-spoof mark (`surface.js:66-79`, 8 glyphs × 6 hues) stops a **host page** from painting a convincing fake; it does nothing once the real iframe is executing attacker JS.

This is the honest residual of “do not mint `confirmId`.” It should be named, and a CSP (default-src 'self'; no inline, no host-origin eval) is the cheap half of living with that lock.

### N8 — `pnpm dev` still boots the mapper with the AI binding

`hub/mapper/wrangler.jsonc:30-37` enables `ai.binding = "AI"` and sets `AI_MODEL` to `@cf/meta/llama-3.1-8b-instruct`. `scripts/dev.mjs` starts `hub/mapper` with that config. `wrangler.test.jsonc` is only the vitest project.

FlashSays Gap 10 is therefore closed for `pnpm check` and open for the stranger path in `README.md`. If wrangler requires an authenticated account to even bind `AI`, `pnpm dev` is not zero-config on a fresh laptop. `llm-mapper.js:82` already returns `null` without `env.AI`; the local mesh does not need the binding at all.

---

## Part 5 — Enhancements FlashSays offered, scored

From FlashSays Part 4 (plan-time) and Part 6 §4 (post-verification). None of these block Gates A–E. Numbering is FlashSays’.

| # | Item | Now |
|---|---|---|
| P4.1 | Distortion test: ungranted `SEALED` refused; unlisted origin cannot open `/hub` | **Partial.** Unlisted `/hub` and spoke-to-spoke `SEALED` are asserted. Ungranted surface→spoke `SEALED` is still allowed — by the lock, grants do not buy a write and the surface is trusted. A test that a **spoke** Origin cannot `POST /api/pause` is the missing assertion (N2). |
| P4.2 | Activity pane from `recentAudit()` | **Not built.** `/do/audit` exists; the surface has directory, member, confirm, grants, pairing. No audit view. |
| P4.3 | Show grant `uses` in the UI | **Tracked, not shown.** `useGrant` increments (`hub-do.js:313-316`). Gate E checked `uses=1`. `viewGrants` renders scope and timestamp only (`surface.js:1175-1177`). |
| P4.4 | Values-guard at `POST /map`, not only CI | **Done.** `assertNoValues` in `mapper/src/index.js:85` and again in `llm-mapper.js:90` before `env.AI.run`. Order is CI-enforced (`ci/distortion-tests.mjs:410-425`). Mapper tests reject a body that carries a value. |
| P4.5 | Anti-spoof secret phrase | **Not built.** Still two glyphs + a hue (`surface.js:66-67`). Gate B spoof check used that (`gates/gate-b/results.json` `"fake mark ?? ≠ real mark ▲◈"`). |
| P4.6 | `dev.mjs` preflight | **Partial.** Sync + port-free + wait-until-listen + URL banner. No `/health` probe, no “this stub negotiated edge/extension” line. |
| P4.7 | `present` should age | **Not built.** `graph()` is still `live.has(origin)` (`hub-do.js:216-218`). Gate E T7.1 explicitly left decay out. |
| P4.8 | `forget` should close sessions and not resurrect on HELLO | **Done.** Closes matching spoke sockets (`hub-do.js:269-277`), writes `forgotten`, `upsertMember` refuses non-DECLARED resurrection (`hub-do.js:147-149`). Gate E T7.4 recorded it. |
| P6.1 | Stub `sessionStorage` for demo invoices | **Not built.** `apps/stub-invoicing/public/app.js:10` is still `const invoices = []`. A refresh during a Gate B demo still loses `INV-1001`. |
| P6.2 | `pnpm test:e2e` | **Not built**, and the runner Part 6 named is gone. |
| P6.3 | Vendor sync guard in distortion tests | **Not built**, and as written would test gitignored files. See N1. |

---

## Part 6 — What FlashSays said was sound, and still is

These were checked again, not assumed:

- **Kill switch at the socket, not the UI.** `webSocketMessage` returns `M.PAUSED` for every type except `GRAPH_REQUEST` when paused (`hub-do.js:410-412`).
- **§5.5 leak.** `PageBridge` never forwards `GRAPH` to the host page (`bridge.js:214-250` default is drop). The directory lives in the hub-origin iframe.
- **Name/identity.** Membership is origin-keyed; `HELLO.origin` is a poster (`hub-do.js:417-431`); hub-do tests spoof it (`hub-do.test.js:146`).
- **Mapper sees names/types only; required fields are never guessed; refusals are named.** Static mapper unchanged in contract; llm-mapper drops `description`, forbids `constant` in model output, validates paths against the real schema (`llm-mapper.js:12-36, 90`).
- **Extension direct-channel.** `config.js` still pins `EXT_ID`. Surface talks to it with `chrome.runtime.sendMessage`, not via the host page.
- **Blind relay.** DO still holds no key; `#audit` is metadata-only and now prunes inline (`hub-do.js:535-554`) rather than by alarm.
- **Launch same-origin-only.** `parseConnectomeManifest` / `fetchManifest` still drop a `launch` whose origin is not the poster’s.
- **textContent-only surface** for untrusted strings. Still the rule; `description` is not `innerHTML`.
- **Surface-only invoke on the WebSocket path** is real code with real tests, not a comment.

`REVIEW.md`’s thirteen gaps are also largely closed as *code* (pairing, deploy script, `llm-mapper.js`, manifest caps, audit watermark, rate limits, workerd tests, mapper-guard order, metrics, explicit deploy list, env-driven origin tests, nested `env.production` still banned for crons/queues/workflows, Node 20 navigator stub). They are not closed as *operations* where this pass found N1, N2, N6, N8.

---

## Part 7 — Where this leaves the project

- The plan’s cut line survived contact with the code. T3 green is the product; T0–T2 are scaffolding; T4–T8 are reach. All of that is on disk. `FlashSays.md` Parts 1–5 should be read as a historical review of the T0 tree, not as status.
- The two changes FlashSays asked of the plan — (1) an enforcement home for edge consent, (2) a join door in T1 — both landed. (1) landed as surface-only invoke, not `confirmId`. (2) landed as Origin allowlist plus production pairing. Both are the right architectural answers. Both have a leftover the first pass did not have enough code to see: listed spokes on `/api/*` under a same-site cookie topology (N2), and a declare path that never re-fetches the poster (N6).
- The live-mesh work in Part 6 is real: 288 tests still pass; Gaps 7–8 are a genuine native-WebMCP mismatch, not a polyfill fantasy. The uncommitted fix is not mergeable as-is because `handleInvoke` can double-run a confirmed write (N3) and the schema parser is five slightly different functions (N4, N5).
- Repo-complete, as `README.md` currently defines it, is one `pnpm sync` away from failing on a clean clone (N1). That is the stranger-path bug. The product-law bug is N2.

---

## Part 8 — Recommended order for the next implementer

Do not reopen `confirmId`. Do not add a tsconfig to satisfy a check script that no longer typechecks.

1. **N3 / N4 / N5 — finish the native WebMCP pass before it is the next person’s browser surprise.** One parse helper; stringify-only `executeTool` with a typed fallback; hash after parse. Then `pnpm sync` (and a mesh restart) so the gateway actually serves the new bridge.
2. **N1 — `pnpm sync` is a preflight of `check` and `deploy`, not a courtesy of `dev`.** Until that lands, CI’s vitest step and a clean `pnpm deploy` are unproven.
3. **N2 — split the doors.** `/api/*` = surface + extension. `/hub` = spokes + surface. One distortion test: listed CRM Origin, `POST /api/pause` → 403. This is the leftover of Gap 2 that actually matters on the zone in `docs/topology.md`.
4. **N6 — `declare` always `fetchManifest`s.** Delete the `body.identity && body.origin` short-circuit. G4 stops being ornamental.
5. **N7 — CSP on the surface.** Default-src 'self'. The write gate is that document.
6. **N8 — local mapper without `ai`.** Point `pnpm dev` at the same config vitest already uses, or drop the binding when `ENVIRONMENT=local`.
7. Only then the cheap transparency items: `uses` on the grant row, an audit pane, stub `sessionStorage`, a real `pnpm test:e2e` that checks the runner in.

Gate B on the polyfill path is still the product. Native WebMCP is the path Chrome will actually be on for anyone who flips the flag, and it is the path Part 6 proved is not the same API. Ship the compat fix correctly; then close the join door the allowlist left open between friends.
