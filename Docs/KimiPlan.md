# KimiPlan — a ridiculously easy, visual-first Connectome surface

**Source material studied:** `Frontend-handoff.md` (all 17 sections), `GrokVision.md` §1–§9, the full current implementation (`connectome/hub/surface/public/{index.html,surface.css,surface.js,hub-client.js,config.js}`), the write-path assertions in `connectome/ci/distortion-tests.mjs`, gate checklists under `connectome/gates/`, and the stub apps' join contract.

**Note on screenshots:** the gate PNGs could not be viewed (no image input available in this session). Every visual claim below is derived from the DOM code, CSS, and copy tables, which fully describe the current UI. The implementer should open the running mesh (`cd connectome && pnpm dev`) before Phase 1 to see it with eyes once.

---

## 0. The one-sentence strategy

**Do not re-architect anything. The state machine, consent flow, and security model are already correct and gate-proven. The entire job is presentation and guidance: make each existing view visually obvious, color-coded, and one-primary-action-per-screen, so a first-time user never wonders "what is this, what do I tap, what will happen."**

Three taps, already true today, stay true: badge → app → capability → (pick source) → approve. We make each tap *look* inevitable.

---

## 1. The fence (hard constraints — every phase answers to this)

Distilled from the handoff. A change that violates any line is rejected, no matter how pretty.

### 1.1 DOM contract (gate drivers + tests read these)

Keep exactly, restyle freely:

- IDs: `#mark` `#home` `#grants-link` `#pause` `#close` `#host-name` `#host-origin` `#transport` `#paused-banner` `#search` `#body` `#json-preview` `#approve` `#scope` `#problems`
- Classes/attrs: `.member-card` + `data-origin` + `data-present`, `.member-name`, `.member-origin` (+`.unattested`), `.member-meta`, `.member-icon`, `.presence.on/.off`, `.empty`, `.add-app`, `.add-app-input`, `.add-app-label`, `.cap`, `.cap-name`, `.cap-desc`, `.badge.read/.write/.untrusted/.req`, `.notice` + `.ok`/`.bad`, `.json`, `.json-head`, `.json-body`, `.prov-tag.*`, `.field-*`, `.grant*`, `.crumb*`
- Strings: `on-device hub`, `edge hub`, `Approve and send`, `Nothing further ran. Nothing was retried.`, grant-scope copy idea, all `FAILURE_COPY` titles, footer meaning
- Functions (CI greps these): `viewConfirm`, `async function doWrite` (contains `client.invoke` and `client.grant`), `startEdge` (proposes confirm, never invokes the target write)

### 1.2 Security/product law (never trade away for looks)

1. `textContent` only. Zero `innerHTML`, zero markdown of app strings. App names, descriptions, JSON, errors are untrusted text, forever.
2. No `window.parent`. No `allow="tools"`. Hub origin stays `:8790`. Nothing moves.
3. Confirm card always shows **exact JSON** in `#json-preview`. A summary may sit **above** it; never instead of it.
4. Provenance is visible text on the field — never a tooltip, never hidden.
5. Origin sits next to name, always. Name is a sticker; origin is identity.
6. A live grant may skip source-pick. It never skips confirm. Cancel/close/navigate = `CONSENT_DENIED`, nothing written.
7. Closed apps stay in the directory, grey. Presence is transport, not membership.
8. The surface must NOT look like the host app. Dark header `#0f1115` stays. `--hue` (from the user's mark) drives `--accent` — no hard-coded brand hue anywhere in chrome-level UI.
9. Footer stays, saying whose panel this is.
10. Search stays a filter over named apps — never a chat box, never a prompt.
11. Vanilla stack. No framework, no new build step.
12. Motion ≤150ms around view changes, **zero delay** on the confirm JSON or the Approve button, everything off under `prefers-reduced-motion`.
13. `cd connectome && pnpm check` stays green (distortion tests + provide-context + vitest).

### 1.3 The four screenshot questions (GrokVision §2.4 — every phase re-answers yes)

1. Still in an app they already use? 2. Can they point at another app **by name**? 3. Can they use it from here? 4. Do the apps share stack/schema? (must be no)

---

## 2. Current-state audit (what the code does today, honestly)

Already good — do not regress:

- Flow `directory → member → read-consent|source-pick → confirm → result` is minimal and correct.
- Provenance tags, exact JSON, validation blocking Approve, failure closed-set, pause, grants ledger, anti-spoof mark, pairing, rate-limited view — all implemented.
- Class-named, token-based CSS (`--ink`, `--accent`, etc.), 420px single column, honest empty states.

The ease/visual gaps (what we fix):

| # | Gap in today's code | Why it costs the user |
|---|---|---|
| G1 | Everything is 10.5–13px, one weight family, grey-on-grey secondary text (`#767f8c` ≈ 4.4:1 — under WCAG for 11px) | Nothing is glanceable; hierarchy is flat |
| G2 | Every app gets the same dark `.member-icon` letter tile | Can't tell apps apart at a glance |
| G3 | Provenance is same-ish grey chips; `.mapped` and `.constant` have no distinct color at all (fall back to default) | The anti-injection signal — the product's core affordance — is quiet |
| G4 | `#json-preview` is plain monospace, light panel | The single most important artifact ("exactly this will be sent") has no visual weight or readability help |
| G5 | Approve/Cancel sit mid-flow after scope; on a small panel they scroll away under long schemas | The one action that matters can leave the viewport |
| G6 | No back affordance on member/read-consent/source-pick; escape is only the tiny "Connectome" home word in the dark header | Dead-end feeling; users hesitate to explore |
| G7 | Reads and writes differ only by a 9.5px text badge | The read/write risk asymmetry (handoff §7: "writes are visually hotter on purpose") is under-expressed |
| G8 | Presence is an 8px dot, `title=`-only explanation | Users can't tell "app is open" from "app exists but closed" without hovering |
| G9 | Result is a plain OK box; locus promise ("you never left the CRM") is one sentence in 12.5px | The product's magic moment lands flat |
| G10 | No transition on `render()` full-replace; views snap | Panel feels mechanical; tween is explicitly sanctioned (§15.5) |
| G11 | Hit targets: `.ghost` 5px padding, `.close` 4×8px, cards ~44px but `.btn.small` tiny | Hard to hit, header worst of all |
| G12 | No `aria-current`, no `aria-live` on result/failure, focus rings only on `.search`/`.field-input` | §15.4 assignable a11y debt |
| G13 | Validation problems list sits far from the offending field | User reads the error, then hunts the field |

---

## 3. Design principles (the "ridiculously easy" doctrine)

1. **One loud thing per screen.** Every view gets exactly one visually dominant action or artifact: directory → the app cards; member → the capability list; confirm → the JSON + Approve bar; result → the success mark; failure → the title.
2. **Color is a language, learned once.** Five semantic colors, used *only* for their meaning, everywhere:
   - 🔵 read/input-from-an-app (cool blue)
   - 🟢 you-typed / success (green)
   - 🟣 proposed-by-mapper (violet)
   - 🔴 write-risk / missing / failure (red)
   - 🟠 untrusted text / paused (amber)
   Reads/writes, provenance, presence, results, and failures all speak this same language. (Status/read states may additionally derive from `--hue`; semantic colors above stay fixed — they are meaning, not brand.)
3. **Every app gets a face.** Deterministic per-origin hue → avatar tint → the same hue echoes as a small dot on that app's provenance chips. You can *see* "this value came from THAT app" without reading.
4. **Machine truth looks like machine truth.** The JSON panel is dark, syntax-colored, monospace — visually distinct from the human-readable chrome around it, so "exactly this will be sent" reads as an artifact, not a paragraph.
5. **The next tap is always the biggest, warmest, lowest on the screen.** Primary action lives in a sticky bottom zone; destructive/cancel is small and quiet beside it.
6. **No hidden state.** Paused, absent, blocked, unattested, mapper-down — each is a visible chip/banner with plain copy, already written in code; we just make them unmissable.
7. **Nothing new to learn.** No new navigation, no new views, no new modes. Same state machine, same views, same copy — better eyes.

---

## 4. Design system spec

### 4.1 Tokens (extend `:root` in `surface.css`; keep every existing token name)

```css
:root {
  /* existing tokens kept as-is */
  --hue: 212; --accent: hsl(var(--hue) 78% 44%); /* mark-driven, untouched */
  /* revised contrast */
  --ink-3: #5b6470;                 /* was #767f8c — passes 4.5:1 at 11px */
  /* semantic layer (fixed hues: meaning, not brand) */
  --read: #2563eb;   --read-soft: #eaf1fe;
  --typed: #0d7a45;  --typed-soft: #edf9f2;   /* aliases --ok */
  --mapped: #7c3aed; --mapped-soft: #f3effe;
  --risk: #b42318;   --risk-soft: #fef3f2;    /* aliases --bad */
  --warn2: #8a5a00;  --warn-soft: #fff6e6;    /* aliases --warn */
  /* spacing scale (4px grid) */
  --s1: 4px; --s2: 8px; --s3: 12px; --s4: 16px; --s5: 24px;
  /* radii */
  --radius: 8px; --radius-lg: 12px; --radius-pill: 999px;
  /* elevation — kept whisper-quiet, this is a consent surface */
  --elev-1: 0 1px 2px rgb(15 17 21 / 0.06);
  /* motion */
  --t-fast: 120ms; --t-view: 150ms; --ease: cubic-bezier(.2,.7,.3,1);
}
```

### 4.2 Type scale (same stacks, clearer steps)

| Use | Size/weight |
|---|---|
| View titles (`.crumb-title`) | 16px / 650 |
| Card names, field values | 14px / 600 / 450 |
| Body, `.p`, `.cap-desc` | 13px / 450, `--ink-2` |
| Meta, origins (mono) | 11px, `--ink-3`, keep `word-break: break-all` |
| Badges/chips | 10px / 700, tracking .06em, uppercase |

### 4.3 Hit targets & focus

- Interactive rows (`.member-card`, `.cap`, `.grant`) min-height 44px; `.btn` min-height 36px; `.btn.small` 30px; `.ghost` padding → 7px 11px; `.close` 28×28px.
- Universal focus: `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: inherit }` on every interactive class. Focus order: Search → cards → Approve (§15.1).
- Enter activates Approve only when enabled (native button behavior — keep `#approve` a real `<button>`, never intercept).

### 4.4 Motion (additive, guarded)

```css
@media (prefers-reduced-motion: no-preference) {
  .body > * { animation: view-in var(--t-view) var(--ease); }   /* rise 6px + fade */
  .presence.on { animation: pulse 2.4s ease-out infinite; }     /* soft ring swell, dot stays a dot */
  .member-card, .cap, .btn { transition: border-color var(--t-fast), background var(--t-fast), transform var(--t-fast); }
  .member-card:hover, .cap:hover:not(:disabled) { transform: translateY(-1px); }
}
```

No animation on `#json-preview`, `#approve`, or their ancestors' content. The transition wraps the whole `#body` child once — 150ms, no delay, then done.

### 4.5 Component specs

**App avatar (`.member-icon`)** — keep the element + first-letter text. Add per-origin hue:
`surface.js`: `function appHue(origin) { let h=0; for (const c of origin) h=(h*31 + c.charCodeAt(0))>>>0; return h % 360; }` → inline `style="--app-hue: …"` on the icon → CSS `background: hsl(var(--app-hue) 55% 42%)`. Deterministic, no network, no app-supplied input to paint. Optional later: `<img>` for `member.icon` only when same-origin URL (§15.3) — never `innerHTML` an SVG string.

**Presence (keep `.presence.on/.off`)** — dot grows to 10px with a 2px `--bg` ring so it reads on any card; add sibling `.presence-label` ("open now" / "not open", 11px `--ink-3`) so state isn't hover-only. Grey stays grey; absent members' cards stay listed with reduced saturation, never removed (§7 rule).

**Capability cards (`.cap`)** — add a 3px left spine: `border-left: 3px solid var(--read)` for reads, `var(--risk)` for writes, plus keep `.badge.read`("reads")/`.badge.write`("writes") text and untrusted badge exactly. Write cards get `--risk-soft` hover tint; read cards get `--read-soft`. The 11-line risk asymmetry now survives peripheral vision.

**Provenance chips (`.prov-tag`)** — complete the palette the code already half-uses:

| `.prov-tag` class | color | copy (unchanged) |
|---|---|---|
| `.read` | `--read` on `--read-soft` | `read from localhost:8787` **+ 6px dot in that app's `--app-hue`** |
| `.typed` | `--typed` | `you typed this` |
| `.mapped` | `--mapped` | `proposed by the mapper` |
| `.constant` | `--ink-2` | `fixed by the adapter` |
| `.missing` | `--risk`, dashed border | `nothing found` |
| `.untrusted` | `--warn2`, bold, leading ⚠ glyph (our constant, not app text) | `untrusted text from another app` |

The app-hue dot on read chips is the visual trace: field → source app, no reading required.

**JSON panel (`.json`)** — dark body (`#0f1115`, echoing the header: "the panel's own material"), light-on-dark syntax tokens. Header `.json-head` keeps copy "Exactly this will be sent".

**Syntax highlighting, contract-safe:** tokenize the already-stringified JSON in JS, appending `<span class="tok-*">` children to `#json-preview` via `createElement`+`textContent`. `el.textContent` of the pre is **byte-identical** to today's output (spans don't change text), so gate text assertions and humans see the same characters, colored:

`.tok-key` (accent-tinted light), `.tok-str` (green), `.tok-num` (amber), `.tok-bool`/`.tok-null` (violet), punctuation as plain text nodes. Input is always our own `JSON.stringify` output — a tiny hand-rolled regex tokenizer over a well-formed string; no parser, no library, no app-controlled markup.

**Sticky confirm actions** — on the confirm view only, Approve+Cancel wrapped in `.confirm-actions { position: sticky; bottom: 0; padding: 10px 0 4px; background: linear-gradient(→ var(--bg) 70%, transparent); border-top: 1px solid var(--line) }`, so the decision is always on screen for long schemas. Order in DOM (unchanged semantics): intro notice → fields → `#json-preview` → `.scope` → `#problems` → `.confirm-actions[#approve, Cancel]`. Motion never delays its paint.

**Step chips (new helper `steps()`)** — inside `#body`, above the crumb on multi-step views: three small pills `1 Pick what to do · 2 Pick the source · 3 Check & approve`, current one filled with `--accent`, done ones `--ok`. Pure orientation; not interactive navigation. Renders on member → source-pick → confirm only.

**Back affordance** — `backBtn(goTarget)` helper: quiet `‹ Back` text button at the top of member, read-consent, source-pick, grants (confirm keeps Cancel as its only exit, per law: Cancel → `CONSENT_DENIED`).

**Result celebration** — 40px CSS circle-✓ in `--typed` above "Done." (existing copy kept), plus a locus strip: `You're still in Acme CRM · localhost:8787` as a chip using the host's app-hue. The product promise, visible from across the room.

**Failure calm** — same layout skeleton as result but amber-tinted icon and `--risk-soft` notice; `FAILURE_COPY` titles and "Nothing further ran. Nothing was retried." verbatim; action buttons per `copy.action` exactly as now.

**Empty/paused** — `.empty` gets a centered 28px dashed-circle pictogram (CSS border trick, no assets); paused banner gets amber block style + slightly larger text; `.cap:disabled` keeps opacity rule.

---

## 5. Phased implementation

Each phase ends green (`pnpm check`) and is independently landable. Files touched only under `connectome/hub/surface/public/` except where stated.

### Phase 0 — Foundation (CSS only, zero behavioral risk) *~small*

1. `surface.css`: add tokens (§4.1), bump type scale, fix `--ink-3` contrast, universal `:focus-visible`, hit-target minimums, motion block incl. `prefers-reduced-motion`.
2. Verify: `pnpm check`; mesh up; click badge; panel looks the same but calmer/sharper. No JS touched.

### Phase 1 — Directory & member (visual home) 

1. `surface.js`: add `appHue()`; set `--app-hue` on `.member-icon`; add `.presence-label` next to dot (keep dot + classes + `data-*` attrs + `title`).
2. `surface.css`: restyle `.member-card` (44px+ rows, hover lift), presence sizes/labels, `.cap` spines + read/write hover tints, badge palette refresh, `.empty` pictogram, `.add-app` panel polish, paused banner emphasis.
3. Presence semantics check: Ledger closed → card still there, grey, "not open" text, member view shows "isn't open." (§13.6).
4. Verify: `pnpm check`; directory shows Ledger (name + `localhost:8788` + capabilities count); pause → banner + disabled caps.

### Phase 2 — Confirm card (THE product — most review care)

1. `surface.js`: JSON tokenizer (`highlightJson(pre, obj)`) building `tok-*` spans; provenance chip reads get the source app-hue dot (inline `--app-hue` on chip); `steps()` helper; sticky `.confirm-actions` wrap (moving existing `#approve`/Cancel nodes, not recreating — IDs untouched); `aria-invalid` on the offending `.field-input` when `#problems` lists its field.
2. `surface.css`: dark `.json` body + token colors, full `.prov-tag` palette, sticky actions, field required markers, focus order.
3. Hard invariants to re-prove manually: `#json-preview` **textContent identical** to before; Approve still disabled while `validateArgs` reports; typing flips provenance to `you typed this`; Cancel → `CONSENT_DENIED`; grant select default `session`; writes still route `viewConfirm → doWrite → client.grant → client.invoke` (CI).
4. Verify: full §13 checklist items 3–5, mapping note visible, mapper-down note visible, no spinner blocking on `:8792`.

### Phase 3 — Flow chrome (result, failure, grants, pairing, steps, back)

1. `surface.js`: `backBtn()` on member/read-consent/source-pick/grants; steps on source-pick/confirm; result view celebration node + locus chip; `aria-live="polite"` on result/failure boxes; `aria-current="page"` on active crumb.
2. `surface.css`: result/failure layout, grants rows tidy, Turnstile slot spacing.
3. Verify: ledger closed → Open in background tab (focus stays in CRM); revoke/forget/export still work from Connections; pairing/rate-limited views render.

### Phase 4 — a11y + final polish + resize pass

1. Keyboard walk the whole flow in the CRM window (Tab order Search → cards → capability → source → fields → Approve).
2. Resize iframe to 360px and 420px; single column holds; sticky bar doesn't cover `#problems` (`scroll-padding-bottom` on `.body`).
3. Contrast spot-check chips at 10px (all chip pairs ≥ 4.5:1).
4. Re-run all of §13, then answer the four §0 questions from a fresh screenshot set.

### Stretch (explicitly optional — only after P0–P4 are green and clicked)

- **S1 Quick-action chips on directory cards** (capability chips that jump straight to `startEdge`, cutting a tap). ⚠ Requires `.member-card` to become `div[role=button][tabindex]` with Enter/Space handlers (nested buttons are invalid HTML) — must re-verify gate click drivers still activate `.member-card`. Land behind its own clickthrough.
- **S2 Humanized field labels** (`clientName` → "Client name" above the mono `.field-name`, which stays).
- **S3 Same-origin `member.icon` images** in avatars (img tag only when URL is same-origin).

---

## 6. File-by-file change map

| File | Change volume | What |
|---|---|---|
| `surface.css` | **heavy (~+300 lines)** | tokens, palettes, spines, dark JSON, sticky bar, motion, targets, focus |
| `surface.js` | **moderate (~+180 lines)** | `appHue`, `highlightJson`, `steps`, `backBtn`, presence label, chip hue dots, aria attrs. **Edit view builders only. Never touch `doWrite`, `startEdge` logic, `HubClient`, mark/pairing code.** |
| `index.html` | **light** | none expected beyond possibly `aria-live` on a static wrapper; chrome structure untouched |
| `hub-client.js`, `config.js`, `_headers`, `protocol/` | **zero** | not ours |
| stubs, bridge, gateway, mapper, extension | **zero** | not this task |

---

## 7. Verification protocol (run at the end of every phase)

```bash
cd connectome && pnpm check      # distortion tests + provide-context + vitest
```

Then the human clickthrough (CSS is not proven by check), from the handoff §13, in the **CRM window with Ledger open**:

1. Badge opens panel; rooted bar shows **in Acme CRM · http://localhost:8787**; transport pill readable.
2. Directory shows Ledger **by name + origin**, presence text correct.
3. `create-invoice` → `get-open-client` → `#json-preview` contains `River North Studio` and `"amount": 180` — and is now syntax-colored with **identical textContent**.
4. Approve → "Done." + celebration; draft exists in Ledger tab; **CRM tab still in front**; locus chip reads correctly.
5. Cancel path → "You declined. Nothing was written."; no new invoice.
6. Close Ledger → grey card, "not open", capabilities remembered, background-open offered.
7. Pause → banner + disabled caps (visible from arm's length).
8. Mark glyphs present; a `:8793` hostile fake cannot match them.
9. `window.__connectomeState` untouched; console free of errors.

Plus the new-checklist for this redesign specifically:

- [ ] No `innerHTML` added (grep `surface.js`; comments are the only hits)
- [ ] No `window.parent` anywhere under `hub/surface/`
- [ ] `#json-preview`, `#approve`, `#scope`, `#problems` IDs unchanged; `viewConfirm`/`doWrite`/`startEdge` signatures intact
- [ ] `--hue` still flows mark → `--accent`; semantic colors don't override chrome accent
- [ ] Reduced-motion mode: everything static, nothing delayed

---

## 8. Explicitly out of scope (the "don't even" list — adapted from handoff §14)

Chat box home. Auto-approve on live grants. Summary **instead of** JSON. Markdown rendering of descriptions. `window.parent` "to tell the CRM". Hiding origins to look modern. Removing closed apps. Matching the CRM's blue. Moving surface HTML to the CRM origin. `allow="tools"`. Retry on TOOL_FAILED. New framework/src tree. Endless spinners. Tooltips that hide provenance. Anything that makes the panel look like a generic AI assistant shell.

---

## 9. Definition of done (mirrors handoff §17 + this plan)

1. `pnpm check` green.
2. Every changed view exercised in the CRM window, not just `:8790` as a top-level tab.
3. Four §0 questions: yes, yes, yes, no.
4. Exact JSON + Approve still gate every write; provenance visible without hover.
5. Origins next to names; footer present; mark visible.
6. No `innerHTML`, no `window.parent`, no chat-as-home.
7. **New:** a first-time user, given zero explanation, can go badge → Ledger → create-invoice → approve without reading a sentence twice — that is the "ridiculously easy" bar, measured by watching one person do it.
