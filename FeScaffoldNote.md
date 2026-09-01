# FeScaffoldNote — read this before you touch anything

You are building out the frontend scaffold of the **Connectome surface** — the panel that slides into a host app's window and lets the user reach their other apps without leaving. This note is your survival guide. It is short on purpose. Two other files are the law; this is the map:

| File | Its role | When it wins |
|---|---|---|
| `Frontend-handoff.md` | **The law.** Product + security contract for the surface. | Always. If your idea disagrees, your idea loses. |
| `KimiPlan.md` | **The design.** The visual/UX plan (phases 0–4 + stretch items). | For anything about how it should look and feel. |
| This note | How to work: order of operations, traps, verification. | For process. It overrides nothing above. |

Read `Frontend-handoff.md` fully. Yes, all of it. It exists because every item in it has already been tried by someone clever and rejected.

---

## 1. The product in 60 seconds

The user is in **Acme CRM** (`:8787`). They click a dark badge on the right edge. A **420px panel** slides over — that panel is the product. In it they pick **Ledger** (another app, by name, with its origin shown), pick `create-invoice`, pick which CRM read supplies the values, see the **exact JSON** that will be sent, and click **Approve and send**. A draft invoice appears in Ledger. The user never left the CRM.

Every screen you build must answer yes to these four (`Frontend-handoff.md` §0, `GrokVision.md` §2.4):

1. Still inside an app they already use?
2. Can they point at another app **by name** in that window?
3. Can they use that app from here?
4. Did the two apps share a stack or schema? (**Must be no.**)

Your panel is **not** the CRM, **not** a chat app, **not** a cockpit. It's a consent surface onto named apps.

---

## 2. Run it

```bash
cd connectome          # NEVER from the repo root. Always from connectome/.
pnpm install
pnpm dev
```

Wait for the banner with six URLs, then:

| What | URL | Yours? |
|---|---|---|
| Acme CRM (host app) | http://localhost:8787 | No — boring stub. Don't style it. |
| Ledger | http://localhost:8788 | No. |
| Tick | http://localhost:8789 | No. |
| **Surface — THE PRODUCT** | http://localhost:8790 | **Yes.** |
| Gateway | http://localhost:8791 | No. |
| Mapper | http://localhost:8792 | No. |

Then: Chrome → open CRM and Ledger tabs → in the CRM tab click the vertical **Connectome** badge → the panel is `:8790` in an iframe. That iframe is what you work on.

Hot reload: edit files in `connectome/hub/surface/public/`, save, reopen the panel. **If a CSS change doesn't show:** open `http://localhost:8790/` in its own tab and hard-refresh once. You will lose an hour to this if you skip this sentence.

---

## 3. Current state of the scaffold

**Phases 0–4 of `KimiPlan.md` are already implemented and green.** Before you "improve" anything, know what exists:

- `surface.js` — all views (directory, member, read-consent, source-pick, confirm, result, grants, failure, pair, rate-limited), the confirm flow, plus design helpers: `appHue()` (per-origin avatar colour), `highlightJson()` (syntax-coloured JSON, byte-identical text), `steps()` (orientation chips), `backBtn()`.
- `surface.css` — full token system: semantic colours (`--read` blue, `--typed` green, `--mapped` violet, `--risk` red, `--warn2` amber), spacing scale, motion tokens, dark JSON panel, sticky `.confirm-actions`, provenance chip palette.
- `pnpm check` passes: 251 CI assertions + 34 unit tests.

**Your remaining work, in order:**

1. The human clickthrough (§6 below) — CSS is not proven by CI. Do this first; it is not optional polish.
2. Only then, if asked: stretch items S1–S3 (§7).

---

## 4. Where you may touch

| Path | Verdict |
|---|---|
| `connectome/hub/surface/public/surface.css` | ✅ Yes — almost all visual work lives here. |
| `connectome/hub/surface/public/surface.js` | ✅ Yes — view builders and paint helpers. Carefully. |
| `connectome/hub/surface/public/index.html` | ⚠️ Rarely — chrome shell only. |
| `hub-client.js`, `config.js`, `_headers` | ❌ No. Transport/security. Not yours. |
| `protocol/` (the copy under `public/`) | ❌ No — `pnpm sync` overwrites it. |
| Stubs (`apps/stub-*`), `bridge/`, `gateway/`, `mapper/`, `extension/` | ❌ No. Different product parts. |

---

## 5. The rules that will get your work rejected

Each of these has been tried by a clever person before you. None of them are still standing. The trap, the reason, and what catches you:

1. **`innerHTML` — never, not once.** Every string here came from another app; all of it is untrusted. Build nodes, set `textContent`. The JSON highlighter already proves coloured output doesn't need it. *Caught by:* review + the security model (XSS = confused-deputy bug).
2. **`window.parent` — never.** Leaks payloads to the host page and lets it forge approvals. *Caught by:* CI greps `hub/surface/` for it; `pnpm check` fails.
3. **Don't change these IDs:** `#mark #home #grants-link #pause #close #host-name #host-origin #transport #paused-banner #search #body #json-preview #approve #scope #problems`. Gate drivers and `doWrite` look them up.
4. **Don't rename these classes:** `.member-card` (+`data-origin`/`data-present`), `.member-name`, `.member-origin`, `.member-meta`, `.presence.on/.off`, `.empty`, `.add-app*`, `.cap`, `.cap-name`, `.badge.read/.write/.untrusted`, `.notice`, `.prov-tag.*`. Restyle freely; rename never.
5. **Don't change these functions' names or jobs:** `viewConfirm`, `async function doWrite` (must contain `client.grant` then `client.invoke`), `startEdge` (proposes confirm, never invokes the write itself). CI regex-slices the file to check.
6. **Don't change these strings:** `Approve and send`, `on-device hub`, `edge hub`, `Nothing further ran. Nothing was retried.`, failure titles (they live in `FAILURE_COPY` — change them in `packages/protocol/protocol.js` and run `pnpm sync`, never a parallel copy).
7. **The confirm card always shows the exact JSON** (`#json-preview`), provenance as visible text on each field (never a tooltip), Approve blocked while `validateArgs` complains. Cancel/close/navigate away = nothing written (`CONSENT_DENIED`). A live grant may skip source-pick. **It never skips confirm.** No auto-approve. Ever.
8. **Origin next to name, always.** Name is a sticker; origin is identity. Never hide it "to reduce noise". Never remove closed apps from the directory — grey dot, "not open", offer background-open.
9. **Don't make it look like the host app.** Dark header stays. `--hue` (from the user's anti-spoof mark) drives `--accent` — don't hard-code a brand colour. The footer stays.
10. **Search is a filter, not a prompt.** No chat box. No textarea that "just runs the query". No framework rewrite — vanilla is deliberate.
11. **No retry on `TOOL_FAILED`.** Failures are a closed set; show what ran and stop.
12. **Never `allow="tools"` on the iframe.** You don't touch the iframe anyway — it lives in `packages/bridge/bridge.js`.

If you only remember three: **no `innerHTML`, no `window.parent`, confirm shows exact JSON.**

---

## 6. Verification ritual — do this before you say "done"

In order, every time:

```bash
cd connectome && pnpm check     # must be green. No mesh needed.
```

Then the clickthrough — in the **CRM window**, with Ledger open, the way a user experiences it. Opening `:8790` as a top-level tab proves nothing:

1. Badge opens the panel; rooted bar says **in Acme CRM · http://localhost:8787**; transport pill present.
2. Directory shows **Ledger** *and* `localhost:8788`, presence text correct.
3. `create-invoice` → pick `get-open-client` → `#json-preview` contains `River North Studio` and `"amount": 180`, syntax-coloured.
4. Approve → "Done." → draft invoice exists in the Ledger tab → **CRM tab still in front** → locus chip visible.
5. Repeat, hit **Cancel** → "You declined. Nothing was written." → no new invoice.
6. Close Ledger → its card stays, grey, "not open", capabilities remembered.
7. Pause → banner appears, capabilities disabled.
8. Mark glyphs in the header. A fake panel on another origin cannot show them.

Resize the iframe in DevTools to **360px and 420px** — one column, no second breakpoint file exists. If you animated anything: confirm JSON and Approve paint with **zero delay**.

---

## 7. Stretch items (only after §6 is clean, and only if asked)

| Item | The one warning that matters |
|---|---|
| S1 Quick-action capability chips on directory cards | `.member-card` is a `<button>`; nested buttons are invalid HTML. You'd convert it to `div[role=button][tabindex]` with Enter/Space handlers, then re-verify gate drivers still click `.member-card`. Do it alone, in its own pass. |
| S2 Humanized field labels (`clientName` → "Client name") | The mono `.field-name` stays visible — it's the field's identity. |
| S3 `member.icon` images in avatars | `<img>` only when the URL is same-origin. Never `innerHTML` an SVG string from an app. |

---

## 8. If stuck

| Symptom | Almost certainly |
|---|---|
| Badge missing | Mesh down, or CRM didn't load `/.webmcp/boot.js` from `:8791`. |
| Panel blank / "Can't reach your connectome" | Gateway `:8791` down (edge transport). |
| Directory empty with both tabs open | Wait 1s for HELLO; check you didn't filter search; the host app never lists itself (correct). |
| Confirm JSON empty | Pick a read first, or type values. Mapper down is fine — fill fields. |
| Approve disabled | Read `#problems` — required empty or type mismatch. |
| CSS not changing | Wrong file (stub CSS?), or cached `:8790` — open it in its own tab, hard-refresh. |
| `pnpm check` red after your edit | You added `window.parent`, a second write path, or `handler:`. Read the FAIL line. |
| Mark shows `??` | You're not on `:8790`. That panel is a fake. |

---

## 9. Definition of done

Say "done" only when all are true:

1. `cd connectome && pnpm check` passes.
2. You clicked the changed UI **inside the CRM window** with Ledger open (§6), not in an isolated tab.
3. The four questions in §1 are still yes / yes / yes / no.
4. Writes still show exact JSON, still require Approve.
5. Origins still sit next to names. Footer present. Mark visible.
6. No `innerHTML`, no `window.parent`, no chat-as-home.

Work slow, keep the diff small, and when you're about to do something clever — re-read §5.
