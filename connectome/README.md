# Connectome

A connectome is a user-authorized graph of opted-in apps, plus a privileged hub, such that **from inside any member app the user can reach any other member app’s capabilities**, with the user still in that first app’s window, and with the user approving every write.

That sentence is `../GrokVision.md` §1.1. This tree is the running proof.

## Run

```bash
cd connectome
pnpm install
pnpm dev
```

`pnpm dev` vendors the bridge (`pnpm sync`) and boots the local mesh. Ctrl-C tears it down.

| What | URL |
|---|---|
| Acme CRM | http://localhost:8787 |
| Ledger (invoicing) | http://localhost:8788 |
| Tick (timers) | http://localhost:8789 |
| Surface (hub UI) | http://localhost:8790 |
| Gateway | http://localhost:8791 |
| Mapper | http://localhost:8792 |

Chrome’s WebMCP flag is **optional**. A same-API polyfill is the primary path (`document.modelContext`). You do not need `chrome://flags/#enable-webmcp-testing` for the stubs.

## Gate B — stranger path

This is the product. Demo this, not Gate A.

1. Leave `pnpm dev` running.
2. Open **Acme CRM** and **Ledger** (two tabs).
3. In the CRM, click the **Connectome** badge on the page edge. The surface is hub UI in that window, not a cockpit and not a chat box.
4. Open a client if one is not already selected (River North Studio).
5. In the surface, open **Ledger** by name. Choose `create-invoice`. Choose `get-open-client` as the source.
6. Approve the exact JSON. A draft invoice exists in Ledger. You are still in the CRM.

The edge transport (script tag) is enough for that path. The unpacked extension (`connectome/extension`, pinned id `emdpceafindjgkgpgajjapoeklpjkogo`) is Transport 2: any origin, on-device payloads, and consenting open-or-focus. Load it unpacked from `chrome://extensions` if you want the on-device hub.

Hostile fake UI lives at http://localhost:8793 when that stub is running. It is not a member.

## Checks

```bash
pnpm check
```

Static distortion tests (`GrokVision.md` §8), a `provideContext` harness, and a `vitest-pool-workers` suite that executes the gateway, HubDO, and mapper inside workerd. Needs no mesh.

## Production

Hostnames, pairing secrets, and the explicit deploy list (the hostile stub is not on it) live in `docs/topology.md`.

```bash
export CONNECTOME_ZONE=example.com
pnpm deploy
```

## What not to add

`../GrokVision.md` §10 is the reject list. In particular: cockpit-as-product, chat-as-the-door, Canonical Business Objects, Browser Rendering, cron/queues/workflows/alarms-for-work, `<all_urls>`, auto-write, SOP-bypass language. Presence is transport. The user is the connector.

Product law is `../GrokVision.md` §1 and §8. Gate checklists live in `gates/`.
