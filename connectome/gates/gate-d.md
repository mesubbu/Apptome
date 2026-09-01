# Gate D — 2026-08-29

Heterogeneity: Tick’s objects are timers, not clients or invoices. Join is the same. Screenshots: `connectome/gates/gate-d/*.png`.

## T5.1 Named presence in all three windows

| Window | Sees | Shot |
|---|---|---|
| CRM | Ledger (`localhost:8788`) and Tick (`localhost:8789`) | `01-crm-sees-ledger-and-tick.png` |
| Ledger | Acme CRM (`localhost:8787`) and Tick (`localhost:8789`) | `02-ledger-sees-crm-and-tick.png` |
| Tick | Acme CRM (`localhost:8787`) and Ledger (`localhost:8788`) | `03-tick-sees-crm-and-ledger.png` |

**pass** — three named apps, three origins, no shared business object.

## T5.2 One read across an unlike pair

From inside CRM, Tick’s `list-entries`. Result in the surface: Wireframe review / Morning standup (`04-tick-list-entries-in-crm-surface.png`). Copy: “localhost:8787 did not receive it.” CRM DOM contains neither `t_5501` nor “Wireframe review”.

**pass**

## T5.3 Optional unlike write

**Skipped.** Visibility + one read closes D (`GrokVisionResponse.md` Gap 8). No Tick → Ledger adapter, no `TimeEntry` CBO.

Gate D is green. T6 (thin extension) is next.
