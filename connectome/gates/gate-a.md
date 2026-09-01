# Gate A — 2026-08-29

Driven in Chrome 152 against `pnpm dev` (CRM :8787, Ledger :8788, surface, gateway, mapper). Polyfill is the primary path. Tick was running and unused.

Fix that unblocked this gate: `webmcp-polyfill.js` no longer treats an unknown Permissions-Policy `tools` feature as a denial. Chrome 152 logs `Unrecognized feature: 'tools'` and `allowsFeature("tools")` is false; that is absence of native WebMCP, not `tools=()`. Opt-out is still honored via an explicit `tools=()` meta.

No pair-specific mapper adapter. The existing synonym table filled the confirm card.

## T2.1 Confirm card (no typing)

| Field | Shown |
|---|---|
| customerName | River North Studio |
| customerEmail | ap@rivernorth.example |
| amount | 180 |
| currency | USD |
| memo | unmapped (absent from the exact JSON) |

**pass**

## T2.2 Six checks (`Master1.md` §7.6)

| # | Check | Edge | Extension |
|---|---|---|---|
| 1 | Load CRM, Ledger, gateway, surface, mapper | **pass** | **pass** — plus unpacked extension `emdpceafindjgkgpgajjapoeklpjkogo` |
| 2 | Open a client in the CRM | **pass** | **pass** |
| 3 | Open the surface from the CRM badge; approve one card | **pass** | **pass** — surface shows “on-device hub” |
| 4 | Draft invoice in Ledger; user still in CRM | **pass** | **pass** |
| 5 | Ledger closed → clear stop in the surface, no write | **pass** | **pass** |
| 6 | Dismiss the card → no invoice | **pass** | **pass** |

## T2.3 Isolation (travels with A)

| Check | Result |
|---|---|
| CRM JS cannot `iframe.contentDocument` the surface | **pass** — frame `src` origin is `http://localhost:8790`; `contentDocument` is `null` |
| Approving a write does not put Ledger data into CRM JS | **pass** — CRM DOM has no `INV-` invoice ids after the write |
| Tool descriptions render with `textContent` only | **pass** — `surface.js` has no `innerHTML` writes (comments only); names, descriptions, JSON preview, result JSON all go through `textContent` |

Gate A is green. Demo this as mediation, not as the product. Gate B is next.
