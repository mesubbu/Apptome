/**
 * Ledger — spoke app.
 *
 * Gate A / Gate B write target (`create-invoice`) and the Gate C starting point:
 * the connectome surface opens inside THIS window and reaches the CRM by name.
 * It knows nothing about the connectome: it registers tools on
 * document.modelContext and stops. That is the entire join contract.
 */

const invoices = [];

let invoiceSeq = 1000;
let flashId = null;
let flashTimer = null;

const bodyEl = document.getElementById("invoice-body");
const countEl = document.getElementById("invoice-count");
const statusEl = document.getElementById("tool-status");

function nextInvoiceId() {
  invoiceSeq += 1;
  return `INV-${invoiceSeq}`;
}

function money(amount, currency) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
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

function flash(invoiceId) {
  flashId = invoiceId;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    flashId = null;
    render();
  }, 2400);
}

function renderEmpty() {
  const empty = el("div", "empty");
  empty.append(
    el("strong", null, "No invoices yet"),
    el("span", null, "Drafts you create will show up here before anything is sent.")
  );
  return empty;
}

function renderRow(invoice) {
  const row = document.createElement("tr");
  if (invoice.invoiceId === flashId) row.classList.add("flash");

  const ref = document.createElement("td");
  ref.append(el("span", "ref", invoice.invoiceId));

  const who = document.createElement("td");
  who.append(el("span", "who", invoice.customerName));
  if (invoice.customerEmail) who.append(el("span", "memo", invoice.customerEmail));
  if (invoice.memo) who.append(el("span", "memo", invoice.memo));

  const amount = el("td", "num", money(invoice.amount, invoice.currency));

  const status = document.createElement("td");
  status.append(el("span", "badge", invoice.status));

  row.append(ref, who, amount, status);
  return row;
}

function renderTable() {
  const table = document.createElement("table");
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.append(
    el("th", null, "Invoice"),
    el("th", null, "Customer"),
    el("th", "num", "Amount"),
    el("th", null, "Status")
  );
  head.append(headRow);

  const body = document.createElement("tbody");
  body.append(...invoices.map(renderRow));

  table.append(head, body);
  return table;
}

function render() {
  const drafts = invoices.filter((i) => i.status === "draft").length;
  countEl.textContent = invoices.length === 0 ? "" : `${drafts} draft${drafts === 1 ? "" : "s"}`;
  bodyEl.replaceChildren(invoices.length === 0 ? renderEmpty() : renderTable());
}

function appendDraftInvoice({ customerName, customerEmail, amount, currency, memo }) {
  const invoice = {
    invoiceId: nextInvoiceId(),
    customerName,
    customerEmail: customerEmail ?? "",
    amount,
    currency,
    memo: memo ?? "",
    status: "draft",
    createdAt: new Date().toISOString(),
  };
  invoices.unshift(invoice);
  flash(invoice.invoiceId);
  render();
  return invoice;
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
      name: "create-invoice",
      description: "Creates a draft invoice for a customer. Does not send or charge.",
      inputSchema: {
        type: "object",
        properties: {
          customerName: { type: "string" },
          customerEmail: { type: "string" },
          amount: { type: "number" },
          currency: { type: "string" },
          memo: { type: "string" },
        },
        required: ["customerName", "amount", "currency"],
      },
      async execute({ customerName, customerEmail, amount, currency, memo }) {
        const name = String(customerName ?? "").trim();
        if (!name) throw new Error("customerName is required");
        const total = Number(amount);
        if (!Number.isFinite(total) || total <= 0) throw new Error("amount must be a positive number");
        const code = String(currency ?? "").trim().toUpperCase();
        if (code.length !== 3) throw new Error("currency must be a 3-letter code");

        const invoice = appendDraftInvoice({
          customerName: name,
          customerEmail: customerEmail ? String(customerEmail).trim() : "",
          amount: total,
          currency: code,
          memo: memo ? String(memo).trim() : "",
        });
        return { invoiceId: invoice.invoiceId, status: invoice.status };
      },
    });

    await modelContext.registerTool({
      name: "list-invoices",
      description: "Lists the invoices in this account and whether each one is still a draft.",
      annotations: { readOnlyHint: true },
      inputSchema: { type: "object", properties: {} },
      async execute() {
        return {
          invoices: invoices.map((invoice) => ({
            invoiceId: invoice.invoiceId,
            customerName: invoice.customerName,
            amount: invoice.amount,
            currency: invoice.currency,
            status: invoice.status,
          })),
        };
      },
    });

    setStatus("2 tools registered", "ready");
  } catch (err) {
    setStatus(`WebMCP unavailable — ${err?.message ?? err}`, "down");
  }
}

render();
registerTools();
