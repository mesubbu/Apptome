# Gate E — 2026-08-29

Presence as transport, locus unchanged. Tabs are not the product; the graph is. Driver: `/tmp/connectome-driver/gate-e.mjs`. Screenshots: `connectome/gates/gate-e/*.png`. Extension id `emdpceafindjgkgpgajjapoeklpjkogo`.

## T7.1 Persist origin → last-seen tools

Close Ledger, reload CRM, open the surface: Ledger is still listed, `present: false`, `create-invoice` / `list-invoices` remembered (`01-ledger-remembered-absent.png`). Same record on `GET /api/graph`. After killing and restarting the gateway Worker, Durable Object SQLite still has those capabilities.

Binary `present` (any live session of that origin) is enough. Focus-wins and presence-decay are not in this increment.

## T7.2 Consenting open-or-focus

From CRM with Ledger closed: **Open Ledger in a background tab**. Extension `chrome.tabs.create({ url, active: false })` — never `active: true`. User stayed on `http://localhost:8787/`. Then the write still confirmed exact JSON in the CRM surface (`03-confirm-after-open.png`). Edge `openApp` remains `APP_UNAVAILABLE`.

## T7.3 Edge-grant ledger is real

| Check | Result |
|---|---|
| `sessionId` stored on the grant | **pass** — `surf_4bb19711050d4b35` |
| `uses` incremented after a successful write | **pass** — `uses=1` |
| `GRANT_SCOPE.ONCE` cannot be reused | **pass** — next click is source-pick, not confirm |
| `GRANT_SCOPE.SESSION` dies on reconnect | **pass** — close/reopen surface → source-pick |
| Live `create-invoice` schema change → `SCHEMA_DRIFT` | **pass** — `04-schema-drift.png`; Allow it again; never auto-write |

The drift **check** is in the surface (`startEdge`), hashing the live target `inputSchema` against the grant. That is the one home named in T3.2.

## T7.4 Exit

| Check | Result |
|---|---|
| Export | **pass** — metadata only; no River North / invoice payloads |
| Pause (extension too) | **pass** — banner; capability rows disabled (`05-paused.png`) |
| Forget while tab open | **pass** — Ledger gone; live `HELLO` did not resurrect (`06-forgotten.png`) |
| Re-add | **pass** — T4.3 Add an app (`http://localhost:8788`) restores membership |
| `tools=()` opt-out | **pass** — `/opt-out/` → `blocked: true`, copy “tools turned off by this site” (`07-opt-out-blocked.png`) |

Forget is a denylist (`forgotten` table), not `members.blocked`. Blocked is app opt-out. Two meanings, two states.

## T7.5 Local-first (E6)

Killed the gateway process (`:8791`). Stubs, surface, and mapper stayed up (`scripts/dev.mjs` no longer suicides the mesh when one child exits). With the extension loaded and both stubs open, the Gate B write still succeeded on-device (`08-local-first.png` — draft `INV-1004`, locus still CRM). Edge-only (no extension) copies **Can't reach your connectome** (`HUB_UNAVAILABLE`, `09-edge-hub-unavailable.png`).

`chrome.storage.local` mirrors `{members, grants, paused, forgotten}`. The Durable Object is sync + mapper + UI delivery, not a runtime requirement for Transport 2.

## Gate E (`GrokVision.md` §9)

| Check | Edge | Extension |
|---|---|---|
| Persist origin → last-seen tools | **pass** (DO sqlite) | **pass** |
| Consenting open-or-focus; user stays in A | n/a (`APP_UNAVAILABLE`) | **pass** |
| Write still confirms; no auto-write | **pass** | **pass** |
| Grant reuse / ONCE / SESSION / `SCHEMA_DRIFT` | **pass** | **pass** |
| Revoke / forget / pause / export / blocked | **pass** | **pass** |
| Local-first with gateway down | `HUB_UNAVAILABLE` (correct) | **pass** |

Gate E is green. Do not start T8 until these done-whens stay green.
