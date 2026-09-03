Root cause confirmed and reproduced locally; the deployed fix needs one action only you can take.

**Why the deployed mesh fails.** The gateway's `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET` are swapped in the Cloudflare dashboard. The live `GET /api/pair` serves `0x4AAAAAAElyAX5xM8iDktYfadIKPwRSMdQ` — 35 characters, the shape of a Turnstile *secret* (site keys are 24). Three independent confirmations: that value succeeds as a `secret` against Cloudflare's real `siteverify`; the deployed `POST /api/pair` answers `invalid-input-secret`; and the browser logs `400020` ("invalid sitekey") in a retry loop. Local worked because `pnpm dev` sets `ENVIRONMENT=local`, which bypasses pairing entirely — the swap was invisible there.

I reproduced the exact failure locally (swapped dummy keys + `ENVIRONMENT=production`) and captured both states:

![Before: pairing shows a broken widget and a generic "That check did not complete. Try again."](https://api.hoplite.sh/api/attachments/85a2b4e6b8ce429a838fbb8453e0837a?w=2880&h=1800)

![After: pairing names the swapped TURNSTILE_SITE_KEY / TURNSTILE_SECRET fields and says to rotate the secret](https://api.hoplite.sh/api/attachments/a32328a00de646c0b071be8467c21192?w=2880&h=1800)

**What I fixed in code** ([[commit:eksur/Apptome@0f0505a]], pushed): the swap was silently *publishing your Turnstile secret to every visitor*, so [[194:connectome/hub/gateway/src/pairing.js|publicSiteKey]] now refuses to serve a secret-shaped value and `pairingKeyProblem` names the wrong field; `POST /api/pair` returns 503 instead of burning a challenge; the surface renders that diagnosis and no longer discards Turnstile's error code; `pnpm doctor` probes the live gateway (it currently fails, correctly). Separately, the mapper's top-level wrangler config bound Workers AI, which crashed `pnpm dev` without Cloudflare credentials — the documented-but-open FlashSay2ndPass N8 — so the full local mesh now boots. 31 tests pass, including 6 new ones.

**What you must do** (I have no Cloudflare credentials here): rotate the Turnstile secret — the old one was public — then in `connectome-gateway` → Settings → Variables set `TURNSTILE_SITE_KEY` to the 24-char site key and `TURNSTILE_SECRET` (encrypted) to the new secret, and redeploy including this commit. Two pre-existing `pnpm check` failures are unrelated and untouched: a missing `.github/workflows/check.yml` and a distortion test expecting an Analytics Engine binding the gateway config lacks.
