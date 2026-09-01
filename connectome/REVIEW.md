# Code review — gap analysis and Cloudflare-nativity audit

AIL-24. Reviewed at `9bdcd9c`, against `../GrokVision.md` (product law),
`../GrokVisionResponse.md` (architecture response) and `../GrokBalanceWork.md` (build plan).

Baseline at time of review: `ci/distortion-tests.mjs` → **66 passed, 0 failed**. Gates A–E
green (`gates/*/results.json`). Nothing in this document reports a broken gate or a failing
assertion. (`pnpm check` also chains `ci/provide-context.mjs`, which is green on the Node 22
that CI pins but crashes on Node 20 — see **G13**.)

## How to read this

Every gap cites `file:line`. Every rejected Cloudflare product cites the `GrokVision.md` §10
row **verbatim**, not a general appeal to "the reject list" — if a row cannot be quoted, the
rejection is not grounded and should be re-argued rather than assumed.

This is a review, not a change. No source file is modified by this document.

---

## Verdict

The architecture is sound and the product law is genuinely enforced in CI rather than in
comments. Origin-bound identity, the blind relay, per-edge consent, and the surface-only
invoke gate are all real code with real tests behind them.

**It is also undeployable, and its per-user graph becomes takeable the moment it leaves
localhost.** Three blockers, thirteen gaps total. None of them are architectural — they are
the unwritten last mile between "the gates are green on my laptop" and "a stranger can use
this on a public URL".

One framing point that matters for scope. AIL-24 is **not** inventing new work. Every
workstream it takes on is already sanctioned by `../GrokBalanceWork.md` §9 "Appendix — after
the project is complete", which pre-declares the exact conditions under which each becomes
legal:

| Appendix item (`../GrokBalanceWork.md:715-721`) | Condition | Met? |
|---|---|---|
| `src/llm-mapper.js` behind AI Gateway | "After T1.3's `assertNoValues` is CI-enforced. Same `/map` interface." | **Yes** — `ci/distortion-tests.mjs:304-307` |
| Cloudflare Access / Turnstile pairing of DO ids | "Before any non-localhost deploy." | **Now due** — the deploy is the story |
| Real hostnames, edge injection of `/.webmcp/boot.js` | "After T3, when a zone exists." | T3 green; zone is the story |
| Vectorize capability search | "After the directory is real (T3)." | Out of scope for AIL-24 |

The Appendix is the scope. AIL-24 is executing it, not extending it.

---

## Part 1 — Gaps, severity-ordered

### S1 — Blockers. A public deploy without these is unsafe or impossible.

#### G1 — Connectome addressing is unauthenticated · `hub/gateway/src/index.js:123-131`

```js
function hub(env, request) {
  const url = new URL(request.url);
  const who =
    url.searchParams.get("cx") ||
    request.headers.get("x-connectome-id") ||
    cookie(request, "cx") ||
    "local-dev";
  return env.HUB.get(env.HUB.idFromName(who));
}
```

The per-user Durable Object — the connectome graph itself — is addressed by a value the
caller supplies and nobody verifies. Knowing (or guessing) an id **is** being that user.
Every `/api/*` route reached through this function inherits the hole: `graph`, `grants`,
`grant`, `revoke`, `forget`, `pause`, `audit`, `export`.

On localhost the Origin allowlist (`origins.js:20-26`, T1.5) contains the blast radius,
because only four origins can reach the door at all. On a public hostname that containment
is gone: the allowlist will contain real, publicly-reachable domains.

This is not a newly discovered problem. The function's own docblock names the fix at
`hub/gateway/src/index.js:117`:

> *"In production this is where Cloudflare Access or a Turnstile-gated pairing token belongs,
> so that knowing an id is not the same as being allowed to join someone's connectome."*

And `../GrokBalanceWork.md:719` schedules it precisely here — *"Before any non-localhost
deploy. `local-dev` as the DO name is a demo-only hole."*

**Severity: blocker.** Full graph takeover: poison members, revoke grants, pause, forget,
or export another user's metadata.

**Fix shape:** `POST /api/pair` verifying a Turnstile token against
`challenges.cloudflare.com/turnstile/v0/siteverify`, minting a high-entropy id, HMAC-signing
it with `crypto.subtle`, returning it as `HttpOnly; Secure; SameSite=Lax`. In production
`hub()` accepts only the signed cookie or a Cloudflare Access JWT; `?cx=` and
`x-connectome-id` are accepted only when `env.ENVIRONMENT === "local"`.

Note the §10 clearance: Turnstile is a *pairing* gate that runs inside a request the user
caused. It never writes, never fires unattended, and grants nothing beyond addressing your
own graph. It does not touch §10's *Global “allow this agent”* row — consent stays per-edge.

#### G2 — There is no deploy path · repo-wide

No `wrangler.jsonc` in the tree contains `routes`, `custom_domain`, or an `env` block. No
package declares a `deploy` script — all seven declare only `dev`
(`apps/*/package.json:6`, `hub/*/package.json:6`). There is no deploy workflow;
`.github/workflows/check.yml` runs `pnpm check` and stops.

`localhost:87xx` is hardcoded in six places, and they are not all where you would look:

| Location | What is pinned |
|---|---|
| `hub/gateway/src/origins.js:8,13-19` | `SURFACE_ORIGIN`, the four-entry `ALLOWED_ORIGINS` |
| `hub/mapper/src/index.js:14` | `const SURFACE_ORIGIN = "http://localhost:8790"` |
| `hub/surface/public/config.js:17-18` | `GATEWAY_URL`, `MAPPER_URL` |
| `apps/stub-crm/public/index.html:286-288` | boot `src`, `data-connectome-hub`, `data-connectome-surface` |
| `apps/stub-invoicing/public/index.html:232-234` | same three |
| `apps/stub-notes/public/index.html:291-293` | same three |
| `apps/stub-crm/public/opt-out/index.html:37-39` | same three — **easy to miss** |

That last one is the trap. There are **four** boot tags across three stub apps, because
`stub-crm` carries a second page for the `Permissions-Policy: tools=()` opt-out fixture. A
substitution sweep that globs `apps/*/public/index.html` silently misses it, and the miss
only shows up as a broken opt-out demo — which is Gate E evidence.

**Severity: blocker.** The story cannot be submitted as a live demo without this.

#### G3 — `llm-mapper.js` is documented but does not exist, and two files disagree about whether it may

`hub/mapper/wrangler.jsonc:17-19` describes the file in the present tense:

> *"Uncommenting this is the whole 'swap in an LLM' change: src/llm-mapper.js already speaks
> the same interface as the static mapper and returns null until `env.AI` exists."*

`ls hub/mapper/src/` returns `index.js` and `static-mapper.js`. **The file has never
existed.** A reader who trusts the config comment will uncomment the `ai` binding, deploy,
and get a module-resolution failure.

Worse, the two files give opposite instructions. `hub/mapper/src/index.js:8`:

> *"Do not import a model runtime. Do not write src/llm-mapper.js here."*

Read together, the tree says both "it is already written" and "do not write it". Only one
seam is real, and it is the good one — `hub/mapper/src/static-mapper.js:39-40` already
exports the swappable signature:

```js
/** Same interface as llm-mapper.js, so the two are swappable at the call site. */
export async function map(request, _env) {
```

The `_env` parameter is unused by the static mapper and exists purely so the LLM mapper can
drop into the same call site. The design is right; the file and the comments are wrong.

**Severity: blocker** — for a competition submission where a judge reads the config.
Documentation that describes non-existent code is worse than no documentation.

**Fix shape:** write `hub/mapper/src/llm-mapper.js` with `map(request, env)`, `assertNoValues`
before any `env.AI.run()`, `null` when `env.AI` is absent, and static as the fallback on
absent binding / model error / invalid output. Correct the `index.js:8` docblock. The
§9 Appendix precondition ("after `assertNoValues` is CI-enforced") is already satisfied.

---

### S2 — Hardening. Correct on localhost, unsafe on a public URL.

#### G4 — `fetchManifest()` has no timeout and no body cap · `hub/gateway/src/index.js:207-233`

```js
res = await fetch(new URL("/.well-known/connectome.json", origin), { redirect: "error" });
```

Reached from `POST /api/declare` with a user-supplied origin. The good parts are already
there and should be preserved: the origin is parsed and re-serialised (`:209-213`), the
protocol is constrained to `http(s)` (`:214`), redirects are refused (`:219`), and no
credentials are sent. What is missing:

- **No `AbortSignal.timeout()`.** A hostile origin that accepts the connection and never
  responds pins a Worker invocation until the platform kills it.
- **No response size cap.** `res.json()` at `:236` will parse whatever arrives.
- **No cache.** Every declare is a live outbound fetch.

**Severity: high** once the gateway is public and anyone can post an origin to it.

**Fix shape:** `AbortSignal.timeout()`, a byte cap before parse, and a short-TTL KV cache
keyed by origin. KV read/write here is request-scoped — it happens because the user typed an
origin and pressed Add.

#### G5 — The `audit` table grows without bound · `hub/gateway/src/hub-do.js:531-540`

```js
#audit(kind, edge, outcome, bytes = 0) {
  this.sql.exec(
    "INSERT INTO audit (at,kind,edge,outcome,bytes) VALUES (?,?,?,?,?)", ...
```

Insert-only. Nothing deletes. `recentAudit()` at `:542` caps the *read* at 100 rows, which
hides the growth — the table itself keeps every relay, grant, revoke, pause and declare for
the lifetime of the Durable Object. `#audit` is called on the hot path of the blind relay
(`:443`), so a busy session writes a row per forwarded envelope.

The obvious fix is the forbidden one. A DO `alarm()` that prunes on a schedule is exactly
what `ci/distortion-tests.mjs` bans (`hubDoBans()`), and correctly so.

**Severity: medium.** Unbounded storage growth per user; no correctness impact.

**Fix shape:** prune inline inside `#audit()` — delete rows below a rolling id watermark on
insert. Request-scoped, no scheduler, no ban weakened.

#### G6 — No rate limiting on any door · `hub/gateway/src/index.js`, `hub/mapper/src/index.js`

`/hub` (WebSocket upgrade), `/api/*`, and the mapper's `/map` are all unmetered. On
localhost behind a four-origin allowlist this is fine. On a public hostname, `/map` becomes
a free compute endpoint the moment Workers AI is bound behind it (G3's fix), and `/api/pair`
(G1's fix) becomes a free id-minting endpoint.

**Severity: medium**, rising to **high** the moment either G1 or G3 lands.

**Fix shape:** Rate Limiting binding, keyed by connectome id rather than IP so a shared NAT
does not throttle a whole office. Rejections must return a **named refusal** the surface can
render — `hub/mapper/src/static-mapper.js:69-78` already establishes that pattern ("we had
nothing" vs "we quietly guessed"). A silent drop or a `DEGRADED` status would trip §10's
*"Skip failed writes / `DEGRADED` | Unsafe on mutation | Stop. Show what ran."*

---

### S3 — Test coverage.

#### G7 — CI runs no runtime tests · `.github/workflows/check.yml`, `connectome/package.json:16`

`"check": "node ci/distortion-tests.mjs && node ci/provide-context.mjs"`.

`ci/distortion-tests.mjs` is a static source scanner — it greps for banned strings and
required patterns. It is genuinely good at what it does (66 assertions, and the
`scannerCatchesRejectedDoors()` self-test at the top verifies the scanner itself still
catches all four forbidden bindings). But it never executes a Worker.

Real runtime assertions exist in `scripts/t1-check.mjs` — the join door returning 403 on an
unlisted Origin, Origin-bound identity surviving a spoofed `HELLO`, spoke-to-spoke `SEALED`
being refused. **None of them run in CI**, because the script requires a live six-process
mesh from `pnpm dev`.

So the strongest security properties in the system are verified by a script nobody runs
automatically, and by manually-captured PNGs in `gates/`.

**Severity: high** for a submission judged on engineering rigour.

**Fix shape:** `@cloudflare/vitest-pool-workers`. `runInDurableObject` covers the HubDO
grant lifecycle, `forget()` dropping dangling grants, `paused` gating, the surface↔spoke
relay rules, and — importantly — that identity still comes from `ctx.getTags()` after
hibernation. Port `t1-check.mjs`'s assertions in so they run without a mesh.

#### G8 — The mapper guard checks presence, not order · `ci/distortion-tests.mjs:304-307`

```js
function assertMapperGuard() {
  const src = read(join(ROOT, "hub/mapper/src/index.js"));
  assert(/assertNoValues\s*\(/.test(src), "mapper Worker calls assertNoValues");
}
```

This asserts the string appears in one file. Today that is sufficient, because there is only
one code path and no model. Once `llm-mapper.js` exists and `env.AI` is bound, this test
passes unchanged for an implementation that calls `env.AI.run()` **before** `assertNoValues`
— which is precisely the egress the guard exists to prevent.

The guard also does not look at `llm-mapper.js` at all, since it only reads `index.js`.

**Severity: medium now, high the moment G3 lands.** This is a guard that will silently stop
guarding.

**Fix shape:** assert ordering within each mapper source file — no `env.AI` reference may
precede `assertNoValues` — and extend the read to cover `llm-mapper.js`.

---

### S4 — Observability.

#### G9 — Observability is enabled but nothing is measured · `hub/mapper/wrangler.jsonc:6-11`, `hub/gateway/wrangler.jsonc:6`

Both Workers set `"observability": { "enabled": true }`, which gives Workers Logs. Neither
emits a custom metric. The mapper's config names the metric it does not produce:

> *"Per-edge match and refusal rates are the honest metrics for a consent product
> (GrokVisionResponse.md §4.5). Nothing logged here can contain a field value, because none
> ever arrives."*

`../GrokVisionResponse.md:272` assigns this to Analytics Engine.

**Severity: low** functionally, **high** for a submission — a consent product that cannot
show its refusal rate cannot evidence its central claim.

**Fix shape:** `writeDataPoint()` from `HubDO.#audit()`, which already receives exactly the
right arguments (`kind`, `edge`, `outcome`, `bytes`) and already carries the
"Metadata only. Never args, never results." contract at `hub-do.js:530`. Blobs must carry a
**hashed** edge, not the raw `source→target` origin pair, and never a field name.

---

### S5 — Deploy safety and migration hazards.

#### G10 — The hostile stub is a deployable workspace package · `apps/hostile-stub/`

`apps/hostile-stub/` has a valid `package.json` and a valid `wrangler.jsonc` (`"name":
"hostile-stub"`), and `pnpm-workspace.yaml` includes `apps/*`. A deploy script written as
`pnpm run -r deploy` will publish the attacker fixture to the internet alongside the product.

Its own config is explicit that this must not happen — *"Gate B anti-spoof check only. Not a
product member. Not on the hub allowlist. Must never load the bridge."*

**Severity: medium**, and entirely avoidable if noticed before the deploy script is written
rather than after.

**Fix shape:** enumerate deploy targets explicitly. Do not use a recursive glob. The hostile
stub stays local-only and off every allowlist — `ci/distortion-tests.mjs:276` and `:332`
already assert `:8793` is absent, and those assertions must survive the env-driven rewrite.

#### G11 — `assertOrigins()` pins literal ports and will break under env-driven config · `ci/distortion-tests.mjs:263-280`

```js
assert(origins.includes("http://localhost:8790"), "surface origin is :8790");
assert(origins.includes("http://localhost:8787"), "CRM origin is :8787");
...
assert(/SURFACE_ORIGIN\s*=\s*"http:\/\/localhost:8790"/.test(origins), ...);
assert(surface.includes("http://localhost:8791"), "surface talks to gateway :8791");
```

Six assertions read `origins.js` and `config.js` as **text** and require literal localhost
strings. G2's fix removes those literals. The test will go red, and the tempting response —
deleting the assertions — would remove the check that the hostile origin stays off the
allowlist (`:276`).

**Severity: medium.** Flagged as a migration hazard, not a defect: the test is correct today.

**Fix shape:** rewrite to assert the *invariant* rather than the value — the allowlist is
env-sourced, `:8793` never appears, the extension origin is `/api/*`-only, and the surface
iframe still mounts from the hub URL with `allow=""`. Net assertion count must not drop.

#### G12 — `wranglerBans()` does not yet see nested environment blocks · `ci/distortion-tests.mjs:104-113`

`wranglerBans()` strips comments then regex-matches `"browser":`, `"queues":`,
`"workflows":`, `triggers.crons` against the whole file, so it will still match inside an
`env.production` block. Verified by reading, **not** by test — there is no fixture with a
nested block, because no config has one yet.

**Severity: low** (currently correct), but it is the single test standing between the tree
and a banned binding smuggled into a production-only block. It deserves a fixture the moment
G2 introduces `env.*`.

#### G13 — `pnpm check` crashes on Node 20 · `ci/provide-context.mjs:30-38`

`freshDocument()` stubs `self`, `isSecureContext` and `location`, but assumes
`globalThis.navigator` already exists — it only attempts to *delete a property from* it:

```js
try {
  delete globalThis.navigator.modelContextTesting;
} catch {
  /* navigator is a host getter; modelContextTesting may already be absent */
}
```

`navigator` became a Node global in v21. On Node 20 the `TypeError` is swallowed by that
`catch`, and the run then dies further in with
`ReferenceError: navigator is not defined` at `packages/bridge/webmcp-polyfill.js:165`.

Reproduced during this review:

```
$ node --version && node ci/distortion-tests.mjs | tail -1 && node ci/provide-context.mjs
v20.20.2
66 passed, 0 failed
  ok  polyfill installs on a document with no native API
ReferenceError: navigator is not defined
```

CI is green because `.github/workflows/check.yml:20` pins `node-version: "22"`. **This is a
portability gap, not a defect** — but Node 20 is still in LTS maintenance, and the failure
lands in the *second* of the two scripts `pnpm check` chains, immediately after the first
prints `66 passed, 0 failed`. A judge or contributor on Node 20 sees a stack trace as the
output of the project's headline command.

**Severity: low**, but disproportionately expensive for a competition submission: the
reviewer's first command should not crash.

**Fix shape:** stub `globalThis.navigator` in `freshDocument()` alongside the other globals,
or declare the floor with an `engines` field in `package.json`. One line either way.

---

## Part 2 — Cloudflare-nativity audit

The question AIL-24 asks is "verify the crucial aspect of total cloudflare-nativity". The
honest answer has three parts: what is used, what is admissible and not yet used, and what
is permanently rejected — with the rejection grounded in a quotable clause.

`../GrokVisionResponse.md:252` sets the target: *"~95% Cloudflare-native by code, and 100% of
everything that is actually the product."*

### Currently used

| Product | Where | Notes |
|---|---|---|
| **Workers** | `hub/gateway`, `hub/mapper` (`src/index.js`) | Two request-handling Workers. No Node APIs, no external SaaS calls. |
| **Workers Static Assets** | `hub/surface`, `apps/stub-{crm,invoicing,notes}`, `apps/hostile-stub` | `assets.directory` + SPA fallback. A spoke runs no connectome code of its own. |
| **Durable Objects** | `HubDO`, `hub/gateway/wrangler.jsonc:12-15` | One per user. The graph. |
| **DO SQLite storage** | `hub-do.js:41`, `migrations: [{ tag: "v1", new_sqlite_classes: ["HubDO"] }]` | Five tables: `members`, `grants`, `audit`, `settings`, `forgotten`. |
| **WebSocket Hibernation** | `hub-do.js:382` `ctx.acceptWebSocket(server, [sessionId, origin, role, host])` | Identity lives in **tags**, deliberately, so a wake cannot re-bind identity from the client. This is the correct and non-obvious use of the API. |
| **Workers Logs / observability** | `hub/gateway/wrangler.jsonc:6`, `hub/mapper/wrangler.jsonc:6-11` | Enabled; no custom metrics — see **G9**. |

### Admissible and planned by this story

Each is request-scoped: it runs because the user acted, inside the request that action
caused. None can fire unattended.

| Product | Purpose | Sanction |
|---|---|---|
| **Turnstile** | Pair a connectome id to a human before the DO is addressable (**G1**) | `../GrokVisionResponse.md:271` — *"So a leaked DO id cannot be joined to someone's graph."* `../GrokBalanceWork.md:719` — *"Before any non-localhost deploy."* |
| **Workers AI** | `llm-mapper.js` field-correspondence proposals (**G3**) | `../GrokBalanceWork.md:715` — legal once `assertNoValues` is CI-enforced. It is. |
| **AI Gateway** | Caching, rate limits and logs in front of the model | `hub/mapper/wrangler.jsonc:26`; `../GrokVisionResponse.md:267` — the hub keeps knowing only an HTTPS endpoint, satisfying §3.2 structurally. |
| **KV** | Short-TTL cache of `/.well-known/connectome.json` (**G4**) | Read-through on a user-initiated declare. No background refresh. |
| **Analytics Engine** | Per-edge match and refusal rates (**G9**) | `../GrokVisionResponse.md:272`. Metadata only — hashed edge, outcome, byte count. Never a field name, never a value. |
| **Rate Limiting** | `/api/*`, `/hub`, `/map` (**G6**) | Anti-abuse on a public hostname. |
| **Cloudflare Access** | Alternative to Turnstile for the pairing gate | Named alongside Turnstile at `hub/gateway/src/index.js:117`. |

### Admissible but out of scope for AIL-24

| Product | Why not now |
|---|---|
| **Vectorize** | `../GrokBalanceWork.md:721` permits capability search *"After the directory is real (T3)"*, and requires it be *"Search-shaped, not chat-shaped"* — §10 rejects *"Injected **chat agent** as the product"*. Deferred: it needs its own design pass to stay search-shaped. |
| **D1 / R2 / Hyperdrive** | No use. DO SQLite holds all state; there are no files; there is no external database. Adding them to raise a "products used" count would be nativity theatre. |

### Permanently rejected

The §10 filter is mechanical:

> **Request-scoped is admissible. Deferred execution is not.**
> If it can run when the user is not there, it has taken the user out of the connector role,
> and §1.1 no longer describes what was built.

| Product | §10 clause, verbatim | Reading |
|---|---|---|
| **Browser Rendering** | *"Cloud headless + cookie copy as “the real connectome” \| Different system (RPA/iPaaS) \| At most a later transport behind this surface"* | A cloud headless browser is a robot logging in as you, not your own session. §9 names *"Cloudflare Browser Rendering"* in the explicit non-gate list. Tools run in the user's own tab, in the user's own session, or not at all. |
| **Cron Triggers** | *"Unattended templates / overnight / laptop-closed as the goal \| User is no longer the connector \| Exact confirm; other product if ever"* | A cron makes the hub act with nobody present. §6.2: *"Unattended overnight runs... are **another product**."* |
| **Queues** | same row | Exists to run work later, unattended. Same reason. |
| **Workflows** | same row | Exists to run work later, unattended. Same reason. |
| **DO Alarms** | same row | The in-DO form of the same thing. `hub-do.js:16-19` states it directly: *"The moment this object can act on its own, the user has stopped being the connector."* This is why **G5** must prune inline. |

All five are enforced, not merely documented: `wranglerBans()` and `hubDoBans()` in
`ci/distortion-tests.mjs:105-120`, plus `scannerCatchesRejectedDoors()` which tests the
scanner itself. `hub/gateway/wrangler.jsonc:17-29` explains why the absence is a test:

> *"Each of these is one line away. That is exactly why the absence is a test and not a
> comment."*

**These bans must get stronger under AIL-24, never weaker.** If a proposed enhancement needs
one of them, the enhancement is rejected — not the ban.

### Nativity verdict

**The stack is Cloudflare-native for 100% of what runs on a server.** Every server-side line
executes on Workers or in a Durable Object. There is no Node runtime, no container, no
third-party SaaS dependency, no external database.

Two deliberate ceilings, and both are features:

1. **The Chrome extension (Transport 2, `extension/`) is not Cloudflare and must not
   become so.** §1.3 requires that *any* app can join, including origins not behind
   Cloudflare. Edge injection reaches only participating origins; the extension reaches the
   rest. Removing it to raise the nativity percentage would fail §8 test 4 (heterogeneity).

2. **Cloudflare-native must not become Cloudflare-required.** `../GrokVisionResponse.md:324`
   names this failure mode explicitly — the graph is mirrored locally so the product
   *"degrades to fully local operation with no Cloudflare dependency"*. Gate E proved it:
   `gates/gate-e/09-edge-hub-unavailable.png` and `08-local-first.png`. The bindings added by
   AIL-24 must preserve this. Specifically: a KV miss, an Analytics Engine failure, or an
   absent `env.AI` must all degrade rather than fail — which is why **G3**'s fallback to
   `static-mapper.js` is a nativity requirement and not just robustness.

So "total cloudflare-nativity" is already true in the only sense that survives §8, and the
remaining work is breadth of products used, not depth of platform coupling. Adding coupling
that makes the product unusable when Cloudflare is unreachable would *lower* the score
against the vision while raising it against a naive checklist.

---

## Part 3 — What is deliberately absent and must stay absent

Recorded so a future reviewer does not "fix" a decision.

| Looks like a gap | Why it is not |
|---|---|
| Gateway serves the bridge with `access-control-allow-origin: *` (`index.js:59`) | The bridge is public JS with no credentials and no secrets, loaded cross-origin by every spoke exactly as an edge-injected script would be. The comment at `:57-58` says `*` is *"correct rather than lazy"*. Agreed. |
| The synonym table in `static-mapper.js:30-37` | A per-edge convenience, not an ontology. Its own comment says that if it *"ever grows a governance process, an owner, or a version number, it has become the rejected product and should be deleted instead."* §10 rejects *"Canonical Business Objects as the language of join"*. Do not extend it. |
| Grants do not authorise writes | `hub-do.js:285-289` — a grant authorises the hub to *propose* an edge. Every write still confirms exact JSON. §10 rejects *Global “allow this agent”*. |
| The surface never uses `window.parent` | Routing through App A's window would let A impersonate the hub and harvest approvals. `hub/surface/public/config.js:9-14` explains it; `banSurfaceParent()` enforces it. |
| `pickLoneType` refuses to guess required fields (`static-mapper.js:131-137`) | A wrong guess on a required field is where a bad write comes from. Reporting `unmapped` with a human-readable reason is §8 test 6 working as intended. |
| Manual gate evidence (PNGs + `results.json`) | These capture things automation cannot — chiefly Gate B's anti-spoof check, "can a human tell the real surface from a forged one". **G7** adds runtime tests *alongside* this evidence; it does not replace it. |

---

## Part 4 — Gap-to-subtask map

| Gap | Severity | Subtask |
|---|---|---|
| G2 (hardcoded origins), G12 (nested-block bans), G11 (assertOrigins) | Blocker / low / medium | Env-driven origin and URL configuration |
| G1 (unauthenticated `hub()`) | **Blocker** | Turnstile-gated pairing |
| G3 (missing `llm-mapper.js`, contradictory docs), G8 (guard checks presence not order) | **Blocker** / medium | Workers AI mapper |
| G4 (`fetchManifest`), G5 (`audit` growth), G6 (rate limiting), G9 (Analytics Engine) | High / medium / medium / low | KV, Rate Limiting, Analytics Engine |
| G7 (no runtime tests in CI), G13 (`pnpm check` on Node 20) | High / low | `vitest-pool-workers` suite |
| G2 (routes, deploy script), G10 (hostile stub deployable) | Blocker / medium | Production deploy pipeline |

Ordering note: the env-driven config work must land first. It changes the `origins.js`
function signatures every other slice calls, and it is what forces the **G11** rewrite.
