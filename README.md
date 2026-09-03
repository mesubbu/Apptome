# Apptome : a Connectome for Apps

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
**Open Source License:** This project is open source and licensed under the [MIT License](LICENSE). 

Connectome is a **WebMCP-powered integration hub** that imagines the future of the open web. It solves the N-to-N integration problem entirely on the client side, allowing isolated web apps to securely expose capabilities to the user's browser session without requiring backend API keys or third-party automation servers.

*This project is a submission for the WebMCP Hackathon.*

## 🚀 Try It Out

We have deployed three WebMCP-enabled "spoke" applications and the Connectome Hub for live testing.

1. **Start Here:** [Acme CRM (Primary Demo)](https://stub-crm.rampalli1.workers.dev/)
2. **Invoicing App:** [Acme Invoicing](https://stub-invoicing.rampalli1.workers.dev/)
3. **Standalone Hub:** [Connectome Surface](https://surface.rampalli1.workers.dev/)

### Testing Instructions
1. Open the **Acme CRM** link above.
2. Click the dark **"Connectome"** badge on the right edge of the screen to open the WebMCP surface.
3. Complete the quick Turnstile human-verification check to securely pair your session. *(Note: If the widget fails to load, please temporarily disable strict ad-blockers or Brave browser "Shields").*
4. Click on a client in the CRM (e.g., "River North Studio").
5. In the Connectome sidebar, click **"Create Invoice"**. 
6. Watch as our Cloudflare AI Agent semantically maps the data from the CRM tool's output to the Invoicing tool's `inputSchema`.
7. Click **Confirm** to execute the tool and see the invoice generated across origins!

## 🧠 How it Works ( **More details in FAQ.md**)

Connectome leverages the **Model Context Protocol for Web (WebMCP)** to allow humans and agents to collaborate safely. 

- **Native & Polyfilled WebMCP:** The apps register capabilities using `document.modelContext.registerTool()`. If you use Google Chrome with the `chrome://flags/#enable-webmcp-testing` flag, Connectome uses native WebMCP. In other browsers (like ChatGPT's in-app browser), it falls back to an exact-API polyfill to maintain functionality.
- **Client-Side Orchestration:** Instead of handing over API keys to a backend server, the Connectome bridge relays tool capabilities to the Hub via WebSockets, ensuring origin isolation and the Same-Origin Policy (SOP).
- **AI Semantic Mapping:** When you connect two apps, our Hub uses **Cloudflare Workers AI** (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) to map the JSON schema on the fly, eliminating manual configuration.

## 📁 Repository Structure
- `connectome/apps/` - The WebMCP-enabled stub applications (CRM, Invoicing, Notes).
- `connectome/hub/gateway/` - The Cloudflare Worker that manages pairing and serves the bridge.
- `connectome/hub/mapper/` - The Cloudflare Worker running the AI semantic mapping agent.
- `connectome/hub/surface/` - The cross-origin UI sidebar.
- `connectome/packages/bridge/` - The client-side WebMCP bridge and polyfill.

## 📄 License

This project is licensed under the [MIT License](LICENSE).
