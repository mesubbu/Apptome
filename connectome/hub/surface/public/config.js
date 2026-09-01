/**
 * Surface configuration.
 *
 * The extension id is FIXED, because the manifest pins a `key`. That matters more
 * than convenience: the surface reaches the extension over
 * `chrome.runtime.sendMessage(EXT_ID, ...)`, which is a direct channel between a
 * hub-origin document and the hub.
 *
 * The obvious alternative — postMessage to `window.parent` — would route every
 * message through App A's window, which is precisely the leak GrokVision.md §3.3
 * and §5.5 forbid ("If foreign app data is poured into A's page, A has been given
 * B's records without B's knowledge"). It would also let App A impersonate the
 * hub and harvest approvals. So we do not do it, anywhere, at all.
 */

export const EXT_ID = "emdpceafindjgkgpgajjapoeklpjkogo";
export const GATEWAY_URL = "http://localhost:8791";
export const MAPPER_URL = "http://localhost:8792";
