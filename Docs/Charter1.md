# Connectome v0 charter

## One sentence

A user-authorized Chrome extension reads a client from an opted-in CRM tab and, after the user approves the exact payload, creates an invoice in an opted-in invoicing tab.

That is the whole product.

## What v0 is for

Prove four things, nothing else:

1. An app can opt in by registering WebMCP tools. It does not know other apps exist.
2. A privileged hub (the extension) is the only process that sees more than one origin.
3. Same-Origin Policy is not bypassed. Apps never talk to each other.
4. A write never runs until the user has seen and approved the exact JSON.

If those hold, the mediation pattern is real. Everything else is v1.

## What v0 is not

Leave these out on purpose:

| Later | Why not now |
|---|---|
| Persistent capability graph | Tabs are a runtime cache. Graph is the product; mediation is the proof. |
| Launch / deep-link / “move the user” | If the invoicing tab is missing, fail with “open the invoicing app,” don’t invent presence. |
| App A UI invoking App B | v0 cockpit is the extension side panel, not an in-app surface. |
| Hermes, or any named model runtime | Mapping can be a hand-written adapter or a swappable LLM call. The hub must not import Hermes. |
| Background / service-worker tools | Not shipped. Don’t pretend. |
| Undo, rollback, circuit breakers | One write, then stop. On failure, show what ran. |
| IndexedDB pointer store | The payload is small. Keep it in extension memory for the session. |
| Cross-tab `document.modelContext.executeTool` | Spec issue #227 is open. The extension invokes `execute` **inside each tab’s page world**. |

## Roles

| Piece | Who | Does |
|---|---|---|
| CRM stub | Local web app, origin A | Registers read tools. Owns client records. |
| Invoicing stub | Local web app, origin B | Registers one write tool. Owns invoices. |
| Hub | Unpacked Chrome extension | Lists tools per tab, runs the one chain, shows the confirm card. |
| Reasoner | Optional, behind an interface | Proposes CRM → invoice field mapping. Default is a 20-line static mapper. |

Apps stay origin-isolated. The extension is the confused-deputy surface, so consent is per edge, not “allow this extension forever.”

## The one user job

Both stubs are already open and signed in (stubs can skip real auth).

1. User opens the extension side panel.
2. Panel shows: CRM tab has `get-open-client`; invoicing tab has `create-invoice`.
3. User clicks **Create invoice from open client** (or types that intent).
4. Hub calls `get-open-client` in the CRM tab.
5. Hub maps the result to `create-invoice` input (static mapper first).
6. Panel shows the **exact JSON** that will be sent, plus a one-line summary.
7. User clicks **Approve**.
8. Hub calls `create-invoice` in the invoicing tab.
9. Invoicing UI updates visibly. Panel shows the invoice id. Chain ends.

If either tab is missing, either tool is missing, or the user dismisses the card: stop. No retry storm, no skip, no write.

## Tool contracts

Use the real WebMCP surface. `document.modelContext.registerTool`, callback named `execute`, `registerTool` is async.

**CRM — `get-open-client`** (read)

```js
await document.modelContext.registerTool({
  name: "get-open-client",
  description: "Returns the client currently open in the CRM UI.",
  annotations: { readOnlyHint: true },
  inputSchema: { type: "object", properties: {} },
  async execute() {
    return {
      clientId: "c_1042",
      name: "River North Studio",
      email: "ap@rivernorth.example",
      billableRate: 180,
      currency: "USD"
    };
  }
});
```

**Invoicing — `create-invoice`** (write)

```js
await document.modelContext.registerTool({
  name: "create-invoice",
  description: "Creates a draft invoice for a customer. Does not send or charge.",
  inputSchema: {
    type: "object",
    properties: {
      customerName: { type: "string" },
      customerEmail: { type: "string" },
      amount: { type: "number" },
      currency: { type: "string" },
      memo: { type: "string" }
    },
    required: ["customerName", "amount", "currency"]
  },
  async execute({ customerName, customerEmail, amount, currency, memo }) {
    const invoice = appendDraftInvoice({ customerName, customerEmail, amount, currency, memo });
    return { invoiceId: invoice.id, status: "draft" };
  }
});
```

Optional third tool, still read-only: CRM `list-clients` — only if you want to pick a client other than the open one. Not required for done.

Rules for both apps:

- Tool names: ASCII, hyphens, ≤30 characters.
- Descriptions: what a user would ask for, not the endpoint.
- Writes create a **draft**. No send, no charge.
- Return small JSON. No tables, no HTML, no tool-description text inside the payload.
- Mark any user-sourced field with `untrustedContentHint` if you later add free text from the CRM.

## How the hub talks to tabs

Do not invent `chrome.aiAgent`. Do not call `document.modelContext.executeTool` from the extension page and expect it to reach another tab.

Per tab:

1. Content script checks for `document.modelContext`.
2. Discovery: `document.modelContext.getTools()` in that document, or observe `toolchange`.
3. Invoke: in that same document, find the tool and call `document.modelContext.executeTool(tool, args)` **or** call a thin page-side wrapper the stub exposes for the prototype.

The background/service worker of the extension only routes `{ tabId, toolName, args }` and holds the pending confirmation. It never runs app logic.

Chrome: enable `chrome://flags/#enable-webmcp-testing`. If the native API is missing in your build, a same-API polyfill (MCP-B or a 30-line stub on `document.modelContext`) is allowed so the apps don’t change.

## Consent and threat boundary (this is the security section)

v0 consent is one edge:

`crm.get-open-client → invoicing.create-invoice`

- Read may run after the user starts the job.
- Write runs only after **Approve** on the exact payload.
- Dismiss / navigate-away / tab-close cancels. Nothing is written.
- Tool descriptions and tool results are **untrusted text**. The side panel must render them as data, not as instructions the hub “obeys” without the confirm card.
- The extension host permissions should be limited to the two stub origins in v0. Do not request `<all_urls>` for the proof.
- No “remember this mapping” that auto-writes next time.

That is enough security for two local apps. Do not write a permissions framework yet.

## Reasoner interface (so Hermes never becomes the hub)

```ts
interface Mapper {
  map(input: {
    sourceTool: string;
    sourcePayload: unknown;
    targetTool: string;
    targetSchema: object;
  }): Promise<{ args: Record<string, unknown>; notes: string[] }>;
}
```

Ship `StaticClientToInvoiceMapper`. An LLM mapper can implement the same interface later. The confirm card always shows `args` from the mapper; the user is the last schema check.

## Done when

A stranger can:

1. Load two stubs and the unpacked extension.
2. Open both apps, open a client in the CRM.
3. Approve one card.
4. See a new **draft** invoice in the invoicing UI, with the CRM client’s name and rate.
5. Repeat with the invoicing tab closed → see a clear stop, no write.
6. Repeat and dismiss the card → no invoice.

No other demo path is required.

## Explicit non-goals for the repo

- No Hermes import, config, or “Nous variant” in the hub.
- No SOP-bypass language in README or comments.
- No IndexedDB, no undo tools, no retry loop.
- No third app.
- No claim of a W3C standard. Say: *WebMCP Community Group Draft; Chrome origin trial / flag.*

## v1 only after v0 is green

In this order, and only after the six “done when” checks pass:

1. Persist an app-level registry (origin → last-seen tools), still requiring an open tab to execute.
2. Open-or-focus the target origin if the user consents to launch it.
3. Per-edge memory of approved mappings, still confirming each write.
4. In-app “use a connected app” affordance (the other product).
5. Swap in an LLM mapper behind `Mapper`.
