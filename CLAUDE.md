# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

### Initial Setup
```bash
# Install dependencies
yarn install

# Setup environment files (see Environment Variables section below)
cp .env.example .env
cd apps/web && cp .env.example .env

# Build all packages (required before running - monorepo dependency setup)
yarn build
```

### Development
```bash
# Start LangGraph agents server (run from root)
cd apps/agents && yarn dev
# Server runs on http://localhost:54367

# Start Next.js frontend (in separate terminal, from root)
cd apps/web && yarn dev
# Frontend runs on http://localhost:3000

# Run both: Start agents server first, then frontend in separate terminal
```

### Building & Linting
```bash
# Build entire monorepo (uses Turbo)
yarn build

# Lint all packages
yarn lint
yarn lint:fix

# Format code
yarn format
yarn format:check
```

### Testing
```bash
# Run evaluations (from apps/web)
cd apps/web && yarn eval
```

## Project Architecture

Open Canvas is a Yarn workspaces monorepo with Turbo for build orchestration. It combines:
- **LangGraph agents backend** (`apps/agents`) - AI content generation with multi-node graph
- **Next.js frontend** (`apps/web`) - Real-time streaming UI with Web Worker architecture
- **Shared packages** (`packages/shared`) - Types, constants, utilities

### Monorepo Structure
```
open-canvas/
├── apps/
│   ├── agents/          # LangGraph backend - ALWAYS build before running
│   └── web/             # Next.js frontend
├── packages/
│   ├── shared/          # Shared types/constants - ALWAYS build before running
│   └── evals/           # Evaluation utilities
└── langgraph.json       # LangGraph graph definitions
```

**Critical**: The monorepo structure means `packages/shared` must be built before `apps/agents` and `apps/web` can access it. Always run `yarn build` from root after dependency changes or initial setup.

## Agent Backend (`apps/agents`)

### Graph Structure
The main graph (`src/open-canvas/index.ts`) uses LangGraph's StateGraph pattern:

1. **Entry**: `generatePath` node routes to appropriate handler based on state
2. **Path Options** (9 specialized nodes):
   - `generateArtifact` - Create new code/text artifact
   - `updateArtifact` - Modify existing artifact
   - `updateHighlightedText` - Edit selected text
   - `rewriteArtifact` - Rewrite entire artifact
   - `rewriteArtifactTheme` - Apply style/language/reading level changes
   - `rewriteCodeArtifactTheme` - Code-specific changes (comments, logs, porting)
   - `customAction` - User-defined quick actions
   - `replyToGeneralInput` - Non-artifact chat responses
   - `webSearch` - Search web for context (subgraph)
3. **Post-processing**: All paths → `generateFollowup` → `cleanState`
4. **Conditional end**: Generate title (first message) or summarize (300k+ tokens)

### Key State Fields (`src/open-canvas/state.ts`)
```typescript
OpenCanvasGraphAnnotation {
  messages: BaseMessage[];        // User-visible conversation
  _messages: BaseMessage[];       // Internal (may include summaries)
  artifact: ArtifactV3;           // Current artifact with versioning

  // Routing
  next: string;                   // Next node to route to

  // User selections
  highlightedCode: CodeHighlight; // Selected code to update
  highlightedText: TextHighlight; // Selected markdown text

  // Artifact modifications (trigger specific nodes)
  language?: LanguageOptions;     // Translate text
  addComments?: boolean;          // Add code explanations
  addLogs?: boolean;              // Add debugging logs
  portLanguage?: ProgrammingLanguageOptions; // Convert code language
  customQuickActionId?: string;   // User custom prompt
  webSearchEnabled?: boolean;     // Enable web search
}
```

### Artifact Structure (`packages/shared/src/types.ts`)
```typescript
ArtifactV3 {
  currentIndex: number;           // Active version
  contents: [{
    index: number;
    type: "code" | "text";
    title: string;
    language?: string;            // e.g., "python"
    code?: string;                // For code artifacts
    fullMarkdown?: string;        // For text artifacts
  }];
}
```

### Subgraphs
- **Web Search** (`src/web-search/`): Classify → Query Generation → Search (Exa API)
- **Reflection** (`src/reflection/`): Extracts user preferences (currently disabled)
- **Summarizer** (`src/summarizer/`): Compresses history when exceeding 300k tokens
- **Thread Title** (`src/thread-title/`): Generates conversation titles

### Tool Calling Pattern
All artifact generation/modification uses LangChain's tool binding:
```typescript
const model = await getModelFromConfig(config);
const modelWithTools = model.bindTools([artifactGenerationTool]);
const response = await modelWithTools.invoke(messages);
// Tool calls are parsed and converted to ArtifactV3 format
```

## Frontend (`apps/web`)

### Streaming Architecture
**Critical Pattern**: Web Worker offloads streaming to prevent UI blocking

```
User Input → GraphContext.streamMessage()
          → StreamWorkerService.stream()
          → Web Worker (stream.worker.ts)
          → LangGraph SDK Client
          → LangGraph Server
          → Stream events back
          → GraphContext updates state
          → UI re-renders
```

**Key Files**:
- `src/contexts/GraphContext.tsx` - Central state management, streaming orchestration
- `src/workers/graph-stream/stream.worker.ts` - Web Worker that calls LangGraph SDK
- `src/workers/graph-stream/streamWorker.ts` - Service wrapper for worker communication

**Event Processing**:
- `on_tool_calls` events contain artifact generation/updates
- GraphContext accumulates chunks and converts to ArtifactV3
- UI updates in real-time as chunks arrive

### Context Provider Hierarchy
```
UserProvider (Supabase auth)
└─ ThreadProvider (conversation management)
   └─ AssistantProvider (model selection)
      └─ GraphProvider (graph state & streaming)
         └─ Canvas (main UI)
```

### API Routes (`src/app/api/`)
- `[..._path]/route.ts` - Proxy to LangGraph server with auth
- `store/*` - LangGraph store operations (reflections, quick actions, documents)
- `firecrawl/scrape/` - Web content extraction
- `whisper/audio/` - Audio transcription (Groq)
- `runs/share/`, `runs/feedback/` - LangSmith integration

### Key Components
- **Canvas** (`src/components/canvas/`) - Main container
- **ChatInterface** (`src/components/chat-interface/`) - Messages, composer, attachments
- **Artifacts** (`src/components/artifacts/`) - CodeMirror (code) + BlockNote (markdown with live preview)
- **AssistantSelect** (`src/components/assistant-select/`) - Model picker with temperature/token controls

## Shared Package (`packages/shared`)

**Must be built** before other packages can import. Contains:
- `src/types.ts` - ArtifactV3, GraphInput, CustomModelConfig, SearchResult
- `src/constants.ts` - Special message keys, namespaces, default configs
- `src/models.ts` - Model definitions for OpenAI, Azure, OpenRouter, Anthropic, Google, Groq
- `src/utils/` - Artifact type guards, URL extraction, thinking model support

## Data Flow Example: Generate New Artifact

```
User: "Create a Python Flask app"
↓
GraphContext.streamMessage({ messages: [...] })
↓
Web Worker → LangGraph SDK Client.runs.stream()
↓
LangGraph Server: open-canvas graph
├─ generatePath → "generateArtifact"
├─ generateArtifact
│  ├─ model.bindTools([generate_artifact])
│  └─ Streams: "on_tool_calls" events
├─ generateFollowup
└─ cleanState
↓
GraphContext processes "on_tool_calls" events
├─ Accumulates artifact chunks
└─ Updates artifact state
↓
Canvas renders with syntax highlighting
```

## Environment Variables

### Backend (`.env` in root - for agents)
```bash
# Required
LANGSMITH_API_KEY=           # LangSmith tracing
ANTHROPIC_API_KEY=           # Claude models
OPENAI_API_KEY=              # GPT models

# Optional
OPENROUTER_API_KEY=          # Alternative model provider
FIREWORKS_API_KEY=           # Llama models
GOOGLE_API_KEY=              # Gemini
GROQ_API_KEY=                # Fast inference + STT
FIRECRAWL_API_KEY=           # Web scraping

# Auth (must match frontend)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE=       # For server-side operations
```

### Frontend (`.env` in `apps/web`)
```bash
# Feature flags (enable/disable model providers)
NEXT_PUBLIC_OPENAI_ENABLED=true
NEXT_PUBLIC_ANTHROPIC_ENABLED=true
NEXT_PUBLIC_OPENROUTER_ENABLED=true
NEXT_PUBLIC_FIREWORKS_ENABLED=true
NEXT_PUBLIC_GEMINI_ENABLED=true
NEXT_PUBLIC_AZURE_ENABLED=false
NEXT_PUBLIC_OLLAMA_ENABLED=false
NEXT_PUBLIC_GROQ_ENABLED=false

# Supabase auth
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SUPABASE_URL_DOCUMENTS=    # Can be same as above
NEXT_PUBLIC_SUPABASE_ANON_KEY_DOCUMENTS=

# Optional services
GROQ_API_KEY=                # Transcription
FIRECRAWL_API_KEY=           # Web scraping

# Ollama (if enabled)
OLLAMA_API_URL=              # Defaults to http://host.docker.internal:11434
```

**Azure OpenAI**: Prefix all Azure variables with underscore: `_AZURE_OPENAI_API_KEY`, `_AZURE_OPENAI_API_DEPLOYMENT_NAME`, etc.

## Adding a New Model

From README - follow these steps:

1. Update model provider in `packages/shared/src/models.ts`
2. Install provider package in `apps/agents` (e.g., `@langchain/anthropic`)
3. Add to `getModelConfig()` in `apps/agents/src/agent/utils.ts`
4. Test thoroughly:
   - Generate new artifact (text and code)
   - Generate followup message
   - Update artifact via chat
   - Update artifact via quick action
   - Test both text and code artifacts

## LangGraph Configuration

`langgraph.json` defines all available graphs:
```json
{
  "graphs": {
    "agent": "./apps/agents/src/open-canvas/index.ts:graph",
    "reflection": "./apps/agents/src/reflection/index.ts:graph",
    "thread_title": "./apps/agents/src/thread-title/index.ts:graph",
    "summarizer": "./apps/agents/src/summarizer/index.ts:graph",
    "web_search": "./apps/agents/src/web-search/index.ts:graph"
  }
}
```

Each graph exports a `graph` constant that's a compiled StateGraph.

## Storage & Persistence

### LangGraph Store (via LangGraph SDK)
Persistent key-value store with namespaces:
```typescript
["memories", assistantId, "reflection"]    // User preferences/style
["context_documents"]                      // Uploaded documents
["custom_quick_actions"]                   // User-defined prompts
```

Accessed in agents via `store` parameter in LangGraphRunnableConfig.

### Supabase
- User authentication (email, Google, GitHub)
- Document storage (PDFs, text files)
- User sessions

## Common Development Workflows

### Adding a New Quick Action
1. Add UI in `apps/web/src/components/chat-interface/composer-actions-popout.tsx`
2. Add state field to `GraphInput` in `packages/shared/src/types.ts`
3. Rebuild shared: `cd packages/shared && yarn build`
4. Create node in `apps/agents/src/open-canvas/nodes/`
5. Add routing logic in `apps/agents/src/open-canvas/nodes/generatePath.ts`

### Adding a New Graph Node
1. Create `apps/agents/src/open-canvas/nodes/myNode.ts`:
```typescript
export const myNode = async (
  state: typeof OpenCanvasGraphAnnotation.State,
  config: LangGraphRunnableConfig
): Promise<OpenCanvasGraphReturnType> => {
  // Implementation
  return { messages: [...], artifact: {...} };
};
```
2. Import in `apps/agents/src/open-canvas/index.ts`
3. Add to StateGraph: `.addNode("myNode", myNode)`
4. Add edges: `.addEdge("someNode", "myNode")`

### Debugging Streaming Issues
1. Check LangGraph server logs (terminal running `yarn dev` in agents)
2. Browser DevTools → Network tab → Check streaming events
3. React DevTools → GraphContext → Inspect state
4. Console errors in Web Worker (browser console shows worker errors)

## Common Issues (from README)

### Thread ID errors / 500 errors
- Ensure LangGraph server is running (`cd apps/agents && yarn dev`)
- Each LangGraph server has its own database - clear `oc_thread_id_v2` cookie if switching servers
- Verify `LANGGRAPH_API_URL` points to correct port (default: `http://localhost:54367`)

### No text generation
- Clear `oc_thread_id_v2` cookie (thread ID from different server instance)
- Restart LangGraph server

### Model name missing error
- Ensure `customModelName` is set in `config.configurable` when invoking graph
- Check GraphContext passes model name correctly

## Quick Reference: Key Files

| Purpose | File Path |
|---------|-----------|
| Main graph | `apps/agents/src/open-canvas/index.ts` |
| Graph state | `apps/agents/src/open-canvas/state.ts` |
| Graph nodes | `apps/agents/src/open-canvas/nodes/*.ts` |
| Path routing | `apps/agents/src/open-canvas/nodes/generatePath.ts` |
| Model config | `apps/agents/src/agent/utils.ts` |
| Web search | `apps/agents/src/web-search/index.ts` |
| Streaming context | `apps/web/src/contexts/GraphContext.tsx` |
| Web worker | `apps/web/src/workers/graph-stream/stream.worker.ts` |
| Shared types | `packages/shared/src/types.ts` |
| Model definitions | `packages/shared/src/models.ts` |
| Constants | `packages/shared/src/constants.ts` |

## Key Dependencies

- **@langchain/langgraph** - Graph orchestration, state management
- **@langchain/langgraph-sdk** - Client for LangGraph API
- **@langchain/core** - LLM abstractions, tool calling
- **Next.js** - Frontend framework (App Router)
- **Supabase** - Auth & storage
- **@uiw/react-codemirror** - Code editor
- **@blocknote/react** - Markdown editor
- **Radix UI** - Component primitives
- **Turbo** - Monorepo build system
