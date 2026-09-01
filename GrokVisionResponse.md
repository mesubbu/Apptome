# Response to `GrokVision.md`

Review, gaps, questions, enhancements, and a build proposal.

This file does not compete with `GrokVision.md`. §1 and §8 of that file are accepted as product law. Everything here either (a) corrects a **fact** that has changed since it was written, (b) names a **hole** that will stop Gate B/C/D from being buildable as written, or (c) proposes a **mechanism** that serves §1 better than the one currently named.

Where this file and `GrokVision.md` disagree on *intent*, `GrokVision.md` wins.

---

## 0. Verdict first

The vision is sound and unusually well-defended. The distortion tests in §8 are the best thing in the repo — they are executable, not aspirational. Three things are genuinely right and rare:

1. **Locus as the product.** "The user stays in A" is the whole differentiator. Every competing framing (agent shell, iPaaS, cockpit) collapses without it.
2. **Join = tool registration, nothing more.** Refusing the ontology is what makes this a fabric instead of a catalog. `oldDocs/connectome-build-plan.md` and `oldDocs/connectome-expansion.md` both lost this, exactly as §8 says.
3. **Presence is transport, not product** (§7). This is the load-bearing abstraction and it is *more* powerful than the file realizes. See §4 below — it is the reason a Cloudflare-native hub is admissible at all.

Two things are wrong or missing badly enough to block building:

- **§6.4 and §3.5 are factually stale.** The WebMCP draft moved under this document. See §1.
- **The graph — declared "the product" in §3.4 — has no defined way to become non-empty.** See §2, Gap 2. This is the single biggest hole. Gate B passes without noticing it; Gate C and E cannot.

And one thing needs an explicit decision rather than a silence: **whether app payloads may leave the device.** The file never says, and the answer determines whether Cloudflare can be in the data path at all. See §2, Gap 6, and §5, Q2.

---

## 1. Factual corrections — the spec moved

`GrokVision.md` states WebMCP facts as of ~mid-August 2026. The Community Group draft has since been revised (19 August 2026 and 26 August 2026 drafts). Three claims in the file are now wrong. None of them break §1; all of them change §3.5, §4.1 and §6.4.

| Where | What the file says | What is now true | Consequence |
|---|---|---|---|
| §3.5, §6.4 | "WebMCP does not give cross-tab `executeTool` (open spec issue)"; "Native `getTools` / `executeTool` see the same tab frame tree only" | `getTools()` and `executeTool()` are now **normative members of the `ModelContext` interface**. Each returned `RegisteredTool` carries `name`, `description`, `inputSchema`, **`origin`**, and **owner `window`**. Still frame-tree scoped, not cross-tab. | The *cross-tab* claim survives. The "not in the spec / private Chrome testing surface" framing does not. Invocation is now a first-class, browser-mediated call — which means the hub should use it rather than a page-side wrapper (`Master1.md` §1.5 step 3 offers both; prefer the real API now). |
| §6.4 | "Cross-origin sharing only via `exposedTo` + `fromOrigins` + `allow="tools"` on iframes — that is **not** the connectome path." | `exposedTo` + Permissions-Policy `tools` is now a **real, normative cross-origin permission model**, with a `toolchange` event delivered to granted origins. `fromOrigins` is not the current spelling. | Correct that it is not the *cross-tab* path. Wrong to dismiss it: `exposedTo` is precisely the sanctioned mechanism for §5.2's hosted slot, and it is the mechanism that makes an **edge-injected, extension-free hub** legitimate rather than a hack. See §4. |
| §4.1, §1.4 | "`document.modelContext`… Chrome origin trial / flag" | Correct, and worth pinning: origin trial **Chrome 149 → 156**. `navigator.modelContext` was deprecated in Chrome 150 and is **absent from the 19 Aug draft entirely**. Draft Community Group Report, latest 26 Aug 2026. Repo carries 100+ open issues. | The status language in §4.1 is right and should be kept verbatim. Add the trial window as an explicit **expiry risk** (see Gap 9). Drop any `navigator.modelContext` fallback except for Chrome 149. |

Two additions the file does not mention and should:

- **`navigator.modelContextTesting`** exposes `getTools()`, `provideContext()`, `clearContext()`. `provideContext` replaces the whole tool set **atomically**. This is the correct harness for automated Gate A–D tests — it removes the intermediate state that a `unregisterTool`/`registerTool` loop exposes. Free test infrastructure; use it.
- **Cloudflare shipped a WebMCP developer preview on 6 August 2026** ("Give any website a WebMCP interface"). It edge-injects a bridge at `/.webmcp/bridge.js`, served from a Worker, into any site behind Cloudflare, registering tool packs via `document.modelContext.registerTool` with **no origin code change**. Shopify enabled WebMCP across Liquid storefronts the same month.

That last item is not trivia. It is the most important unexploited fact in this repo, and §4 is about why.

---

## 2. Gaps

Ordered by how hard they block the gates.

### Gap 1 — Blocks nothing, but must be fixed in the text
Spec drift, above. §3.5 and §6.4 need rewording. Low effort, high cost if left: an implementer following §6.4 literally will avoid the one mechanism that makes the extension optional.

### Gap 2 — **Blocks Gate C and Gate E. The big one.**
§3.4 declares the persisted graph "the product", and §1.2 requires that from inside A the user can **see B by name** — pointedly "whether or not that tab is focused" (§3.4). But §4.1 defines join as registering *page* tools, which are only observable while the page is open, with the hub installed, on a WebMCP-capable browser.

Therefore the graph can only ever contain **apps the user has already personally visited while the hub was running.** Consequences the file never addresses:

- **First run shows an empty surface.** The user installs the hub, opens their CRM, opens the surface, and sees zero other members. The product's entire promise is invisible until the user has independently visited a second member. There is no onboarding path.
- Gate B hides this (the stranger is instructed to open both stubs first). Gate C hides it too. **Gate E is where it detonates** — "persist origin → last-seen tools" presupposes a seen-tools event that may never have happened.
- "Membership" is conflated with "has been observed". An app that opted in six months ago and has never been opened is, per §1.4, already a member — but the hub has no record of it.

**What's missing:** a *membership record* distinct from an observation. Minimum shape: `{ origin, appName, icon, capabilities[], launchUrl, firstSeen, lastSeen, source }` where `source ∈ { observed, declared, imported }`. And a way for an origin to be **declared** without being open.

**Cheapest fix consistent with §4.1–§4.3:** a static, optional, well-known document served by the origin — see Enhancement E2. It is not an SDK, not an ontology, not a registry we curate. Absence of it still joins (§4.2's rule preserved).

### Gap 3 — **Blocks Gate B's done-when #4, and is a phishing vector.**
§1.2(1) requires B to appear as a **named member** — "not as an anonymous tool". §2.4's screenshot test asks whether the user can "point at another app, **by name**". But **the join contract in §4.1 has no app-name field.** Tools have names; apps do not. §4.2's optional declarations list launch URL, risk hints, embeddable view, deep link, compensating action — **no name, no icon, no identity.**

So the hub must invent the display name. Every available source is bad:

| Source | Failure |
|---|---|
| Origin / hostname | `app-7.internal.acme-cloud.net` is not "Invoicing". Defeats §1.2(1). |
| `document.title` | Route-dependent. "River North Studio — Clients" is not the app's name. Changes under the user. |
| Tool description text | §6.2: **untrusted**. Rendering it as an app identity is exactly the injection §6.3 warns about. |
| A name we assign | §4.3: "We do not admit it by ontology review." A name table is a vendor catalog by another route. |

Worse, in the **reverse** direction: if the app supplies its own name and the hub renders it trustingly, App A can register a tool declaring itself "Invoicing" and appear in the directory *inside* App B. The user then approves a write to a spoofed member. §6.3's mitigations (typed preview, hub-origin surface, per-edge consent) do not catch this, because the payload is genuine and the consent is genuine — only the *identity* is forged.

**What's missing:** app identity as a first-class, **origin-bound** field. The name must be displayed with the origin, always, and the origin is the only trusted key. "Invoicing" is a label; `https://invoicing.example` is the identity. The surface must never show the label without the origin.

### Gap 4 — Blocks nothing in v0; unacceptable in v1.
§3.3 ends with "It must not spoof A, and A must not spoof it." No mechanism is given, and none exists in the design. A hostile App A renders a pixel-perfect fake surface in its own DOM: fake member list, fake confirm card, harvested approval gestures, and a payload that says one thing while A does another. The real surface's cross-origin isolation protects the *real* surface's contents — it does nothing to prove to the user *which* surface is real.

The vision's own primary UX makes this worse than usual, because the surface is *supposed* to look like it belongs in A's window.

**Options** (a decision is needed, "v0 accepts the risk" is a legitimate answer if written down):
- Anchor the surface to browser chrome the page cannot paint over (side-panel edge, toolbar-anchored popover). Weakens "inside A's window".
- Per-session visual secret chosen by the user at hub install, rendered in the surface header. Cheap, well-understood, and page JS cannot learn it.
- Require an explicit hub-initiated gesture (toolbar click / keyboard shortcut) to open the surface, never a page-triggered one — so a page-painted fake cannot be reached by the muscle memory the real one trains.

Gate B's done-when list does not test this. It should get a check: *"Repeat with a hostile stub that paints a fake surface → the user can tell."*

### Gap 5 — Two consent mechanisms, no state model.
§6.1: consent is **per edge** (`A.tool → B.tool`), not global. §6.2: **every write confirms exact JSON**, always. §6.2 also forbids "remember this mapping that auto-writes next time".

If every write confirms unconditionally, **what does per-edge consent add?** As written, nothing — the per-write confirm subsumes it. Which means either (a) per-edge consent is dead weight, or (b) it has a lifetime the file never states.

**What's missing:** an edge-grant state model. Minimum:

```
EdgeGrant = {
  source: { origin, tool },
  target: { origin, tool },
  scope:  "once" | "session" | "until-revoked",
  granted: timestamp,
  revoked: timestamp | null
}
```

…plus the rule that binds it to §6.2: **an edge grant authorizes the hub to *propose* this edge; it never authorizes a write.** Writes always confirm. Then per-edge consent has a real job (it gates which edges appear at all, and which reads may run — see Gap 6) and it does not contradict §6.2.

And: **no revocation UI is specified anywhere.** See Gap 10.

### Gap 6 — **The sharpest gap. Blocks any decision about Cloudflare.**
§6.2: "**Reads** may run after user intent (surface opened, job started)."

Read literally, *opening the surface* authorizes the hub to invoke **every read tool App A has registered**. Problems:

- Read tools are not uniformly cheap or harmless. `get-open-client` is one record. `list-clients` (offered as optional in `Master1.md` §7.5) is **the entire customer table**. `readOnlyHint: true` says nothing about volume or sensitivity.
- Reads can be rate-limited, billable, or side-effectful in ways the app never declared (audit-log entries, "last viewed" mutations, webhook triggers).
- **And the results land in the hub.** The file never says where the hub may take them. If the `Mapper` is anything other than local — and §3.2 explicitly anticipates "LLM optional later", §4.4 "an LLM mapper behind the same interface" — then read payloads leave the device the moment a job starts, with no user-visible moment of consent, because the *write* confirm is the only confirm in the design and it happens **after** the data has already travelled.

This is a real data-egress hole in a document that is otherwise rigorous about consent. It is invisible in v0 because the default mapper is static and local. It opens silently the day the mapper becomes an HTTP call.

**What's missing, minimum:**
1. Reads are **selected**, not blanket. The surface names which read tool it is about to run, and why. "Surface opened" authorizes *discovery* (`getTools`), not *invocation*.
2. An explicit, written rule on **egress**: may a source payload leave the browser? If yes, under what visible consent?
3. A read confirm for anything not annotated as trivially scoped — or a `Mapper` contract that receives a **schema and a redacted shape**, not the values, for the proposal step.

Item 3 is worth dwelling on: a mapper that proposes *field correspondences* rather than *values* can run remotely on schemas alone, then the mapping is applied locally to the real data. That gives you a cloud LLM mapper with **zero payload egress**. This is a genuine design improvement and it is what makes a Cloudflare mapper compatible with §6.

### Gap 7 — Blocks nothing; costs a rewrite later.
§7.2 says "fail clearly" in three places and never enumerates the failures. The surface needs a closed set, because each one has different copy and a different user action. `oldDocs/connectome-build-plan.md` already had a usable list and it is **not** the rejected ontology — it is an error taxonomy:

`APP_UNAVAILABLE`, `TOOL_NOT_FOUND`, `CONSENT_REQUIRED`, `CONSENT_DENIED`, `SCHEMA_INVALID`, `TOOL_FAILED`, `AUTH_REQUIRED`, `PERMISSION_BLOCKED` (Permissions-Policy `tools=()` / `NotAllowedError`), `HUB_UNAVAILABLE`.

Keep the codes, discard that document's policy engine, budgets and templates. Note `PERMISSION_BLOCKED` is new and mandatory: per the current draft, `registerTool()` rejects with `NotAllowedError` when the `tools` permission is disabled — a spoke can be silently non-joinable because of a header its ops team set, and the surface must say so.

### Gap 8 — Gate D may be unpassable as sequenced.
Gate D demands a third app whose objects resemble nothing, **plus** "one confirmed edge from it to one of the others… with a mapper that does not invent a shared business object."

But if the objects genuinely do not correspond, a static mapper has nothing to map. The file defers the LLM mapper (§3.2 "LLM optional later"; §9 Gate E doesn't introduce it either). So Gate D either:
- forces the mapper ladder to climb earlier than §9 implies, or
- is satisfied by a **hand-written per-edge adapter** for that one pair — which §4.4 explicitly permits ("v0/Gate A–B: a static mapper for the one proof edge is enough").

The second is fine and is almost certainly the intent, but Gate D's wording ("a mapper that does not invent a shared business object") reads as a constraint on *generality* that a hand-written adapter trivially satisfies while proving nothing. **Gate D needs a sharper done-when**: the third app's edge should be one where the *hand-written* adapter is obviously not generalizable, so that the gate proves **join heterogeneity** (D's real subject) rather than mapping intelligence (not D's subject). Suggested: prove Gate D on **visibility + one read**, and move the "unlike write edge" to its own later gate.

### Gap 9 — Dependency risk, unmitigated in writing.
The entire product requires `document.modelContext`, which is: a Community Group **draft**, in a Chrome **origin trial that ends at Chrome 156**, behind a flag otherwise, unimplemented in Firefox and Safari, with 100+ open spec issues and two already-retired API shapes (`provideContext`/`clearContext` removed March 2026; `navigator.modelContext` deprecated July 2026).

Also under-appreciated: **origin trial tokens are per-origin.** A third-party app you do not control will not carry your token. So outside the flag, the set of reachable spokes is "sites that individually enrolled in the trial" — which in practice today means *Shopify storefronts and sites behind Cloudflare*, not the CRM the demo is about.

§4.1 already allows the mitigation ("If the native API is missing, a same-API polyfill is allowed so apps do not change"). But the file treats the polyfill as a footnote when it is, for the next several quarters, **the primary path**. It should be promoted, and the polyfill needs a delivery vehicle. Cloudflare edge injection is the best one available (E1).

### Gap 10 — No exit.
Nothing in the file describes leaving. Not in §4, not in §6, not in the §11 decision log. Open questions with no answers:
- How does a user **remove a member** from their connectome? What happens to consented edges pointing at it?
- How does an **app** opt out, and how does the hub learn? (Setting `Permissions-Policy: tools=()` is the app's unilateral lever — the hub should treat `PERMISSION_BLOCKED` as a soft de-membership signal, not an error to retry.)
- Is there a **kill switch** — "pause my whole connectome"? For a confused-deputy design (§6.1) with the user's live sessions in every spoke, this is close to mandatory.
- Where do grants and the graph **live**, and can the user **export and delete** them?

Consent design without revocation design is half a consent design.

### Gap 11 — Injection path the file misses.
§6.2 correctly marks tool results as untrusted. §5.5 correctly makes "write into A" a separate consented edge. Together they create a path the file does not name: **B's untrusted output becomes the payload of a write into A, and the user approves it.** The confirm card is honest about the JSON, but the user has no way to see that `memo` originated in another app and may be adversarial.

**Fix is cheap:** the confirm card must **provenance-tag every field** — which origin each value came from, and whether it was machine-mapped or user-typed. This is a UI requirement, and it is also the single highest-value anti-injection affordance in the whole design, because it makes §6.3's "typed preview" actually informative rather than merely truthful.

---

## 3. Smaller notes

- **§1.2 floor vs. §5.1 surface contents.** §5.1 requires the surface be "rooted in **this app**: title, origin, current context from **this app's read tools**." Running A's read tools to render the surface *before any job starts* contradicts §6.2's "reads may run after user intent" unless "surface opened" counts as intent — which it does, per §6.2, which is exactly Gap 6. The two sections are consistent only under the reading that makes Gap 6 worst.
- **§3.4's table** calls the runtime cache `{ Tab ID → [tools] }`. With the current draft, the natural key is `{ origin → [RegisteredTool] }` since `getTools()` now returns `origin` per tool. Minor, but it aligns the cache with the graph and makes Gate E's "persist origin → last-seen tools" a projection rather than a translation.
- **§4.1 "Tool names: ASCII, hyphens, short"** — `Master1.md` §7.5 pins ≤30 chars. Keep the number; it is the kind of thing that drifts.
- **No versioning anywhere.** Tools change. A remembered edge (§4.4, Gate E) points at a tool whose `inputSchema` may have changed underneath. Minimum: hash the `inputSchema` into the edge grant and invalidate on change. Cheap now, painful later.
- **`untrustedContentHint`** is used in §4.1 and §6.2 but never defined as affecting rendering. Tie it to Gap 11's provenance tags: `untrustedContentHint` fields get the strongest visual marking.
- **§9 Gate B check 3** says open the surface "from the CRM page (**not as the only path**: from the side panel)". This parses two opposite ways. It should read: *the surface must be openable from the CRM page; the side panel remains available but must not be the only path.*

---

## 4. The Cloudflare question — and a real answer

You asked for 100% Cloudflare-nativity. Here is the honest position, then the way out.

### 4.1 The blunt constraint

`GrokVision.md` names the hub as "a Chrome extension (v0/v1)" and lists **Cloudflare Browser Rendering** in §9's "explicitly not a gate" and §10's rejected table ("Cloud headless + cookie copy as 'the real connectome' — different system (RPA/iPaaS)"). §11 lists Cloudflare among "adjacent stacks — not the hub."

That rejection is **correct as stated**, and for a precise reason: Browser Rendering runs Chromium *in Cloudflare's datacenter with Cloudflare's cookie jar*. It is not the user's session. Using it makes the connectome a robot that logs in as you — which fails §8 tests 1 (locus), 6 (user as connector) and 7 (surface, not engine).

So: **Cloudflare cannot be the hub by pretending to be a browser.** That door is correctly nailed shut.

### 4.2 The door that is open

But §7 of the vision says something the file does not fully cash in:

> Where is spoke B so its tool can run? — **Hub / transport.** Somewhere the hub may legally invoke.

If **presence is transport**, then *so is the hub's own plumbing*. The hub is defined by what it is **allowed to see** (more than one origin) and **where it puts the user** (still in A) — not by which process hosts it. A Chrome extension is one implementation of a privileged mediator. It is not the only one that satisfies §3.3 and §6.

Combine three current facts:

1. **Cloudflare edge-injects WebMCP** into any site behind it, from a Worker, with no origin code change (6 Aug 2026 preview, `/.webmcp/bridge.js`).
2. **`exposedTo` + `allow="tools"`** is now a normative cross-origin tool-sharing grant, with `toolchange` events to granted origins.
3. **Durable Objects** give you exactly one strongly-consistent, addressable coordination point per user, with hibernating WebSockets — i.e. a long-lived process that can hold connections from *several* of the user's tabs at once.

That yields an architecture with **no extension at all**:

```
   [ App A tab, https://crm.example ]            [ App B tab, https://invoicing.example ]
   [ A's own UI ]                                [ B's own UI ]
   [ edge-injected bridge  ]                     [ edge-injected bridge ]
   [ SURFACE iframe        ]                          │  registers A/B tools; holds WS
   [ origin: surface.connectome.dev ]                 │
          │  (cross-origin: A's JS cannot read it)    │
          └──────────── WSS ────────┐   ┌─────────────┘
                                    ▼   ▼
                   [ per-user DURABLE OBJECT — the hub ]
                     graph · edge grants · pending confirms · audit
```

Check it against the vision's own tests:

| §8 test | Verdict |
|---|---|
| 1. Locus | **Pass.** Surface is an iframe in A's window. User never leaves A. |
| 2. Named other | **Pass.** Directory comes from the graph in the DO. |
| 3. Join ticket | **Partial — the real cost.** Register tools *and* be behind Cloudflare with the pack on, or add one script tag. That is heavier than "register tools, full stop." See 4.4. |
| 4. Heterogeneity | **Pass.** Any stack, any objects. No SDK, no CBO. |
| 5. Ignorance | **Pass.** A and B never talk. Only the DO sees both. A's JS cannot read the surface iframe (cross-origin). |
| 6. User as connector | **Pass.** Confirm card unchanged, in A's window. |
| 7. Surface, not engine | **Pass** — *if* no cron, no unattended runs, no templates. The DO must be a relay and a graph, never a scheduler. This is the discipline to hold. |
| §3.3 isolation | **Pass.** Surface is a distinct origin. |
| §6.1 confused deputy | **Pass, and better.** Tools execute in B's *own tab*, in the *user's own session*. No cookie copying. Nothing like Browser Rendering. |

The one serious objection — **payloads route through Cloudflare** (Gap 6) — has a clean answer: make the DO a **blind relay**. The surface in A and the bridge in B derive a session key pair in-browser (WebCrypto); the DO relays ciphertext and sees only `{ from, to, size, timestamp }`. Cloudflare gets metadata for the audit trail and **never plaintext**. That is a stronger privacy posture than the extension design, which has no encryption at all because it never needed one.

### 4.3 Recommendation: two transports, one hub protocol

This is the answer I'd argue for, and it is the vision's own §7 applied to the hub itself:

> **Define one hub protocol. Ship two transports onto it.**
>
> - **Transport 1 — edge-injected (Cloudflare-native, no install):** bridge + surface injected at the edge for participating origins. Zero-install, huge reach, works for anything behind Cloudflare. Cannot reach a site that hasn't opted in at the edge.
> - **Transport 2 — thin extension (universal, ~200 lines):** discovers tools, invokes in the page world, relays to the same DO, hosts the same Worker-served surface in an iframe. Works on *any* origin, including ones not behind Cloudflare — which is what preserves §1.3's "any app". It is pure transport: no UI, no mapping, no policy, no graph.

Everything else — graph, edge grants, surface UI, mapper, audit, identity — is **100% Cloudflare** and shared by both transports. The extension becomes a 200-line shim you could delete the day browsers ship a native privileged agent API, without touching the product.

That gets you Cloudflare-nativity everywhere it is *achievable*, keeps §1.3's universality, and makes the extension a replaceable detail rather than the architecture. If you want a single number: this is ~95% Cloudflare-native by code, and 100% of everything that is actually the product.

### 4.4 The join-ticket cost, stated honestly

Transport 1 changes the admission ticket from "register tools" to "register tools **and** carry our bridge (one toggle if you're behind Cloudflare, one script tag otherwise)". §8 test 3 asks: *after registering tools, does the vision already hold, or must the app also take our SDK?*

A one-line script is not an SDK — no components, no schema, no build step, no ontology, and it is the *same* polyfill §4.1 already blesses. But it is not nothing, and pretending otherwise would be the exact self-deception §8 exists to prevent. **This is why Transport 2 must also ship**: with the extension present, a plain WebMCP app joins with zero touch, and §1.3 survives intact. Transport 1 is then a *distribution accelerant* for the majority case, not the definition of membership.

### 4.5 Cloudflare service mapping

| Concern | Service | Notes |
|---|---|---|
| Hub / relay / per-user coordination | **Durable Objects** (SQLite storage, hibernating WebSockets) | One DO per user. Holds graph, grants, pending confirms, live tab sessions. Strong consistency is exactly right for "one pending confirm". |
| Surface UI origin | **Worker + static assets** on its own hostname | Gives §3.3 isolation *and* ships UI updates without republishing an extension. |
| Spoke stubs (Gates A–D) | **Workers + static assets** | Two/three origins, deployed, real HTTPS — better than `localhost` because WebMCP is `SecureContext`. |
| `Mapper` | **Worker** behind **AI Gateway**, **Workers AI** default | Satisfies §3.2 "hub must not import a named runtime" *structurally*: the hub knows an HTTPS endpoint, nothing more. Schema-only mapping (Gap 6) means no payload egress. |
| Audit trail | **D1** | Append-only. Metadata only if the relay is blind. |
| Capability manifests / graph cache | **KV** | Read-heavy, edge-cached. |
| Capability search by intent | **Vectorize** (later) | "find a capability" without a chat box — a better §2.2 "power mode" than chat. |
| Pairing / anti-abuse | **Turnstile** | So a leaked DO id cannot be joined to someone's graph. |
| Observability | **Workers Logs / Analytics Engine** | Per-edge success rates, refusal rates — the honest metrics for a consent product. |
| **Not used** | Browser Rendering, Cron Triggers, Queues, Workflows | Deliberate. Each one is the door to the rejected product (§9, §10). Their absence is a *feature* and should be CI-enforced, like the old plan's `chrome.cookies` ban. |

---

## 5. Questions that need your answer before building

**Q1 — Transport.** Two transports as in §4.3, edge-injection only, or extension only? (This decides whether v0 needs an extension at all.)

**Q2 — Egress.** May source payloads leave the browser? Options: never in v0 (static local mapper); blind-relay only (DO sees ciphertext); schema-only to a remote mapper, values applied locally; or plaintext to a Worker mapper with explicit per-edge consent. Gap 6 is unresolvable without this.

**Q3 — Gate sequencing.** `GrokVision.md` §14 says implement `Master1.md` §7 (Gate A, cockpit) first, then Gate B. Do you want Gate A as a separate shipped step, or should the first increment go straight to Gate B with the cockpit reduced to a debug view? The second is less faithful to §14 but avoids building a cockpit the vision then tells you not to demo.

**Q4 — Document authority.** Should the corrections in §1 and the fixes for Gaps 2/3/5/6/10 be **merged into `GrokVision.md`** (it becomes the single source of truth again), or stay here as an addendum it references? Given §0's "wins on intent" framing, I'd merge the facts and keep the arguments here.

**Q5 — Domains.** Cloudflare-native means real hostnames. Do you have a zone to use, and an account, or should the first increment run entirely on `wrangler dev` / `*.workers.dev` with the Chrome flag?

---

## 6. Enhancements

Ranked by value to §1, not by novelty.

### E1 — Edge-injected join: "one toggle to join the connectome"
Use Cloudflare's WebMCP edge injection as the join mechanism for any site behind Cloudflare, and as the **delivery vehicle for the same-API polyfill** §4.1 already permits. This directly serves §1.4's "when an app opts in, the vision already holds for it" — and makes it true without the app writing code at all. It also mitigates Gap 9: the polyfill path stops depending on every third party enrolling in Chrome's origin trial.

### E2 — `/.well-known/connectome.json`: declared membership
A static optional document, served by the origin (a Worker line, or a file):

```json
{
  "name": "Invoicing",
  "icon": "/icon.svg",
  "launch": "https://invoicing.example/app",
  "capabilities": [
    { "name": "create-invoice", "summary": "Create a draft invoice", "write": true, "risk": "low" }
  ]
}
```

Solves **Gap 2** (graph populated before the app is ever opened), **Gap 3** (app has a name and icon, origin-bound), and delivers §4.2's optional declarations with no new API. Crucially it stays inside §4.3's rules: not an SDK, not an ontology, not a registry we curate, and **absence still joins** — a declared app is simply visible sooner. Tools remain the source of truth for what can actually be invoked; the manifest is a *poster*, never an authority.

### E3 — Schema-only mapping
The `Mapper` receives `{ sourceSchema, targetSchema, fieldNames, targetRequired }` and returns a **field correspondence map**, not values. The hub applies it locally. Result: a cloud LLM mapper with **zero payload egress**, which resolves Gap 6 without giving up §3.2's LLM ambition. Also makes mappings cacheable and reviewable, which the value-passing design never can be.

### E4 — Provenance-tagged confirm card
Every field in the confirm card is labelled with the origin it came from and how it got there (`read from crm.example` / `mapped` / `you typed`), with `untrustedContentHint` fields marked hardest. Fixes **Gap 11**, and turns §6.3's typed preview from *truthful* into *informative*. This is the highest-leverage single UI decision in the product.

### E5 — Edge-grant ledger with revocation and a kill switch
Implements Gap 5's state model and Gap 10's exit: a visible list of granted edges, each revocable; "pause my connectome"; "forget this app"; full export and delete. In a DO, this is a table and three buttons. For a confused-deputy design it is not optional, and shipping it early is much cheaper than retrofitting it.

### E6 — Local-first graph, cloud-optional
Mirror the graph and grants to local storage so the product degrades to fully local operation with no Cloudflare dependency, and the DO is the *sync + mapper + UI-delivery* tier. Protects against the failure mode where "Cloudflare-native" quietly becomes "Cloudflare-required", which would contradict the sovereignty instinct running through `Master1.md` §10 and would hand every critic §8 test 7.

### E7 — `provideContext()` test harness
Use `navigator.modelContextTesting.provideContext()` / `clearContext()` to drive Gates A–D as automated tests: atomic tool-set swaps, so scenarios can assert "invoicing closed", "tool missing", "schema changed" deterministically. Turns the gates' "a stranger can…" prose into CI. Nearly free.

### E8 — Capability search instead of a chat box
§2.2 makes chat a "power mode" but offers no alternative to it for finding things. A capability search over the graph (Vectorize, later) is a better power mode: it keeps §1.2's *named apps and capabilities* framing instead of drifting toward the agent shell §10 rejects. Worth designing for even before it is built, so the surface's information architecture is search-shaped rather than chat-shaped.

### E9 — CI-enforced distortion tests
§8 is a list of executable claims. Make it executable: forbid `chrome.cookies`, forbid Browser Rendering / Cron / Queues / Workflows bindings, forbid `<all_urls>`, forbid any scheduler in the DO, assert the surface iframe is cross-origin to every stub, assert every write path passes through the confirm. `oldDocs/connectome-build-plan.md` had the right instinct with its grep-based checks; the *rules* should be §8's, not that document's policy engine.

---

## 7. Proposed build plan

Assumes Q1 = two transports, Q2 = blind relay + schema-only mapping, Q3 = Gate A then B in one repo, Q4 = merge facts into `GrokVision.md`. **Not started until you confirm.**

```
connectome/
├─ packages/
│  ├─ protocol/          shared TS types: HubMessage, RegisteredTool, EdgeGrant,
│  │                     MembershipRecord, FailureCode, Mapper interface
│  └─ bridge/            in-page code: WebMCP polyfill + discovery + page-world
│                        invoke + WS/postMessage transport. Shipped BOTH as the
│                        edge-injected /.webmcp/bridge.js and as the extension's
│                        content script. One codebase, two transports.
├─ apps/
│  ├─ stub-crm/          Worker + assets. get-open-client, list-clients (read)
│  ├─ stub-invoicing/    Worker + assets. create-invoice (write, draft only)
│  └─ stub-notes/        Worker + assets. Gate D. Objects unlike either.
├─ hub/
│  ├─ gateway/           Worker: WS upgrade, routes to per-user DO, serves
│  │                     bridge.js, /.well-known passthrough
│  ├─ hub-do/            Durable Object: graph, edge grants, pending confirm,
│  │                     blind relay. NO scheduler. NO alarms for work.
│  ├─ surface/           Worker + assets: THE PRODUCT. Member directory,
│  │                     capability list, provenance-tagged confirm, result pane
│  └─ mapper/            Worker behind AI Gateway. Schema-only. Static fallback.
├─ extension/            Transport 2. MV3, ~200 lines, stub origins only,
│                        no UI beyond hosting the surface iframe
└─ ci/                   E9 distortion tests
```

Increments, each ending in a demoable state:

| # | Deliverable | Proves |
|---|---|---|
| 0 | Repo, protocol types, two stubs deployed, `provideContext` harness (E7), CI (E9) | Nothing yet — but the guardrails exist before the code does |
| 1 | **Gate A** via thin extension + cockpit-as-debug-view. Static mapper. One edge, exact-JSON confirm, six done-when checks from `Master1.md` §7.6 | Mediation is real. Not demoed as the product. |
| 2 | **Gate B.** Surface Worker, hub DO, surface iframe in the CRM window. Provenance-tagged confirm (E4). Failure taxonomy (Gap 7). Plus the anti-spoof check from Gap 4 | **The vision is real for one pair, one way** |
| 3 | **Gate C.** Start inside invoicing, reach the CRM. Membership records + `/.well-known/connectome.json` (E2), fixing Gaps 2 and 3 | Not a launcher |
| 4 | **Gate D.** Third unlike stub. Visibility + one read, per Gap 8's sharpened wording | Heterogeneity, join contract intact |
| 5 | **Transport 1.** Edge-injected bridge + surface, extension removed from the path. Blind-relay encryption | 100% Cloudflare-native, zero-install |
| 6 | **Gate E.** Persisted graph, consenting open-or-focus, edge-grant ledger with revocation and kill switch (E5), local-first mirror (E6) | Presence as transport, locus unchanged |

Increment 2 is the moment this stops being a proof and starts being a product. Everything before it is scaffolding; everything after it is reach.
