
### Sodium features 

| #  | Feature                                   | One-liner for implementation                                                                                              |
| -- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1  | **Single `sodium.json` file**             | Keep all WebMCP tool definitions in one version-controlled, reviewable configuration file.                                     |
| 2  | **Tool declarations**                     | Let developers declare each tool's name, routes/pages it applies to, execution method, and risk level.                         |
| 3  | **Automatic tool discovery / generation** | Analyze the existing application and identify useful user actions that can be exposed as agent tools.                          |
| 4  | **Framework detection**                   | Detect frameworks such as Next.js, Nuxt, SvelteKit, Astro, Angular and Vite and wire the SDK appropriately.                    |
| 5  | **CLI initialization**                    | Provide an `init` command that installs/configures the SDK and creates the tool configuration automatically.                   |
| 6  | **CLI deployment**                        | Provide a `deploy` command that validates the configuration and publishes the current tool contract.                           |
| 7  | **CLI health check**                      | Provide a `doctor` command that verifies configuration, authentication, SDK installation and overall setup.                    |
| 8  | **Signed deployments**                    | Cryptographically/signature-wise identify published versions so agents only receive trusted tool contracts.                    |
| 9  | **Immutable version history**             | Keep every published tool configuration as a version that can be inspected and rolled back.                                    |
| 10 | **Rollback**                              | Allow developers to instantly return to a previously published tool definition/version.                                        |
| 11 | **Risk levels**                           | Let each tool declare how risky its action is, e.g. read-only, state-changing, destructive or financial.                       |
| 12 | **Automatic confirmation prompts**        | Derive whether the browser should ask the user for confirmation from the tool's declared risk.                                 |
| 13 | **Per-tool permissions**                  | Let the developer decide exactly which capabilities an AI agent is allowed to invoke.                                          |
| 14 | **Browser-side execution**                | Execute tools inside the user's existing application/browser rather than sending application logic to your infrastructure.     |
| 15 | **Typed agent tools**                     | Expose structured, typed actions to WebMCP agents instead of requiring agents to infer UI interactions from buttons and forms. |
| 16 | **Automatic updates after code changes**  | Detect application changes and regenerate/update proposed tool definitions for developer review.                               |
| 17 | **Review before publishing**              | Never automatically expose newly discovered capabilities; require the developer to approve changes before deployment.          |
| 18 | **Agent analytics**                       | Track agent sessions, tool calls, success rates and latency.                                                                   |
| 19 | **Per-tool analytics**                    | Break analytics down by individual tool so developers can see which capabilities agents actually use.                          |
| 20 | **Time-based analytics**                  | Allow tool usage and performance to be viewed by day/time period.                                                              |
| 21 | **P95 latency**                           | Measure tail latency so developers can see how quickly tools respond under real-world usage.                                   |
| 22 | **Answer-engine referrals**               | Identify which AI/answer engines are sending users to the website.                                                             |
| 23 | **Agent journey tracking**                | Show what agents do after arriving from an AI/answer engine, including subsequent tool interactions.                           |
| 24 | **Multi-agent compatibility**             | Make the tools usable by any WebMCP-capable browser agent rather than targeting a single AI provider.                          |
| 25 | **Minimal installation footprint**        | Use a small browser SDK/script to register the site's tools with WebMCP.                                                       |
| 26 | **Easy removal**                          | Allow developers to disable the integration simply by disabling tools or removing the SDK/script.                              |

Sodium's own page specifically describes the core as a **`sodium.json` contract + browser SDK**, with tools executing in the user's application rather than on Sodium's servers. ([Sodium][1])

### The interesting part 

Actually divide the replication into **three layers**:

**1. WebMCP runtime**

* Tool registration
* Typed schemas
* Browser execution
* Confirmation/permission system
* Risk classification

**2. Developer experience**

* `init`
* automatic discovery
* `sodium.json` equivalent
* validation/doctor
* deploy
* versioning
* rollback
* change review

**3. Intelligence / business layer**

* agent analytics
* tool-level analytics
* AI referral attribution
* agent journey tracking
* usage/success/latency dashboards

The **first layer is the actual WebMCP product**. The second makes it pleasant for developers. The third is where you can potentially build a much bigger product/business around it.

One particularly clever Sodium feature is **"risk decides the prompt"**: the developer doesn't manually design confirmation UX for every tool. They declare the risk, and the runtime determines the appropriate confirmation behavior. Sodium gives examples ranging from `search_products` (no prompt) through `start_checkout` (confirmation required). ([Sodium][1])

And while specifically trying to **copy Sodium's feature set into your own WebMCP product**,  one more feature that isn't really a headline feature on their page: **a visual tool inspector/editor**—show the developer *exactly* what an agent can do, what inputs it accepts, what DOM/API action it triggers, and what confirmation it will require.


That could be considerably more compelling than simply cloning Sodium's CLI/config approach.

