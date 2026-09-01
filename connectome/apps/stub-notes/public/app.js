/**
 * Tick — spoke app.
 *
 * Gate D: nothing here is a Client and nothing here is an Invoice. Its objects
 * are running timers and durations, so an edge to or from the other two spokes
 * has to be mapped per edge instead of leaning on a shared business object.
 * It knows nothing about the connectome: it registers tools on
 * document.modelContext and stops. That is the entire join contract.
 */

const entries = [
  { entryId: "t_5501", label: "Wireframe review", projectCode: "RNS-14", seconds: 4320, startedAt: null },
  { entryId: "t_5498", label: "Morning standup", projectCode: "INT", seconds: 900, startedAt: null },
];

let entrySeq = 0;
let runningDurEl = null;

const clockEl = document.getElementById("clock");
const nowEl = document.getElementById("now");
const formEl = document.getElementById("timer-form");
const labelEl = document.getElementById("label");
const projectEl = document.getElementById("project");
const toggleEl = document.getElementById("toggle");
const cardEl = document.getElementById("entries-card");
const totalEl = document.getElementById("total");
const statusEl = document.getElementById("tool-status");

function nextEntryId() {
  entrySeq += 1;
  return `t_${Date.now().toString(36)}${entrySeq}`;
}

function runningEntry() {
  return entries.find((entry) => entry.startedAt !== null) ?? null;
}

function elapsed(entry) {
  if (entry.startedAt === null) return entry.seconds;
  return entry.seconds + Math.floor((Date.now() - entry.startedAt) / 1000);
}

function clock(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function coarse(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h === 0 ? `${m}m` : `${h}h ${m}m`;
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

function renderRow(entry) {
  const item = document.createElement("li");
  const running = entry.startedAt !== null;
  item.dataset.running = String(running);

  if (running) item.append(el("span", "dot"));

  const what = document.createElement("span");
  what.append(el("span", "label", entry.label));
  if (entry.projectCode) what.append(el("span", "code", entry.projectCode));

  const dur = el("span", "dur", clock(elapsed(entry)));
  if (running) runningDurEl = dur;

  item.append(what, dur);
  return item;
}

function renderEntries() {
  runningDurEl = null;
  if (entries.length === 0) {
    cardEl.replaceChildren(el("p", "empty", "No time entries yet. Start the timer to track one."));
    totalEl.textContent = "";
    return;
  }
  const list = el("ul", "entries");
  list.append(...entries.map(renderRow));
  cardEl.replaceChildren(list);
  totalEl.textContent = `${coarse(entries.reduce((sum, entry) => sum + elapsed(entry), 0))} tracked`;
}

function renderStopwatch() {
  const entry = runningEntry();
  clockEl.dataset.running = String(Boolean(entry));
  clockEl.textContent = clock(entry ? elapsed(entry) : 0);
  toggleEl.textContent = entry ? "Stop" : "Start";
  toggleEl.classList.toggle("stop", Boolean(entry));
  labelEl.disabled = Boolean(entry);
  projectEl.disabled = Boolean(entry);

  nowEl.replaceChildren();
  if (entry) {
    nowEl.append(el("b", null, entry.label));
    if (entry.projectCode) nowEl.append(el("code", null, entry.projectCode));
  }
}

function render() {
  renderStopwatch();
  renderEntries();
}

function tick() {
  const entry = runningEntry();
  if (!entry) return;
  const text = clock(elapsed(entry));
  clockEl.textContent = text;
  if (runningDurEl) runningDurEl.textContent = text;
}

function startTimer({ label, projectCode }) {
  const running = runningEntry();
  if (running) stopTimer(running.entryId);
  const entry = {
    entryId: nextEntryId(),
    label,
    projectCode: projectCode ?? "",
    seconds: 0,
    startedAt: Date.now(),
  };
  entries.unshift(entry);
  render();
  return entry;
}

function stopTimer(timerId) {
  const entry = entries.find((candidate) => candidate.entryId === timerId);
  if (!entry || entry.startedAt === null) throw new Error(`no running timer: ${timerId}`);
  entry.seconds = elapsed(entry);
  entry.startedAt = null;
  render();
  return entry;
}

formEl.addEventListener("submit", (event) => {
  event.preventDefault();
  const running = runningEntry();
  if (running) {
    stopTimer(running.entryId);
    return;
  }
  startTimer({ label: labelEl.value.trim() || "Untitled", projectCode: projectEl.value.trim() });
  labelEl.value = "";
  projectEl.value = "";
});

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
      name: "start-timer",
      description: "Starts the timer on a piece of work, optionally under a project code.",
      inputSchema: {
        type: "object",
        properties: {
          label: { type: "string" },
          projectCode: { type: "string" },
        },
        required: ["label"],
      },
      async execute({ label, projectCode }) {
        const text = String(label ?? "").trim();
        if (!text) throw new Error("label is required");
        const entry = startTimer({ label: text, projectCode: projectCode ? String(projectCode).trim() : "" });
        return { timerId: entry.entryId, startedAt: new Date(entry.startedAt).toISOString() };
      },
    });

    await modelContext.registerTool({
      name: "stop-timer",
      description: "Stops the timer that is currently running and keeps the time entry.",
      inputSchema: {
        type: "object",
        properties: {
          timerId: { type: "string" },
        },
        required: ["timerId"],
      },
      async execute({ timerId }) {
        const entry = stopTimer(String(timerId ?? ""));
        return { timerId: entry.entryId, seconds: entry.seconds };
      },
    });

    await modelContext.registerTool({
      name: "list-entries",
      description: "Lists the tracked time entries and how long each one took.",
      annotations: { readOnlyHint: true },
      inputSchema: { type: "object", properties: {} },
      async execute() {
        return {
          entries: entries.map((entry) => ({
            entryId: entry.entryId,
            label: entry.label,
            projectCode: entry.projectCode,
            seconds: elapsed(entry),
          })),
        };
      },
    });

    setStatus("3 tools registered", "ready");
  } catch (err) {
    setStatus(`WebMCP unavailable — ${err?.message ?? err}`, "down");
  }
}

render();
setInterval(tick, 1000);
registerTools();
