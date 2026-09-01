# Gate C — 2026-08-29

The graph is not a CRM plugin. Start inside Ledger. Screenshots: `connectome/gates/gate-c/*.png`.

## T4.1 Start inside Ledger

| Check | Result |
|---|---|
| Locus is Ledger | **pass** — window title Ledger; surface rooted “in Ledger http://localhost:8788” (`02-ledger-names-crm.png`) |
| CRM named, origin shown | **pass** — **Acme CRM** + `localhost:8787` |
| One CRM read | **pass** — `get-open-client` → River North Studio in the surface (`03-crm-read-in-ledger-surface.png`) |
| Ledger JS does not receive it | **pass** — Ledger DOM has no `c_1042` |

## T4.2 Reverse write (done, still Gate C)

Typed `clientId=c_1042` + `note=Gate C: note from Ledger` into `add-note`. Confirmed in the Ledger surface. Note appears on River North Studio in the CRM (`05-note-on-crm-client.png`). No Client CBO; the user typed the fields.

## T4.3 Declared membership without the tab focused

Add an app: type an origin. This device fetches `/.well-known/connectome.json` (`credentials: omit`). Hub stores a `declared` poster. Tools remain the invoke authority.

| Check | Result |
|---|---|
| Only CRM open, add `http://localhost:8788` | **pass** — Ledger by name, origin shown, presence off (`01-declared-ledger-not-present.png`) |
| Origin with no manifest (`:8793`) | **pass** — “no connectome.json at that origin — we don't invent a name” |
| No curated top-N list | **pass** — placeholder is local-dev convenience only |

Not a launcher. Gate D is next.
