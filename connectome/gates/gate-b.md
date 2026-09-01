# Gate B — 2026-08-29

First time the vision holds, one pair, one way. Start inside the CRM window. Surface is hub UI in that window. One surface, two transports. No cockpit, no chat box, no third product app.

Screenshots: `connectome/gates/gate-b/*.png`

## T3.1 Screenshot test (`GrokVision.md` §2.4)

From `02-crm-surface-named-ledger.png` and `04-confirm-exact-json.png` / `05-result-in-crm-window.png`:

| # | Question | Answer |
|---|---|---|
| 1 | Still in an app they already use, not a generic agent shell? | **Yes.** Window is Acme CRM (title, clients list, River North Studio). Surface is attached chrome, labeled “in Acme CRM http://localhost:8787”. |
| 2 | Point at another app, by name, in that window? | **Yes.** Surface lists **Ledger** with origin `localhost:8788`. |
| 3 | Use that other app from here? | **Yes.** `create-invoice`, exact JSON, Approve, result in the surface; draft in Ledger. |
| 4 | Did those two apps share a stack or schema to make this possible? | **No.** Separate origins, separate wrangler apps, no shared objects. Join is tools + one script tag. |

## `GrokVision.md` §9 Gate B items 1–8

| # | Check | Edge | Extension |
|---|---|---|---|
| 1 | Open both stubs (and the extension) | **pass** — polyfill path | **pass** — unpacked id `emdpceafindjgkgpgajjapoeklpjkogo`; CRM `TRANSPORT.EXTENSION` |
| 2 | Open a client in the CRM | **pass** | **pass** |
| 3 | Open the surface **from the CRM page** | **pass** | **pass** — “on-device hub” |
| 4 | See invoicing by name, and `create-invoice` | **pass** | **pass** |
| 5 | Approve the exact JSON **in that surface** | **pass** | **pass** |
| 6 | Result in that surface, and a draft invoice | **pass** | **pass** |
| 7 | Surface dismissed → no invoice | **pass** | **pass** |
| 8 | Invoicing closed → clear stop in the CRM | **pass** | **pass** |

## T3.2 Empty / missing / paused copy

| Case | Result |
|---|---|
| Only CRM connected | **pass** — “No other apps yet” (`01-empty-only-crm.png`) |
| Ledger closed | **pass** — stop in the CRM surface (`07-ledger-closed.png`) |
| Kill switch (Pause) | **pass** — paused banner; capability rows disabled (`06-paused.png`) |
| Cancel | **pass** — `CONSENT_DENIED`; no write |

Grant reuse / `SCHEMA_DRIFT` stay T7.3. Not invented here.

## T3.3 Anti-spoof (Gap 4)

Hostile stub: `apps/hostile-stub` on **:8793**. Fourth origin, **not** on the hub allowlist, **no** bridge script. Paints a fake Connectome panel in its own DOM.

| | Real surface (`08-real-mark.png`) | Fake (`09-hostile-fake.png`) |
|---|---|---|
| Origin | `http://localhost:8790` (iframe) | `http://localhost:8793` |
| Mark | hub-origin `localStorage` glyphs (this run: `▲◆`) | `??` — cannot read hub `localStorage` |
| Bridge | yes | no |

**pass** — the user can tell. Clicking the fake Approve does not write.

Hostile stub is not a product member. Do not add :8793 to `pnpm dev` or to `ALLOWED_ORIGINS`.

Gate B is green. This is the product. Demo this, not Gate A.
