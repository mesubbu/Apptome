## 📝 Architectural Design Note: Multi-App WebMCP Orchestration via Browser-Level AI Agent
Document Type: Technical Architecture & Design Specification
Core Protocol: WebMCP (W3C Proposed Standard) [2026 Browser Spec]
Central Orchestrator: Hermes Agent Core (Nous Research Variant)
------------------------------
## 1. System Overview & Model
This design pattern implements a Hub-and-Spoke architecture to bypass browser Same-Origin Policies (SOP). It allows multiple isolated web applications to securely execute a joint workflow. Instead of direct Application-to-Application (Peer-to-Peer) communication, the browser-integrated AI Agent (Hermes) serves as a centralized context router, schema translator, and execution engine.

       [ App 1: Trigger / Data Source ]
                     ▲
                     │ (WebMCP registerTool / Tool Call Response)
                     ▼
             [ HERMES AGENT ] ◄───► [ Persistent State Layer (IndexedDB) ]
                     ▲
                     │ (WebMCP executeTool / Schema Mapping)
                     ▼
       [ App 2..N: Downstream Targets ]

------------------------------
## 2. Interface Layer (The WebMCP Bridge)
Each participating application exposes its available features up to the browser window's main context object. Apps do not know about other active tabs.
## Exposing App Capabilities (The Spoke)
Applications expose capabilities to the Agent using the Declarative (HTML-first) or Imperative (JavaScript-driven) WebMCP API.

// Executed in the context of App 1 (e.g., Client CRM Tab)if (window.document.modelContext) {
  window.document.modelContext.registerTool({
    name: "fetch_client_profile",
    description: "Retrieves the active client profile details including name, company, and billable rate.",
    inputSchema: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "The unique alphanumeric CRM ID" }
      },
      required: ["clientId"]
    },
    handler: async (args) => {
      const data = await internalCRMState.loadUser(args.clientId);
      return {
        content: [{ type: "text/json", text: JSON.stringify(data) }]
      };
    }
  });
}

------------------------------
## 3. The Central Hub Pipeline (Hermes Agent Runtime)
The agent operates as a loop that continuously reads, runs, and decides the next step. It runs natively within the browser extension or browser framework layer.

┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  1. Discovery    │ ──➔ │ 2. Schema Map    │ ──➔ │ 3. Sequential Ex │
│  Scans open tabs │     │ Translates JSON  │     │ Runs tool calls  │
│  for WebMCP hooks│     │ payloads         │     │ tab-by-tab       │
└──────────────────┘     └──────────────────┘     └──────────────────┘


   1. Discovery & Registration: The agent queries the active browser session to compile an in-memory matrix of available WebMCP endpoints:
   $$\text{Registry} = \{ \text{Tab ID} \rightarrow [\text{Tool}_1, \text{Tool}_2, \dots] \}$$ 
   2. Dynamic Schema Mapping: Because App 1's output schema rarely matches App 2's input schema exactly, Hermes leverages its underlying LLM reasoning to translate data structures instantly without hardcoded adapter logic.
   3. Isolated Sequential Execution: The agent executes tools one tab at a time. It keeps browser tabs completely separated, preserving security and privacy boundaries.

------------------------------
## 4. State, Memory, & Token Management
To prevent Context Window Bloat during deep 3+ multi-app chains, the agent uses a decoupled memory pattern.

* Ephemeral Context Storage: Heavy raw tool outputs (such as massive JSON tables or raw text chunks) are saved directly inside the browser's fast IndexedDB storage layer instead of being fed into the LLM context loop.
* Abstracted State Vector: The agent only updates its core prompt memory with short, text-based summaries of what happened, along with a pointer reference.
* Example Prompt State Update: "Successfully extracted profile for Client ID X. Stored payload in DB pointer _ref_091. Proceeding to task creation step."

------------------------------
## 5. Fault Tolerance & Error Recovery Strategy
Multi-app chains are vulnerable to Cascading Failures. If one intermediate step returns a bad status code, the entire automated sequence can fall apart. This design uses a Circuit Breaker & Fallback mechanism.

async function executeChainStep(agentPayload, targetTool) {
  const maxRetries = 2;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Dispatching action over the WebMCP browser bus
      const result = await window.chrome.aiAgent.dispatchToolCall(targetTool, agentPayload);
      if (result.status === "success") return result;
      
      throw new Error(result.errorMessage);
    } catch (error) {
      console.warn(`Chain Step [${targetTool}] failed on attempt ${attempt}: ${error.message}`);
      
      if (attempt === maxRetries) {
        return handleStepFailure(targetTool, error, agentPayload);
      }
    }
  }
}
function handleStepFailure(failedTool, error, payload) {
  // Graceful degradation logic
  return {
    status: "DEGRADED",
    actionTaken: "SKIPPED_STEP",
    alertUser: true,
    errorLog: `Failed to execute ${failedTool}. Diverting workflow context around this app step.`
  };
}

## Recovery Actions:

* Graceful Degradation: If a non-critical app step fails (e.g., logging a Slack notification), skip it, mark the status as DEGRADED, and move directly to the next critical path step (e.g., generating the client bill).
* State Rollbacks: If a critical step crashes halfway through the chain, use the local IndexedDB state pointer to trigger "undo" tools on previously modified tabs. This prevents orphan or half-finished records from cluttering user applications.

Would you like to build upon this design note by drafting the security architecture section for user permission prompts, or should we refine the IndexedDB state pointer schema?


