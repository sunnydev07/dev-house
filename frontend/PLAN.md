# PLAN.md — Dev House Console Architecture & Build Plan

## 1. Product Vision & Aesthetic Direction
**Dev House Console** is an AI agent orchestration and publishing platform that ingests video streams from automation (Antigravity, MCP clients, or manual drop), runs a 13-agent LLM crew across bring-your-own-key providers (Google Gemini, NVIDIA NIM, xAI Grok, Cloudflare Workers AI, Cloudflare AI Gateway, Custom OpenAI-compatible), enforces a human-in-the-loop approval gate, and publishes tailored variants to LinkedIn, Instagram, and YouTube.

### Design Metaphor: *"A lit window in a quiet house at night"*
- **Dark-First Token System** (CSS Variables in `globals.css`, mirrored in Light mode):
  - `--bg`: `#0B0A09` (Light: `#F7F4EF`)
  - `--surface`: `#121110` (Light: `#EFECE6`)
  - `--surface-raised`: `#1A1816` (Light: `#E6E1D9`)
  - `--border`: `#26231F` (Light: `#D5CFC4`)
  - `--text`: `#EDE8E1` (Light: `#181614`)
  - `--text-muted`: `#8F877C` (Light: `#6E665C`)
  - `--accent` (Ember): `#F2A33A` (Light: `#D47E17`)
  - `--success`: `#6FA287` | `--warning`: `#C9A24B` | `--danger`: `#D0594F` | `--info`: `#7E93A8`
- **Typography**:
  - `Instrument Serif` — rare editorial display moments (Command Center greeting, Onboarding hero).
  - `Geist Sans` — crisp UI controls, tables, navigation, and prose.
  - `Geist Mono` — run IDs, token meters, streaming logs, latencies, JSON schemas, and prompts.
- **Restraint Rules**:
  - Zero purple/blue AI gradients, zero glassmorphism clutter, zero stock illustrations, zero emojis as icons, zero exclamation marks in copy.
  - Platform colors (LinkedIn `#5B89B4`, Instagram `#B86B77`, YouTube `#C45A52`) appear strictly inside small muted `PlatformChip` badges.
  - Motion is 200–400ms eased and purposeful; running nodes and agents display a slow "breathing" ember dot (`prefers-reduced-motion` disables travelling packets and animations).

---

## 2. Target Repository File Tree (`dev-house-console/`)

```text
dev-house-console/
├── PLAN.md
├── README.md
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── next.config.ts
├── postcss.config.mjs
├── public/
│   └── favicon.svg
└── src/
    ├── app/
    │   ├── globals.css
    │   ├── layout.tsx
    │   ├── error.tsx
    │   ├── page.tsx                    # 1. Command Center (/)
    │   ├── map/
    │   │   └── page.tsx                # Signature Screen: Live Map (/map)
    │   ├── library/
    │   │   └── page.tsx                # 2. Content Library (/library)
    │   ├── runs/
    │   │   ├── page.tsx                # 3. Runs Queue (/runs)
    │   │   └── [id]/
    │   │       └── page.tsx            # Run Detail + Agent Theater (/runs/[id])
    │   ├── approvals/
    │   │   └── page.tsx                # 4. Approvals Inbox (/approvals)
    │   ├── calendar/
    │   │   └── page.tsx                # 5. Publishing Calendar (/calendar)
    │   ├── agents/
    │   │   ├── page.tsx                # 6. Agent Crew Directory (/agents)
    │   │   └── [id]/
    │   │       └── page.tsx            # Agent Prompt & Schema Studio (/agents/[id])
    │   ├── workflows/
    │   │   └── page.tsx                # 7. Workflow DAG Canvas (/workflows)
    │   ├── providers/
    │   │   └── page.tsx                # 8. Models, BYOK Keys & Routing (/providers)
    │   ├── channels/
    │   │   └── page.tsx                # 9. Social Channels & OAuth (/channels)
    │   ├── analytics/
    │   │   └── page.tsx                # 10. Multi-Channel Analytics (/analytics)
    │   ├── brand/
    │   │   └── page.tsx                # 11. Brand Kit & Voice Playground (/brand)
    │   ├── connect/
    │   │   └── page.tsx                # 12. MCP Gateway & Connect (/connect)
    │   ├── settings/
    │   │   └── page.tsx                # 13. Workspace & Security Settings (/settings)
    │   ├── system/
    │   │   └── page.tsx                # 14. System Health & DLQ (/system)
    │   └── onboarding/
    │       └── page.tsx                # 15. 6-Step First-Run Wizard (/onboarding)
    ├── components/
    │   ├── brand/
    │   │   └── DevHouseLogo.tsx        # Inline SVG roofline + lit ember window
    │   ├── shell/
    │   │   ├── AppShell.tsx            # Collapsible sidebar + top bar + kill switch banner
    │   │   ├── Header.tsx              # Autonomy badge, kill switch, notifications, theme
    │   │   ├── Sidebar.tsx             # Grouped navigation with live /map ember dot
    │   │   └── CommandPalette.tsx      # Cmd/Ctrl+K global palette
    │   ├── shared/
    │   │   ├── StatusBadge.tsx
    │   │   ├── PlatformChip.tsx
    │   │   ├── Stat.tsx
    │   │   ├── DataTable.tsx
    │   │   ├── EmptyState.tsx
    │   │   ├── PageHeader.tsx
    │   │   ├── JsonViewer.tsx
    │   │   ├── CostBadge.tsx
    │   │   └── MiniTopology.tsx        # Reusable mini connection graph
    │   └── live/
    │       ├── LiveMapCanvas.tsx       # Full-bleed @xyflow/react lane topology + SVG beams
    │       ├── AgentTheater.tsx        # Swimlanes, DAG view, Gantt critical-path timeline
    │       └── PresenceStrip.tsx       # 13-agent monogram glyph strip with breathing rings
    ├── hooks/
    │   ├── useLiveEvents.ts            # Single source of truth SSE simulator & state bus
    │   └── useConsoleQueries.ts        # TanStack Query hooks + mutations
    ├── store/
    │   └── uiStore.ts                  # Zustand UI state (sidebar, theme, kill-switch, active modals)
    └── lib/
        └── api/
            ├── types.ts                # End-to-end strict TypeScript domain interfaces
            ├── client.ts               # Unified API interface switching mock vs live
            ├── mock/
            │   ├── index.ts            # In-memory mutable mock implementation
            │   └── seed.ts             # 30 content items, 12 runs, 13 agents, 6 providers, etc.
            └── live/
                └── index.ts            # Fetch + EventSource live backend adapter
```

---

## 3. Component & Data Architecture

### 3.1 Domain Types (`src/lib/api/types.ts`)
- `Workspace`, `AutonomyMode` (`manual` | `approve_before_publish` | `auto`)
- `Provider` (`gemini`, `nvidia_nim`, `xai_grok`, `cf_workers_ai`, `cf_ai_gateway`, `custom_openai`)
- `Model` (capability tags, context window, input/output price per 1M tokens)
- `Agent` (13 crew members: Director, Video Analyst, Strategist, LinkedIn Writer, Instagram Writer, YouTube Writer, SEO & Hashtag, Thumbnail Concept, Brand Reviewer, Scheduler, Publisher, Analyst, Engagement Assistant)
- `Workflow`, `WorkflowNode`, `WorkflowEdge`
- `Run`, `RunStep`, `LiveEvent` (`node.status`, `edge.packet`, `agent.token`, `tool.call`, `provider.fallback`, `cost.tick`, `run.status`)
- `ContentItem` (~30 items across `ingested`, `analysing`, `writing`, `awaiting_approval`, `scheduled`, `published`, `failed`)
- `Variant` (LinkedIn post, Instagram Reel caption/frame, YouTube title/description/chapters/thumbnail)
- `Channel`, `Post`, `Approval`, `ApiToken`, `UsageRecord`, `AnalyticsSnapshot`, `BrandKit`, `AuditEvent`, `SystemService`, `DlqJob`

### 3.2 Event Bus (`useLiveEvents`)
- Drives `/map`, `/runs/[id]` (Agent Theater), `/` (Command Center ticker & presence strip), and `/connect` (live MCP tool calls).
- Simulates a continuous realistic multi-agent storyline:
  1. Video arrives from `Antigravity` automation (`ag-stream-904.mp4`) → `Ingest API` → `R2 Storage` + `FFmpeg` + `Whisper Transcription`.
  2. `Director` dispatches `Video Analyst` & `Strategist`.
  3. Fan-out in parallel to `LinkedIn Writer` (Gemini 2.5 Pro), `Instagram Writer` (xAI Grok-3), and `YouTube Writer` (Gemini 2.5 Pro).
  4. Injects realistic resilience events: `Google Gemini` hits HTTP 429 rate-limit → automatic fallback via `Cloudflare AI Gateway` to `NVIDIA NIM (Llama-3.3-70B)` (edge turns dashed warning amber).
  5. `Brand Reviewer` & `SEO & Hashtag` validate output against Brand Kit guardrails.
  6. Hits `Human Approval Gate` → `Publisher` dispatches to LinkedIn, Instagram, and YouTube (with simulated retry recovery).

---

## 4. Build Order Execution
1. **Phase 1**: Tokens, fonts, inline SVG logo (`DevHouseLogo`), App Shell, global `Cmd/Ctrl+K` Command Palette, Kill Switch, and Autonomy switcher.
2. **Phase 2**: Typed data layer (`types.ts`, `seed.ts`, `client.ts`) and `useLiveEvents()` deterministic + interactive event bus simulator.
3. **Phase 3**: Signature `/map` Live Map (8 fixed lanes, 27 nodes, animated SVG beams, node inspector Sheet, replay scrubber, layer toggles, accessible Table view) & `/runs/[id]` Agent Theater (Swimlanes, DAG, Gantt).
4. **Phase 4**: Screens 1–14 + 6-step `/onboarding` wizard with full interactive mutations (approve/reject/diff, drag-reschedule calendar, prompt studio & playground, workflow canvas, BYOK key creation & fallback reordering, MCP token generator with one-time secret reveal).
5. **Phase 5**: Verification, responsive audit (390px mobile + desktop), `README.md`, Next.js project packaging, and Canvas preview delivery.
