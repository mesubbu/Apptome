# Production topology

A connectome is one user's graph of opted-in apps. In production that graph
lives in a Durable Object behind the gateway, and every hostname that talks to
it is a **subdomain of one registrable domain**. SameSite is site-based, not
origin-based: `hub.example.com` and `surface.example.com` are same-site, so the
pairing cookie (`HttpOnly; Secure; SameSite=Lax`) rides. That is why the
deploy script takes `CONNECTOME_ZONE` and not six unrelated domains.

A genuinely cross-site mesh — spokes the operator does not own — cannot rely
on that cookie. That ceiling is why the extension transport exists.

## Hostnames

| Host | Worker | Role |
|---|---|---|
| `hub.<zone>` | `hub/gateway` | Join door, `/api/*`, HubDO, `/.webmcp/boot.js` |
| `surface.<zone>` | `hub/surface` | Hub UI. The only origin that may call `/map`. |
| `map.<zone>` | `hub/mapper` | Schema-only field correspondence. Workers AI behind AI Gateway. |
| `crm.<zone>` | `apps/stub-crm` | Demo spoke. |
| `ledger.<zone>` | `apps/stub-invoicing` | Demo spoke. |
| `tick.<zone>` | `apps/stub-notes` | Demo spoke. |

`<zone>` is `CONNECTOME_ZONE` (for example `example.com`). Replace the
`*.example.com` custom-domain patterns in each `wrangler.jsonc` `env.production`
block with your zone before the first deploy, or keep `example.com` only as
the documented shape — `scripts/deploy.mjs` passes runtime vars from
`CONNECTOME_ZONE` so the join door and the boot tags cannot drift.

**Not deployed.** `apps/hostile-stub` is a Gate B anti-spoof fixture. It is a
workspace package with a valid `wrangler.jsonc`. The deploy script enumerates
targets by name and does not include it. Do not `pnpm run -r deploy`.

## One-time account setup

1. Add `<zone>` to the Cloudflare account and enable a proxy (orange cloud) on
   the six hostnames, or let `custom_domain: true` attach them on first deploy.
2. `wrangler secret put TURNSTILE_SECRET --env production` in `hub/gateway`.
3. `wrangler secret put PAIR_SECRET --env production` in `hub/gateway`.
4. Set `TURNSTILE_SITE_KEY` as a production var (it is public; the widget
   renders it). The secret half never belongs in `vars`.

Rotating `PAIR_SECRET` un-pairs every browser. That is the correct blast
radius for a leak.

## Deploy

```bash
cd connectome
export CONNECTOME_ZONE=example.com          # your zone
export CLOUDFLARE_API_TOKEN=...             # or `wrangler login`
# optional overrides; defaults are the table above
# export CONNECTOME_GATEWAY_URL=https://hub.example.com
pnpm deploy
```

`pnpm deploy` is `node scripts/deploy.mjs`. It:

1. Runs `scripts/build-env.mjs` so boot tags and `config.js` point at the zone.
2. Deploys the six targets above with `wrangler deploy --env production`.
3. Passes `SURFACE_ORIGIN`, `ALLOWED_ORIGINS`, `ENVIRONMENT=production` as
   `--var` on the gateway and mapper.

GitHub Actions runs the same command on push to `main` when the repository
variable `CONNECTOME_ZONE` is set. Required secrets:
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. Required variable:
`CONNECTOME_ZONE`. Optional: `TURNSTILE_SITE_KEY` as a wrangler var, not a
GitHub secret that ends up in `vars`.

## Runtime vars

| Var | Where | Meaning |
|---|---|---|
| `ENVIRONMENT` | gateway | Must **not** be `local` in production. Unset is production (fail closed). |
| `SURFACE_ORIGIN` | gateway, mapper | Hub UI origin. Always on the `/hub` allowlist. |
| `ALLOWED_ORIGINS` | gateway | Comma-separated spoke origins. Replaces localhost defaults. |
| `TURNSTILE_SITE_KEY` | gateway | Public half of the pairing widget. |
| `PAIR_COOKIE_SAMESITE` | gateway | Default `Lax`. Only `None` if spokes are truly cross-site. |

`EXTENSION_ORIGIN` is not a var. The unpacked id is pinned in code.

## Edge injection

On a participating origin Cloudflare can inject `/.webmcp/boot.js` at the
edge. The stub HTML in this repo is the same tag done by hand, rewritten by
`build-env.mjs` for the demo apps. Production spokes the operator does not
control use the extension transport instead.
