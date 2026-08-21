# Connectome vision

**Any opted-in app is accessible from inside any other opted-in app.**

You stay in the app you are already using. Other apps you have allowed into the connectome are reachable there — by name, by capability, without leaving. The apps may share nothing else: not a stack, not a schema, not a vendor, not a runtime. Opt-in is enough. The two apps never talk to each other. You are the one who connects them.

This file is the product. If another sketch in this repo describes a different product, it is a proof, a transport, or a distortion. It is not this.

---

## How to read this

| File | What it is for |
|---|---|
| **This file (`GrokVision.md`)** | What the connectome *is*. Product, join contract, in-app surface, consent, sequencing. Wins on intent. |
| `Master1.md` §7 | First engineering proof: mediation actually works (two origins, one confirmed write). Wins on v0 mechanics until Gate B exists. |
| `Master1.md` otherwise | Correct isolation rules, WebMCP facts, rejected technical errors. Use those. Do not use its product center (cockpit-as-v0-destination) or its adjacent stacks as the hub. |
| `Dn1.md` | Early sketch. Wrong hub (Hermes), wrong SOP language, no in-app surface. Do not implement. |
| `connectome-expansion.md` | How you might later *reach* a spoke that is not open. Transports and automation. Not the connectome. |

**Rule for implementers:** prove mediation with `Master1.md` §7 if nothing else works yet. Do not ship that cockpit and stop. The first proof that this vision holds is Gate B in §9.

---

## 1. The vision (non-negotiable)

### 1.1 One sentence

A connectome is a user-authorized graph of opted-in apps, plus a privileged hub, such that **from inside any member app the user can reach any other member app’s capabilities**, with the user still in that first app’s window, and with the user approving every write.

### 1.2 What “accessible from inside” means

The user is looking at App A. They can:

1. **See App B** as a named member of the connectome (not as a chat suggestion, not as an anonymous tool).
2. **See what App B can do** (its opted-in capabilities).
3. **Use a capability of App B** against context that already exists in App A.
4. **Approve the exact write** without switching windows to a general-purpose agent.
5. **See the result** still in App A’s window.

They do **not** have to:

- Open an extension side panel to start the job.
- Ask a helper in a blank chat box as the only door.
- Leave App A and land in App B, unless they choose a handoff.
- Wait until both apps are “the sort of app that maps to Task / Contact / Invoice.”

**Floor of the vision:** capability reach + named presence of B, inside A’s window.

**Not the floor:** pixel-perfect embedding of B’s own UI inside A. That is an optional extra B may declare. Requiring it would force an SDK and would exclude most stacks. Heterogeneity forbids that as the join ticket.

**Ceiling, later, still optional:** B declares an embeddable view or a deep link. The surface can then show B’s UI, or hand the user into B, carrying context. Neither is required to join.

### 1.3 What “any app” means

Any application that can **opt in** — expose a tool contract the hub can discover and invoke — may join. Architecture, language, framework, and function are irrelevant to admission.

Admission is not:

- Being a business SaaS.
- Implementing a canonical object (`Task`, `Deal`, `Invoice`, …).
- Shipping a Connectome SDK, overlay component, or mapping profile.
- Being a web app forever. v0/v1 spokes are web pages because WebMCP is a page contract. Other runtimes join when they can expose an equivalent contract. Do not design that here; do not write them out with an ontology.

A design tool, an IDE, a game, a medical viewer, a compiler dashboard, a CRM, and an invoicing app all join the same way: they declare capabilities. If a capability of one can be invoked with context from another, the user may connect that edge. If it cannot, the apps still **see** each other from inside each other. Visibility is part of accessibility. Useful edges come next, per pair, with the user in the loop.

### 1.4 What “opt-in” means

When an app opts in, the vision already holds for it.

Opt-in is registering capabilities with the standard tool contract (`document.modelContext` / WebMCP, or the same API polyfilled). After that:

- Every other opted-in app’s in-app surface can name this app and list its tools.
- This app’s own window gets the in-app surface, so it can name and reach the others.

The app does not implement “connected apps UI.” The app does not learn that other apps exist. The hub provides the surface. That is how heterogeneous, low-effort join stays compatible with “from inside any other.”

If opt-in required each app to build the surface, or to speak a canonical schema, the vision would only hold for apps that rebuilt themselves around us. That is a platform, not a connectome.

### 1.5 Isolation sentence (never “bypass SOP”)

> Apps stay origin-isolated. A user-authorized privileged hub is the only process that may discover tools across apps and carry data between them. The in-app surface is hub UI attached to the current window, not App A reading App B.

---

## 2. The product is a surface onto other apps, not an agent

### 2.1 Primary UX

The product screenshot is:

> User is in the CRM, on a client. A connectome surface, clearly not the CRM’s own chrome, lists other opted-in apps. Invoicing is there. “Create draft invoice” is there. The exact JSON that would be sent is there. The user approves. A draft invoice exists in the invoicing app. The user still sees the CRM.

Substitute any two opted-in apps. That is the product.

### 2.2 What the agent is

A mapper / reasoner may **propose** an edge and a payload. It is behind an interface (`Mapper`). It is not the product, not the hub, not the UX, not the fabric.

Chat with a helper is a **power mode** on the same surface, and a **workshop** in the extension cockpit. It is allowed. It is not how we describe the connectome, and not how we test that the vision holds.

### 2.3 What the cockpit is

The extension side panel is the **workshop**: discovery dump, graph inspector, first mediation proof (Gate A). Developers and power users may start a job there.

The moment the same job can only be started from the cockpit, the vision has been replaced by a browser Zapier. Gate B exists to make that failure visible.

### 2.4 Screenshot test

A proposal is this product only if a stranger, looking at a picture of the running system, can answer “yes” to:

1. Is the user still in an app they already use (not in a generic agent shell)?
2. Can they point at **another app, by name**, in that window?
3. Can they use that other app from here?
4. Did those two apps have to share a stack or a schema to make this possible?

If (1)–(3) fail, it is the cockpit or an iPaaS. If (4) is “yes, they had to,” it is a closed integration suite.

---

## 3. Architecture that serves the vision

### 3.1 Hub-and-spoke is not a contradiction

“Many apps connected together” does not mean sockets between apps. Direct app-to-app talk would puncture origin isolation, create a confused-deputy mesh, and force every pair to know each other. That excludes heterogeneity and fails security review.

The connectome **graph** is the product. The **edges are mediated**. Apps are spokes. They expose tools. They do not know other spokes exist.

```
   [ App A window ]
   [ A’s own UI  ]  [ CONNECTOME SURFACE (hub origin, in this window) ]
          │                         │
          │ WebMCP tools            │  lists B, C, … ; confirm; result
          ▼                         ▼
                 [ HUB: privileged process ]
                    │              │
                    ▼              ▼
              [ App B tools ] [ App C tools ]
```

From inside A, B is accessible **through the surface**. That is the vision with isolation intact.

### 3.2 Three layers (do not collapse them)

| Layer | What it is | Role |
|---|---|---|
| **Tool contract** | Page-level (WebMCP: `document.modelContext`) or equivalent | How an app opts in. No proprietary SDK. |
| **Hub** | Privileged process the user installs (v0/v1: Chrome extension) | Only process that sees more than one origin. Discovers, routes, holds confirm, injects the surface. Agent-agnostic. |
| **Reasoner** | Swappable `Mapper` | Proposes target args. Default: static / hand-built per edge. LLM optional later. Never imported as the hub. |

Hermes, Grok Bot, Vendo, Buzz, and any named cloud are not this architecture. A mapper implementation may later call a model. A spoke that already has a server agent may later also expose backend MCP. Neither is the connectome.

### 3.3 The in-app surface is hub UI, not App A UI

This is a security requirement, not a styling preference.

The surface is attached to App A’s **window** so the user has not left A. It is **not** App A’s document:

- Render it as hub-origin UI (`chrome-extension://…` iframe, or equivalent). App A’s JavaScript cannot read its DOM, cannot see B’s payloads, cannot forge confirms.
- The host page does not receive B’s data into its JS unless the user later approves a **write into A** (a second, explicit edge).
- The surface is visually distinct from A’s chrome (named “Connectome” or the chosen product name). It must not spoof A, and A must not spoof it.

If foreign app data is poured into A’s page, A has been given B’s records without B’s knowledge. That is not a connectome. That is a leak.

Result display lives in the surface. A may update *itself* only via its own tools, confirmed.

### 3.4 Graph vs runtime cache

| Kind | Shape | Lifetime | Role |
|---|---|---|---|
| Runtime cache | `{ Tab ID → [tools] }` | Dies with the tab | How the hub invokes *right now* |
| **Connectome graph** | `App → Capabilities → Launch / Auth / Risk` plus **consented edges** | Persists after opt-in | **The product** |

A live tab matrix is not a connectome. Tabs are how a web spoke is present for execution. The graph is what the in-app surface shows: members and capabilities, whether or not that tab is focused.

v0 may use only the cache (Gate A). The vision is the graph, visible from inside a member (Gate B onward).

### 3.5 Loop, with locus fixed

Same three steps as the mediation proof, **locus unchanged**:

1. **Discovery** — hub knows members and tools (cache now, graph as soon as it exists).
2. **Map** — `Mapper` proposes args from A’s context to B’s tool. User sees the proposal in **A’s window**.
3. **Execute** — hub invokes B in B’s own world (page world of B’s tab, in v0/v1). Result returns to the **surface in A**.

The user does not follow the execution into B. B may paint its own UI if it is open. That is B’s business. The user’s place of work is A.

Scanning tabs and invoking across origins is something the **extension** does because it is privileged. WebMCP does not give cross-tab `executeTool` (open spec issue). Do not invent `chrome.aiAgent`. Do not call `executeTool` from the extension page and expect it to reach another tab. Invoke inside each spoke’s page world.

---

## 4. Join contract — the only door

### 4.1 Minimum to join

An app opts in when it registers one or more tools on the standard contract:

- `document.modelContext.registerTool({ name, description, inputSchema, execute, annotations? })`
- `registerTool` returns a `Promise`; pass `{ signal }` to unregister.
- Callback name is `execute`, not `handler`.
- Returns small JSON-serializable data (or `type: "text"`). Not `type: "text/json"`.
- Tool names: ASCII, hyphens, short. Descriptions: what a user would ask for.
- Reads: `readOnlyHint` where true. User-sourced text: `untrustedContentHint` where appropriate.
- Writes that matter: create **drafts** until the app is ready for stronger effects. No silent send/charge as a first tool.

That is the whole admission ticket.

WebMCP status language: **Community Group Draft; Chrome origin trial / flag.** Not a W3C standard. Not a “2026 Browser Spec.” Flag: `chrome://flags/#enable-webmcp-testing`. If the native API is missing, a same-API polyfill is allowed so apps do not change.

Declarative (HTML) and imperative (JS) registration both count.

### 4.2 Optional declarations (never required)

An app **may** also declare, when the graph exists:

| Declaration | What it buys |
|---|---|
| Launch / focus URL | Hub can open-or-focus this spoke with consent, user still in A |
| Risk / write hints | Surface copy, confirm severity |
| Embeddable view URL | Optional richer “see B’s UI” inside the surface |
| Deep-link template | Optional handoff, user *chooses* to leave A |
| Compensating action | Optional undo; never assumed |

Absence of all of these: the app still joins. It is reachable when present; Gate A/B fail clearly when it is not.

### 4.3 What is not the join contract

| Not the door | Why |
|---|---|
| Canonical Business Objects / shared ontology | Admission would depend on resembling Task/Contact/Invoice. Excludes most apps. Mapping convenience is not membership. |
| First-party mapping profiles for “top 20 apps” | A vendor catalog. Fine as optional shortcuts later. Not how you join. |
| Connectome SDK / React overlay / slot component | Optional native hosting of the surface. Default path is injection by the hub. |
| OAuth / native SaaS API | A **transport** for a spoke the hub cannot see as a page. Prefer the page contract so the user’s existing session is the session. APIs do not replace opt-in. |
| Being listed in our registry by us | The app opts in by running the contract. We do not admit it by ontology review. |

### 4.4 Mapping is per-edge, not a universal language

App A’s output will rarely match App B’s input. That is expected. It is not a reason to invent a lingua franca that every member must speak.

- `Mapper.map({ sourceTool, sourcePayload, targetTool, targetSchema })` proposes `{ args, notes }`.
- The confirm card shows **those args**.
- v0/Gate A–B: a static mapper for the one proof edge is enough.
- Later: an LLM mapper behind the same interface. The hub does not import a named runtime.
- The user is the last schema check. Silent coercion is a bug, not a feature.
- Remembered mappings (later) still show the payload before a write, unless a future document explicitly designs a tighter grant. This file does not.

Shared vocabularies (including CBOs) may appear **later** as optional shortcuts for common pairs. They are never an admission ticket, never a reason to refuse an app whose objects are unlike anyone else’s.

There is no `outputSchema` in the current WebMCP draft. Do not pretend mapping is a protocol-level typed contract.

---

## 5. In-app surface

### 5.1 Default: injected, so opt-in fulfills the vision

On an origin that has completed a WebMCP handshake (or the polyfill), the hub attaches the surface to that window.

No app code beyond tool registration is required. That is the mechanism behind §1.4.

The surface is:

- Hub origin, isolated (§3.3).
- Opened by the user (a clear control: toolbar button, badge on the page edge, keyboard shortcut). It does not steal the app.
- Rooted in **this app**: title, origin, current context from **this app’s read tools**.
- A directory of **other members**, by app name, then capabilities.
- A confirm card for writes, in this window.
- A result pane for the last invocation, in this window.

It is not a blank agent chat. Chat may exist as a secondary control on this same surface.

### 5.2 Optional: app-hosted slot

An app that wants the surface in a specific place (a dashboard column, a record sidebar) may host a hub-origin iframe in that slot. Same isolation, same APIs. This is sugar. It is not join.

Do not build a component library that apps must adopt in order to participate.

### 5.3 Context without teaching A about B

The hub is already in A’s tab. It may run A’s **read** tools after the user has opened the surface or started a job (user intent). That is how “the open client” becomes context.

A does not pass a proprietary context object into an SDK. A does not import B. The hub reads what A already exposed.

### 5.4 Bidirectional by construction

The same surface is attached to every opted-in window. From invoicing, the CRM is a named member. From a third app that is nothing like either, both are named members.

If a demo only ever starts in the CRM, it has not proved the connectome. It has proved one launcher. Gate C exists for this.

### 5.5 What the host page is allowed to learn

By default: **nothing** about other apps.

A result may be written **into** A only if A exposed a write tool, the user started that edge, and the user approved the exact payload. That is App A being used from inside App A, plus data that came through the hub from B — still one consented edge at a time.

---

## 6. Consent, identity, isolation

### 6.1 Confused deputy

Tools inherit the signed-in session of each spoke. That is the point: the user is already in their apps. The hub can then read A and write B because *the user* is logged into both. That makes the hub a **confused deputy**.

Consent is therefore **per edge** (`A.tool → B.tool`), not a global “allow this extension to run tools.”

### 6.2 v-proof and product consent

Until a later document says otherwise:

- **Reads** may run after user intent (surface opened, job started).
- **Writes** always confirm, **exact JSON**, in the in-app surface (cockpit only for Gate A).
- Dismiss / navigate-away / tab-close of the confirm cancels. Nothing is written.
- No implicit skip of a write. Stop. Show what already happened.
- Tool descriptions and tool results are **untrusted text**. Render as data. Do not obey them as instructions.
- No “remember this mapping” that auto-writes next time.
- Compensating actions / undo only if the spoke declared them.

Unattended overnight runs, permission templates that fire without a payload preview, and “zero interruptions for pre-approved flows” are **another product**. They are not how this vision is upheld.

### 6.3 Prompt injection

A’s tool description or returned JSON can become instructions that then act on B. Chrome’s WebMCP tool-security guidance exists because of this.

Mitigation here is not a smarter model. It is: typed preview of every write, untrusted rendering, hub-origin surface, per-edge consent.

### 6.4 Isolation reminders

- Secure, origin-keyed documents.
- Permissions-Policy `tools` defaults to `self`.
- Cross-origin sharing only via `exposedTo` + `fromOrigins` + `allow="tools"` on iframes — that is **not** the connectome path. The connectome path is the privileged hub.
- Native `getTools` / `executeTool` see the same tab frame tree only.
- Cross-tab only via the hub, in each page world.
- Surface iframe is hub origin; host cannot read it.
- Host permissions: the proof uses the stub origins, not `<all_urls>`. Widen only with a reason.

---

## 7. Presence is transport, not product

### 7.1 Two different questions

| Question | Whose problem | Product rule |
|---|---|---|
| Where is the **user**? | Product | Inside the app they started from. |
| Where is **spoke B** so its tool can run? | Hub / transport | Somewhere the hub may legally invoke. |

Mixing these up is the main historical distortion. “B’s tab is not open” is a transport miss. It is not a reason to move the user’s workplace into an agent, a background-tab manager, or a cloud browser.

### 7.2 Rules by phase

| Phase | If B is not present | User locus |
|---|---|---|
| Gate A (mediation proof) | Fail clearly: “open the invoicing app.” No write. | Cockpit (workshop) |
| Gate B–D (vision proofs) | Fail clearly **in the surface inside A**, with a user-initiated “open B” control if we already have launch. No silent skip. | **Still A** |
| After Gate E | Hub may open-or-focus B **with consent**, preferably without stealing focus (`active: false` is a transport detail). User stays in A. | **Still A** |

Do not invent presence. Background / service-worker tools are not shipped; multi-origin tool use may not be safely implementable. Cloud headless browsers, cookie copies, and overnight runs are not in this file. If they ever exist, they are transports behind the same surface and the same consent. They do not change §1.

### 7.3 Focus

The user’s attention stays in A. Opening B in the background so a tool can run is allowed as transport **after** the user has consented to that job (and, later, to launch). Stealing focus to B as the default is a failed locus.

Closing hub-opened tabs after the job is a hygiene choice. It is not a vision choice.

---

## 8. Distortion tests

Run every proposal — including this repo’s other markdown — through these. A single failure means it is not this product.

1. **Locus.** Can the user use B while still in A’s window, without a generic agent shell as the workplace?
2. **Named other.** Is B present as an app, or only as a tool the helper might call?
3. **Join ticket.** After registering tools, does the vision already hold, or must the app also take our SDK, ontology, or overlay?
4. **Heterogeneity.** Can a third app that shares no objects, stack, or vendor with the first two join the same way and appear inside them?
5. **Ignorance.** Do A and B still not know each other? Does A’s JS still not see B’s data by default?
6. **User as connector.** Is every write still an exact payload the user can refuse?
7. **Surface, not engine.** Are we building a window onto other apps, or a workflow engine that uses apps as backends?

`connectome-expansion.md` fails 1, 3, 4, 6, and 7 (agent/iPaaS, CBOs as language, business-SaaS, unattended templates, cloud engine).  
Cockpit-as-destination fails 1 and 7.  
`Dn1.md` fails 1 and 6, and collapses the hub into Hermes.

---

## 9. What to prove, in this order

Do not skip a gate. Do not pad a gate with ontology, cloud, or a third adjacent stack.

### Gate A — mediation is real

`Master1.md` §7. Two local stubs, two origins, unpacked extension, one edge, exact JSON confirm, six done-when checks. Cockpit is allowed. Tabs already open. Fail clearly if B is missing.

This proves: opt-in, discovery, hub-only cross-origin, SOP intact, writes confirmed.

This does **not** prove the connectome. Do not demo Gate A as the product.

### Gate B — the vision holds in one direction

Same two stubs. **Start inside the CRM window.** Surface is hub UI attached to that window.

A stranger can:

1. Open both stubs and the extension.
2. Open a client in the CRM.
3. Open the connectome surface **from the CRM page** (not as the only path: from the side panel).
4. See **Invoicing** by name, and `create-invoice`.
5. Approve the exact JSON **in that surface**.
6. See the result in that surface, and a draft invoice in the invoicing app.
7. Repeat with the surface dismissed → no invoice.
8. Repeat with invoicing closed → clear stop **in the CRM window**, no write.

If this gate is green, “from inside A, B is accessible” is true for one pair, one way. That is the first time the vision is real.

### Gate C — the graph is not a launcher

Same pair, **start inside invoicing.** CRM is named. At least one CRM read (open client or list) is reachable from here. No new ontology. No third product.

If this fails, we built a CRM plugin, not a connectome.

### Gate D — heterogeneity

A third stub that is **not** a CRM and **not** invoicing (a notes app, a timer, a file list — anything whose objects do not resemble Client or Invoice). It registers unrelated tools. It appears by name inside the CRM and inside invoicing. They appear inside it. One confirmed edge from it to one of the others, or from one of the others to it, with a mapper that does not invent a shared business object.

If this gate requires a CBO or an SDK, the join contract has been betrayed.

### Gate E — presence as transport, locus unchanged

Persist origin → last-seen tools. If B is closed, the surface in A offers a consenting open-or-focus. User never has to adopt the cockpit as the workplace. Still confirm writes. Still no auto-write.

### Explicitly not a gate in this file

Persistent marketplace of mapping profiles, canonical object catalogs, background service-worker tools, IndexedDB pointer stores, undo frameworks, retry/circuit-breaker skip, Hermes-in-hub, Vendo install, Buzz, Grok Bot, Cloudflare Browser Rendering, overnight cron, permission templates that fire unattended, “remember and auto-write,” native cross-tab `executeTool`, SOP-bypass language, `<all_urls>` for a proof.

Those may be argued in other documents as **later transports or other products**. They do not move these gates.

---

## 10. Rejected approaches

These look like progress toward “apps connected together.” They are not this vision.

| Rejected | Why | Do this |
|---|---|---|
| Cockpit / side panel as the product | User left their apps. That is an agent workplace. | Surface inside the current app (Gate B) |
| Injected **chat agent** as the product | Other apps become anonymous backends. | Named apps and capabilities; chat is secondary |
| “Bypass SOP” | WebMCP and this design are built around isolation | Privileged hub; apps never talk |
| Hermes / any named runtime as the hub | Makes a vendor demo, not an open fabric | Extension hub; reasoner behind `Mapper` |
| `chrome.aiAgent` / `handler` / `navigator.modelContext` / `type: "text/json"` | Not the contract | `document.modelContext`, `execute`, JSON / `text` |
| Canonical Business Objects as the language of join | Excludes unlike apps; becomes iPaaS | Tools as join; per-edge map; user confirms |
| Top-N mapping profiles as admission | Closed catalog | Optional shortcuts later, never required |
| App-built overlay SDK required to participate | Vision would not hold at opt-in | Hub injects surface; hosted slot is optional |
| Pour B’s data into A’s DOM/JS | SOP-shaped leak; A learns B | Hub-origin surface; write-into-A is its own edge |
| Live `{tab → tools}` as the product | Dies when the tab closes | Graph of apps and capabilities |
| Fail by sending the user to B | Locus moved | Fail or open B as transport; user stays in A |
| Unattended templates / overnight / laptop-closed as the goal | User is no longer the connector | Exact confirm; other product if ever |
| Cloud headless + cookie copy as “the real connectome” | Different system (RPA/iPaaS) | At most a later transport behind this surface |
| Native APIs preferred, WebMCP as fallback | Join door becomes OAuth integrations | Page tool contract is the door; APIs are a spoke implementation detail |
| Skip failed writes / `DEGRADED` | Unsafe on mutation | Stop. Show what ran. |
| Global “allow this agent” | Confused deputy across sessions | Per-edge consent |
| Claim WebMCP is a W3C standard | It is a CG Draft + Chrome flag | Say that |

---

## 11. Decision log

| Topic | Decision |
|---|---|
| What is the product? | In-app reachability: from inside any member, any other member’s capabilities |
| What is not the product? | Agent cockpit, cloud workflow engine, ontology, unattended iPaaS |
| Are apps P2P? | No. Hub mediates. Apps ignorant of other apps |
| SOP | Intact. Never “bypass.” Surface is hub origin |
| Join ticket | Tool contract only |
| Heterogeneity | Same door for unlike apps. No CBO admission |
| In-app surface supplied by | Hub injection by default. Optional hosted slot |
| May A read B’s payload from the DOM? | No |
| Primary UX | Named apps + capabilities + confirm, rooted in current app |
| Chat / LLM | Secondary; mapper behind interface |
| Cockpit | Workshop and Gate A only |
| First vision proof | Gate B (start inside CRM) |
| Bidirectionality | Gate C |
| Unlike third app | Gate D |
| Missing spoke | Clear stop in A; later open-or-focus with consent; user stays in A |
| Writes | Always exact JSON confirm |
| Auto-write / overnight | Not this product |
| Reasoner | Swappable `Mapper`. No named runtime in the hub |
| Adjacent stacks (Vendo, Hermes, Grok, Buzz, Cloudflare) | Not the hub. Not gates in this file |
| Expansion doc | Transports at most. Fails distortion tests as a product spec |

---

## 12. How this sits next to the other three files

```
 Vision (this file)
    │
    │  product = in-app reachability
    │  join    = tools
    │  locus   = the app you are in
    ▼
 Gate A   mediation workshop     ← Master1 §7  (cockpit allowed)
 Gate B   from inside A, use B   ← first time the vision is true
 Gate C   from inside B, use A
 Gate D   unlike third app
 Gate E   graph + launch as transport
    │
    ├── later transports (maybe): background tab, open-or-focus,
    │   polyfill, even cloud presence — same surface, same consent
    └── other products (not this): unattended engines, personal
        agents, in-product agents of a single host
```

`Dn1.md` proposed a hub-and-spoke **agent chain**. Useful instinct (ignorant spokes, privileged mediator). Wrong workplace, wrong hub binding, wrong SOP sentence.

`Master1.md` repaired the mechanics and named “from another’s interface,” then scheduled it as v1 item 4 and made the cockpit the destination of v0. Keep the repair. Invert the destination.

`connectome-expansion.md` scaled the cockpit into a cloud automation bus and replaced join with a business ontology. Keep nothing from it as product law. Presence tricks in it are optional later transports, and only if they pass §8.

---

## 13. Glossary

| Term | Meaning here |
|---|---|
| Connectome | Persisted graph of opted-in apps and capabilities, plus a privileged hub, such that any member is accessible from inside any other |
| Accessible from inside | Named presence + invoke + confirm + result, without leaving the current app’s window |
| Surface | Hub-origin UI attached to the current app window. The product UX |
| Cockpit | Extension side panel. Workshop, not destination |
| Spoke | Opted-in app. Exposes tools. Ignorant of other spokes |
| Hub | Privileged process (v0/v1: Chrome extension). Only process that sees more than one origin |
| Join / opt-in | Registering tools on the standard contract. No SDK, no ontology |
| Edge | One directed pair of tools, user-consented |
| Locus | Where the user is working. Always the app they started from |
| Presence | Whether the hub can invoke a spoke right now. Transport, not product |
| Mapper / reasoner | Proposes target args. Not the hub, not the UX |
| CBO / schema registry | Optional later shortcut for some pairs. Not the join contract |
| Mediation pattern | Hub discovers, maps, confirms, executes. Necessary. Not sufficient |
| WebMCP | Page-level tool contract. CG Draft; Chrome origin trial / flag |
| SOP | Same-Origin Policy. Stays intact |

---

## 14. Quick start for the next implementer

1. If Gate A is not green, implement `Master1.md` §7 only. Do not argue vision with a hub that cannot invoke a second origin.
2. As soon as Gate A is green, implement **Gate B in this file**. That is the next product increment. Not tab managers, not CBOs, not a cloud worker, not Vendo, not Hermes.
3. Copy isolation from §3.3 and §6, join from §4.1, consent from §6.2, done-when from §9 Gate B.
4. If a sketch (including an older one in this repo) disagrees with §1 or §8, ignore the sketch.
5. After Gate B, take C, then D, then E, in that order.

The connectome is not a helper that uses your apps. It is your apps, able to reach each other, while you stay where you are.
