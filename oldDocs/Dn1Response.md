# Review of Dn1.md — App Connectome starting point

**Yes — as an exploratory starting point. Not yet as a foundation you can implement as written.**

The core idea is sound: opted-in apps expose structured tools; a user-authorized agent in the browser is the only thing allowed to move data and actions between them. That is the right first architecture for a connectome. Several claims in `Dn1.md` are factually wrong, and the note solves a narrower problem than the one you stated.

---

## Verdict

| Question | Answer |
|---|---|
| Is the *direction* valid? | Yes |
| Is the *hub-and-spoke, user-mediated* shape right? | Yes |
| Can you prove it with two toy apps this month? | Yes |
| Is the note accurate enough to implement? | No |
| Does it cover “move across apps” and “use App B from App A’s UI”? | Only the middle third |

Treat `Dn1.md` as a hypothesis, not a spec.

---

## What is actually valid

**1. Opt-in via WebMCP is the right door.**
Apps declare capabilities. They do not scrape each other, and they do not need a proprietary SDK to join. That matches “open to any app that opts in.”

**2. A privileged mediator, not app-to-app sockets.**
Apps staying ignorant of other tabs is the correct isolation model. Same-Origin Policy should stay intact. The agent is a third party the user authorizes, not a SOP bypass.

**3. Discovery → map → execute is the right loop** for a first multi-app chain.

**4. Keep bulky payloads out of the model context.**
Pointer + short summary is the right instinct. Token bloat will kill 3-app chains.

**5. WebMCP is real and timely.**
As of 17 August 2026 it is a [W3C Web Machine Learning Community Group Draft](https://webmachinelearning.github.io/webmcp), **not** a W3C Standard and **not** on the standards track. Chrome has an origin trial from Chrome 149 (`chrome://flags/#enable-webmcp-testing`) and a [Model Context Tool Inspector](https://chromewebstore.google.com/detail/model-context-tool-inspec/gbpdfapgefenggkahomfgkhfehlcenpd). That is enough to prototype.

---

## What is wrong or overclaimed

### 1. Status and API are off

The header says “W3C Proposed Standard [2026 Browser Spec].” The spec itself says it is **not** a W3C Standard and **not** on the standards track.

The sample code is close but not implementable:

| In `Dn1.md` | Actual surface |
|---|---|
| `handler:` | `execute:` |
| `type: "text/json"` | `type: "text"` (or a plain JSON-serializable return) |
| `window.chrome.aiAgent.dispatchToolCall(...)` | Does not exist |
| Sync `registerTool` | Returns a `Promise`; pass `{ signal }` to unregister |

Use `document.modelContext.registerTool({ name, description, inputSchema, execute })`. Some blogs still mention `navigator.modelContext`; Chrome deprecated that path. Track `document.modelContext`.

### 2. “Bypass SOP” is the wrong sentence

WebMCP is designed *around* origin isolation, not around punching through it:

- APIs require a secure, origin-keyed document.
- Permissions-Policy `tools` defaults to `self`.
- Cross-origin sharing is explicit: `exposedTo` + `fromOrigins` + `allow="tools"` on iframes.
- `getTools()` / `executeTool()` only see documents in the **same tab frame tree**. Cross-tab execution is an [open spec issue (#227)](https://github.com/webmachinelearning/webmcp/issues/227), not a shipped capability.
- Chrome’s own docs: *clients and browsers must visit a site to know it has tools.*

A connectome that “scans open tabs and runs tools tab-by-tab” is **not** something WebMCP gives you. It is something a **browser agent or extension** can do because it is privileged (`host_permissions` + content scripts). Chrome even says extensions can query and run WebMCP tools that way.

Rewrite the model as:

> Apps stay origin-isolated. A user-authorized browser agent (extension or native) is the only process that may discover tools across tabs and carry data between them.

If you keep “bypass SOP,” security reviewers will correctly reject the note.

### 3. Hermes is not the browser hub

Hermes (Nous) is a self-hosted agent runtime with MCP, browser automation (Browser Use / CDP), and a **community** side-panel extension. It is not a native WebMCP orchestrator and it does not own `chrome.aiAgent`.

Binding the connectome to “Hermes Agent Core (Nous Research Variant)” mixes three layers:

| Layer | What it is | Role |
|---|---|---|
| WebMCP | Page-level tool contract | How an app opts in |
| Browser agent / extension | Privileged hub | Discovers and invokes tools across tabs |
| Hermes / any LLM runtime | Reasoner | Plans the chain, maps schemas |

Hermes can be *one* reasoner. The hub should be agent-agnostic. Otherwise the connectome is a Hermes demo, not an open fabric.

### 4. LLM schema mapping is a demo, not a contract

“App 1’s output rarely matches App 2’s input, so the LLM translates instantly” will work in a two-app happy path and fail in production:

- Silent field coercion (`clientId` → `customer_ref`, currency, timezones, name vs first/last).
- No `outputSchema` in the current WebMCP draft (still [issue #9](https://github.com/webmachinelearning/webmcp/issues/9)).
- Prompt injection: App 1’s tool description or returned JSON becomes instructions that then act on App 2. Chrome’s [WebMCP tool security](https://developer.chrome.com/docs/ai/webmcp/secure-tools) guidance exists specifically for this. The note never mentions it.

For a first experiment, LLM mapping is fine **if every write is shown to the user as a typed preview**. Do not treat “no hardcoded adapters” as a product principle.

### 5. The “circuit breaker” is retries plus skip

The snippet retries twice, then marks `DEGRADED` and skips. That is not a circuit breaker, and skip-as-default is unsafe on anything that already mutated state (CRM write, invoice create, payment).

Rollback via “undo tools” assumes every opted-in app exposes compensating actions. Most will not. A starting design should require:

- **Read tools** may auto-run after user intent.
- **Write tools** always confirm, with the exact payload.
- **No implicit skip** of a write. Stop the chain and show what already happened.
- Compensating actions only if the app declared them.

### 6. IndexedDB is underspecified

“Save the payload in IndexedDB” — in *which origin*?

- Page origin: other apps cannot read it, and the agent should not inject a shared DB into app pages.
- Extension origin: this is the right place for the hub’s scratch space.
- Lifetime, encryption, deletion, and “pointer `_ref_091`” schema are undefined.

Correct instinct, incomplete design. Do not start there.

---

## The bigger miss: this is not yet a connectome

You said you want:

1. User movement across many apps.
2. Use one app’s services from another’s interface.
3. Any app that opts in.

`Dn1.md` designs **(2′)**: an agent sitting *beside* two already-open tabs, copying data between them.

That is useful, and it is the right first slice. It is not the connectome.

Missing pieces that actually define the product:

**A persistent graph, not a live tab matrix.**
`Registry = { Tab ID → [tools] }` dies when the tab closes. A connectome is `App → Capabilities → Launch / Auth / Risk`, persisted after the user has opted the app in once.

**Presence of the target app.**
Chrome today: visit the site or you cannot see its tools. The WebMCP [service-worker explainer](https://github.com/webmachinelearning/webmcp/blob/main/docs/service-workers.md) is the proposed answer for “call an app that is not open,” and even that document says multi-origin tool use may not be implementable safely. Your first prototype should **open or focus the target tab**, not pretend background execution exists.

**“From another’s interface” is not specified.**
The note puts the user in the agent. You also asked for App A’s UI to invoke App B. That is a different product:

- *Agent as cockpit* — easiest, what you sketched.
- *In-app surface* — App A embeds a “use connected apps” affordance (closer to Vendo’s overlay/MCP door in your other note).
- *Deep-link / handoff* — App A navigates the user into App B with a context token.

Those are three products. Pick one for v0.

**Movement.**
No launch, focus, deep-link, or session-handoff model. Without that, users do not “move across apps”; the agent does.

**Identity and consent.**
Tools inherit the signed-in session of each tab. That is good. The hub then becomes a **confused deputy**: it can read CRM and write billing because *you* are logged into both. Consent has to be per-edge (“CRM profile → Invoice create”), not a global “allow Hermes to run tools.”

---

## Feasibility of a first experiment

A 2-week proof is feasible. A production mesh is not, from this note.

**Do this, and only this:**

1. Two local apps (CRM stub, invoicing stub).
2. Each registers 2–3 WebMCP tools with `readOnlyHint` / `untrustedContentHint` as appropriate.
3. Chrome flag + [inspector extension](https://developer.chrome.com/docs/ai/webmcp), **or** a tiny extension that lists tools per tab and invokes `execute` in that tab’s world.
4. One scripted user intent: “Create an invoice for the client open in the CRM tab.”
5. Agent (Hermes or anything) proposes a mapping; **you approve the exact JSON** before the write.
6. If the invoicing tab is closed, the extension opens it. No background magic.

That proves: opt-in, discovery, mediation, confirmation, no SOP hole.

It does **not** prove: a graph, offline apps, in-app embedding, rollback, or an open ecosystem.

Existing pieces you should reuse rather than invent: Chrome WebMCP + inspector; [MCP-B](https://docs.mcp-b.ai) if you need a polyfill / tab transport before native cross-tab exists; backend MCP (your Vendo “MCP door” note) for apps that already have a server agent; Hermes only as the reasoner, not as the fabric.

---

## Answer to the note’s closing question

**Neither security-prompts section nor IndexedDB schema is the next write.**

Write a one-page **threat + product boundary** first, or the next section will decorate a wrong model:

1. The hub is a privileged agent, not a SOP bypass. State that in one sentence.
2. Three user jobs: *move*, *invoke from another UI*, *chain in the agent*. v0 is the third only.
3. Consent is per edge, writes always confirm, tool I/O is untrusted.
4. Registry is app-scoped and persisted; tabs are just a runtime cache.
5. Agent runtime is swappable.

Then implement the two-app experiment. Security prompts and pointer schema fall out of that.

---

**Bottom line:** `Dn1.md` is a valid *sketch of the mediation pattern*. It is not yet a valid *connectome design*, and it is not implementable without correcting the WebMCP status, the invented `chrome.aiAgent` bus, the SOP framing, the Hermes lock-in, and the “open tabs only” registry. Fix those and you have a real starting point.

If you want a next artifact, I would write a short v0 charter: two apps, one approved write, extension hub, no Hermes dependency — and leave graph, launch, and in-app embedding for v1.
