# Deployment readiness verdict: **READY WITH CONDITIONS**

Every gate executed from here passes. One gate requires a human in Chrome, and production deploy needs its env/secrets set. Details:

## Passed

| Gate | Result |
|---|---|
| `cd connectome && pnpm check` | ✅ **288 assertions/tests, 0 failed** (254 CI invariants incl. write-path structure + 13 provide-context + 21 vitest) |
| Changed-file scope | ✅ Only `surface.css` + `surface.js` modified in the scaffold envelope — exactly the files handoff §3 permits |
| Security invariants | ✅ Zero `window.parent`, zero `innerHTML`, zero `document.write` in shipped code (only explanatory comments); all 14 load-bearing IDs/classes/strings intact (`#json-preview`, `#approve`, `viewConfirm`, `doWrite`, `startEdge`, "Approve and send", "on-device hub"/"edge hub", "Nothing further ran…", `connectome.mark`) |
| Clean mesh boot | ✅ All six services live: CRM/Ledger/Tick 200, **surface page + all 6 assets 200**, gateway `/.webmcp/boot.js` 200 on every stub, mapper live (correctly refuses malformed requests with a JSON envelope) |
| Security headers | ✅ `permissions-policy: tools=()` served on the surface |
| Served content | ✅ Live `:8790` assets contain the complete scaffold (all 21 JS and 18 CSS markers verified) |
| Deploy plumbing | ✅ `scripts/deploy.mjs` exists with an explicit target list (hostile stub deliberately excluded — CI-enforced); `surface/wrangler.jsonc` uses assets + SPA handling + `custom_domain`; `pnpm sync` build-env substitution verified intact |

One incident during verification: an **orphaned mesh from an earlier run** held ports 8787–8789/8792 with a dead surface/gateway. 

## Conditions before deploying

1. **Human clickthrough (handoff §17, item 2 — the one gate I can't execute).** Someone must run the 8-step checklist from `FeScaffoldNote.md` §6 in the **CRM window with Ledger open** and confirm the four §0 screenshot questions. If "completely built" already included that walkthrough, this condition is met.
2. **Production env.** Deploy requires `CONNECTOME_ZONE`, Cloudflare auth (`CLOUDFLARE_API_TOKEN` or `wrangler login`), and secrets `TURNSTILE_SECRET` + `PAIR_SECRET` set via `wrangler secret put` (never as plain vars). Rehearse with `node scripts/deploy.mjs --dry-run` first.
3. **Ship intentionally.** The working tree carries other pre-existing uncommitted changes beyond the scaffold — `deploy.mjs` ships what's on disk, so confirm the tree you deploy is the tree you mean to ship.

**Bottom line:** the scaffold passes every automated and live-boot gate — no blockers in code. Deploy once the Chrome clickthrough is confirmed and the production env/secrets are in place.
