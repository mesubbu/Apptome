/**
 * Acme CRM — spoke app.
 *
 * Gate A / Gate B read source (`get-open-client`, `list-clients`) and the Gate C
 * write target (`add-note`, so a job can start inside invoicing and land here).
 * It knows nothing about the connectome: it registers tools on
 * document.modelContext and stops. That is the entire join contract.
 */

const clients = [
  {
    clientId: "c_1042",
    name: "River North Studio",
    email: "ap@rivernorth.example",
    billableRate: 180,
    currency: "USD",
    notes: [
      { noteId: "n_2201", text: "Retainer renews 1 Oct. Send the Q3 summary before quoting.", at: "2026-08-19T15:20:00.000Z" },
    ],
  },
  {
    clientId: "c_1077",
    name: "Halden & Voss Architects",
    email: "billing@haldenvoss.example",
    billableRate: 145,
    currency: "USD",
    notes: [],
  },
  {
    clientId: "c_1103",
    name: "Meridian Bakehouse",
    email: "accounts@meridianbake.example",
    billableRate: 95,
    currency: "EUR",
    notes: [{ noteId: "n_2188", text: "Prefers one invoice per quarter.", at: "2026-07-02T09:05:00.000Z" }],
  },
];

let openClientId = clients[0].clientId;
let noteSeq = 0;
let flashNoteId = null;

const listEl = document.getElementById("client-list");
const countEl = document.getElementById("client-count");
const detailEl = document.getElementById("detail");
const statusEl = document.getElementById("tool-status");

function openClient() {
  return clients.find((c) => c.clientId === openClientId) ?? clients[0];
}

function summary(client) {
  return {
    clientId: client.clientId,
    name: client.name,
    email: client.email,
    billableRate: client.billableRate,
    currency: client.currency,
  };
}

function nextNoteId() {
  noteSeq += 1;
  return `n_${Date.now().toString(36)}${noteSeq}`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function setStatus(text, state) {
  statusEl.textContent = text;
  statusEl.dataset.state = state;
}

function renderList() {
  countEl.textContent = String(clients.length);
  listEl.replaceChildren(
    ...clients.map((client) => {
      const button = el("button");
      button.type = "button";
      button.setAttribute("aria-current", String(client.clientId === openClientId));
      button.append(el("span", "name", client.name), el("span", "meta", `${client.currency} ${client.billableRate}/hr`));
      button.addEventListener("click", () => {
        openClientId = client.clientId;
        flashNoteId = null;
        render();
      });
      const item = document.createElement("li");
      item.append(button);
      return item;
    })
  );
}

function renderFacts(client) {
  const facts = el("dl", "facts");
  const rows = [
    ["Billable rate", `${client.billableRate} ${client.currency}/hr`],
    ["Currency", client.currency],
    ["Client ID", client.clientId],
  ];
  for (const [label, value] of rows) {
    const cell = document.createElement("div");
    cell.append(el("dt", null, label), el("dd", null, value));
    facts.append(cell);
  }
  return facts;
}

function renderNotes(client) {
  if (client.notes.length === 0) return el("p", "empty", "No notes on this client yet.");
  const notes = el("ul", "notes");
  notes.append(
    ...client.notes.map((note) => {
      const item = document.createElement("li");
      if (note.noteId === flashNoteId) item.classList.add("flash");
      const stamp = el("time", null, new Date(note.at).toLocaleString());
      stamp.dateTime = note.at;
      item.append(el("span", null, note.text), stamp);
      return item;
    })
  );
  return notes;
}

function renderDetail() {
  const client = openClient();
  detailEl.replaceChildren(
    el("h1", null, client.name),
    el("p", "email", client.email),
    renderFacts(client),
    el("h2", "notes-head", "Notes"),
    renderNotes(client)
  );
}

function render() {
  renderList();
  renderDetail();
}

async function waitForModelContext(timeoutMs = 2000, stepMs = 100) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (document.modelContext) return document.modelContext;
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
  return null;
}

async function registerTools() {
  const modelContext = await waitForModelContext();
  if (!modelContext) {
    setStatus("WebMCP unavailable — the app still works", "down");
    return;
  }

  try {
    await modelContext.registerTool({
      name: "get-open-client",
      description: "Returns the client currently open in the CRM UI.",
      annotations: { readOnlyHint: true },
      inputSchema: { type: "object", properties: {} },
      async execute() {
        return summary(openClient());
      },
    });

    await modelContext.registerTool({
      name: "list-clients",
      description: "Lists the clients in this CRM with their billable rate.",
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      inputSchema: { type: "object", properties: {} },
      async execute() {
        return { clients: clients.map(summary) };
      },
    });

    await modelContext.registerTool({
      name: "add-note",
      description: "Adds a short note to a client's record in the CRM.",
      inputSchema: {
        type: "object",
        properties: {
          clientId: { type: "string" },
          note: { type: "string" },
        },
        required: ["clientId", "note"],
      },
      async execute({ clientId, note }) {
        const client = clients.find((c) => c.clientId === clientId);
        if (!client) throw new Error(`no such client: ${clientId}`);
        const text = String(note ?? "").trim();
        if (!text) throw new Error("note is empty");
        const entry = { noteId: nextNoteId(), text, at: new Date().toISOString() };
        client.notes.unshift(entry);
        openClientId = client.clientId;
        flashNoteId = entry.noteId;
        render();
        return { noteId: entry.noteId, clientId: client.clientId };
      },
    });

    setStatus("3 tools registered", "ready");
  } catch (err) {
    setStatus(`WebMCP unavailable — ${err?.message ?? err}`, "down");
  }
}

render();
registerTools();
