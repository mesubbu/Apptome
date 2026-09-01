/**
 * Same-API WebMCP polyfill.
 *
 * GrokVision.md §4.1 permits this explicitly: "If the native API is missing, a
 * same-API polyfill is allowed so apps do not change." GrokVisionResponse.md
 * Gap 9 promotes it from footnote to primary path, because the Chrome origin
 * trial is per-origin (149 -> 156) and a third-party app you do not control
 * will not be carrying your token.
 *
 * Shape follows the W3C Web Machine Learning CG draft of 19/26 Aug 2026:
 *   document.modelContext.registerTool(tool, options?)   -> Promise
 *   document.modelContext.unregisterTool(name)
 *   document.modelContext.getTools()                     -> Promise<RegisteredTool[]>
 *   document.modelContext.executeTool(tool, args)        -> Promise<result>
 *   document.modelContext ontoolchange / "toolchange" event
 *
 * Deliberately NOT implemented: navigator.modelContext (absent from the 19 Aug
 * draft, deprecated in Chrome 150 — GrokVisionResponse.md §1).
 *
 * If the native API is present this file does nothing at all.
 */

export const POLYFILL_MARK = "__connectomePolyfill";

function toolsPermissionBlocked(doc) {
  const fp = doc.permissionsPolicy || doc.featurePolicy;
  const known =
    (typeof fp?.features === "function" && fp.features().includes("tools")) ||
    (typeof fp?.allowedFeatures === "function" && fp.allowedFeatures().includes("tools"));
  if (known && fp.allowsFeature && !fp.allowsFeature("tools")) return true;
  const metas = doc.querySelectorAll?.('meta[http-equiv="Permissions-Policy" i]') ?? [];
  return [...metas].some((m) => /(?:^|[,;\s])tools\s*=\s*\(\s*\)/i.test(m.content || ""));
}

/** @returns {"native"|"polyfill"} which implementation is in force */
export function installPolyfill(doc = document) {
  if (doc.modelContext && !doc.modelContext[POLYFILL_MARK]) return "native";
  if (doc.modelContext && doc.modelContext[POLYFILL_MARK]) return "polyfill";

  /** @type {Map<string, {tool: any, options: any}>} */
  const registry = new Map();
  const target = new EventTarget();

  function emitToolChange() {
    const ev = new Event("toolchange");
    target.dispatchEvent(ev);
    if (typeof modelContext.ontoolchange === "function") modelContext.ontoolchange(ev);
  }

  function assertSecureContext() {
    // The real API is [SecureContext]. http://localhost qualifies; plain http does not.
    if (!self.isSecureContext) {
      const err = new Error("modelContext requires a secure context");
      err.name = "SecurityError";
      throw err;
    }
  }

  function assertToolShape(tool) {
    if (!tool || typeof tool !== "object") throw new TypeError("tool must be an object");
    if (typeof tool.name !== "string" || !tool.name) throw new TypeError("tool.name required");
    // Match the draft and Master1.md §7.5: ASCII, hyphens, <= 30 chars.
    if (!/^[a-z0-9][a-z0-9-]{0,29}$/.test(tool.name)) {
      throw new TypeError(`tool.name must be ASCII lower-case/hyphens, <=30 chars: ${tool.name}`);
    }
    // The callback is `execute`. Never `handler` (GrokVision.md §10).
    if (typeof tool.execute !== "function") throw new TypeError("tool.execute must be a function");
    if ("handler" in tool) throw new TypeError("`handler` is not the contract; use `execute`");
  }

  const modelContext = {
    [POLYFILL_MARK]: true,

    async registerTool(tool, options = {}) {
      assertSecureContext();
      assertToolShape(tool);
      // Permissions-Policy `tools` defaults to `self` when the browser knows the
      // feature (native WebMCP). On today's Chrome the feature is unknown:
      // allowsFeature("tools") is false and is NOT a denial — it is absence.
      // The polyfill is the primary path in that case. Honor an explicit
      // tools=() meta so a page can still opt out without the native token.
      if (toolsPermissionBlocked(doc)) {
        const err = new Error("`tools` permission is disabled for this document");
        err.name = "NotAllowedError";
        throw err;
      }
      registry.set(tool.name, { tool, options });
      if (options.signal instanceof AbortSignal) {
        options.signal.addEventListener("abort", () => modelContext.unregisterTool(tool.name), {
          once: true,
        });
      }
      emitToolChange();
      return undefined;
    },

    unregisterTool(name) {
      // Per the Chrome 153 change: unregistering must not kill an in-flight execute().
      // We only drop the descriptor; a running promise keeps its own closure.
      const existed = registry.delete(name);
      if (existed) emitToolChange();
      return existed;
    },

    async getTools() {
      assertSecureContext();
      if (toolsPermissionBlocked(doc)) {
        const err = new Error("`tools` permission is disabled for this document");
        err.name = "NotAllowedError";
        throw err;
      }
      // Draft shape: name, description, inputSchema, origin, window.
      // We include `annotations` too: the hub needs readOnlyHint to decide whether
      // a confirm card is mandatory, and untrustedContentHint to mark provenance.
      return [...registry.values()].map(({ tool }) => ({
        name: tool.name,
        description: tool.description ?? "",
        inputSchema: tool.inputSchema ?? { type: "object", properties: {} },
        annotations: tool.annotations ?? {},
        origin: self.location.origin,
        window: self,
      }));
    },

    async executeTool(registeredTool, args) {
      assertSecureContext();
      if (toolsPermissionBlocked(doc)) {
        const err = new Error("`tools` permission is disabled for this document");
        err.name = "NotAllowedError";
        throw err;
      }
      const name = typeof registeredTool === "string" ? registeredTool : registeredTool?.name;
      const entry = registry.get(name);
      if (!entry) {
        const err = new Error(`no such tool: ${name}`);
        err.name = "NotFoundError";
        throw err;
      }
      // Executes in this document's own world, under this origin's own session.
      // That is the whole point: the user is already signed in here (§6.1).
      return entry.tool.execute(args ?? {});
    },

    ontoolchange: null,
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
  };

  Object.defineProperty(doc, "modelContext", {
    value: modelContext,
    configurable: true,
    enumerable: false,
  });

  return "polyfill";
}

/**
 * Testing surface, mirroring navigator.modelContextTesting.
 * GrokVisionResponse.md E7: `provideContext` swaps the whole tool set ATOMICALLY,
 * which is what lets Gate A-D assertions like "invoicing has no create-invoice"
 * be deterministic instead of racy.
 */
export function installTestingSurface(doc = document) {
  if (navigator.modelContextTesting) return "native";
  const testing = {
    async getTools() {
      return doc.modelContext.getTools();
    },
    async provideContext({ tools }) {
      await testing.clearContext();
      for (const t of tools) await doc.modelContext.registerTool(t);
    },
    async clearContext() {
      for (const t of await doc.modelContext.getTools()) doc.modelContext.unregisterTool(t.name);
    },
  };
  Object.defineProperty(navigator, "modelContextTesting", {
    value: testing,
    configurable: true,
    enumerable: false,
  });
  return "polyfill";
}
