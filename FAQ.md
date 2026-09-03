# Apptome FAQ

### What is Connectome?
Connectome is a secure, client-side integration hub powered by WebMCP. It allows isolated web applications to talk to each other and share capabilities entirely within your browser, orchestrated by an AI agent, without requiring backend API keys or complex automation servers.

### What is WebMCP?
WebMCP (Model Context Protocol for the Web) is a draft specification that allows web applications to expose "tools" (capabilities) directly to AI agents inside the browser using a standard JavaScript API (`document.modelContext.registerTool()`). 

### How is Connectome different from Zapier or traditional APIs?
Traditional integrations require you to generate highly sensitive, long-lived backend API keys and hand them over to a third-party server. 
Connectome flips this model: it executes workflows strictly on the *client side*. It relies on your active, authenticated browser sessions. When data moves from App A to App B, it stays in your browser, bound by the web's Same-Origin Policy (SOP). The human user retains total control, reviewing the exact JSON payload before any action is executed.

### What do participating apps need to do to support this natively?
Developers only need to make two frontend changes (zero backend changes required):
1. **Include the Bridge Script:** Add a single script tag pointing to the Connectome Hub (`<script type="module" src="https://connectome-gateway.../.webmcp/boot.js"></script>`).
2. **Register Tools:** Use the W3C standard API to expose local actions: `document.modelContext.registerTool({ name, description, inputSchema, execute })`.

### What happens under the hood when an app registers a tool?
1. **Polyfill:** If the user's browser doesn't natively support WebMCP yet, our `boot.js` script seamlessly polyfills the API.
2. **Discovery:** The bridge script listens for registered tools and opens a secure WebSocket to the Connectome Hub, announcing the app's capabilities.
3. **Graph Unification:** The Hub merges these tools into your personal, unified graph, making them visible across all your open tabs.
4. **Execution:** When you trigger a workflow, a Cloudflare Workers AI model semantically maps the data payload. The Hub routes this payload securely via WebSocket back to the destination app's bridge, which triggers the local JavaScript code to execute the action.

### What if an app doesn't natively add the Connectome script? Can it still be integrated?
**Yes!** This is where the future of Connectome lies. For legacy web apps that haven't natively implemented WebMCP, users can install the **Connectome Browser Extension**. 

With explicit user consent (standard browser extension permissions), the extension injects the `boot.js` script and custom tool definitions directly into the HTML of the legacy app's page. This effectively upgrades any existing website into a WebMCP-enabled spoke, allowing humans and agents to orchestrate workflows across the entire open web, even if the host app hasn't updated their code!
