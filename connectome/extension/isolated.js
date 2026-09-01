/**
 * Isolated-world relay. The page cannot talk to the service worker; we can.
 * Page  <->  this script  <->  SW
 * Namespaced postMessage so the host page's own traffic is never ours.
 */
const port = chrome.runtime.connect({ name: "spoke" });

window.addEventListener("message", (ev) => {
  if (ev.source !== window) return;
  if (ev.origin !== location.origin) return;
  if (ev.data?.__connectome !== "to-hub") return;
  port.postMessage(ev.data.msg);
});

port.onMessage.addListener((msg) => {
  window.postMessage({ __connectome: "to-page", msg }, location.origin);
});

// Stubs already carry a script tag. If an origin on our host_permissions
// does not, inject the vendored boot so join is still "register tools".
if (!document.querySelector("script[data-connectome-hub]")) {
  const s = document.createElement("script");
  s.type = "module";
  s.src = chrome.runtime.getURL("boot.js");
  (document.documentElement || document.head).appendChild(s);
}
