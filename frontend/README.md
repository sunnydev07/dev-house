# Dev House Console

> *"A lit window in a quiet house at night."*  
> Multi-agent video-to-social orchestration console, live topology visualizer (`/map`), and Model Context Protocol (MCP) gateway.

---

## 1. How to Run Locally

### Prerequisites
- **Node.js** `>= 20.x`
- **pnpm** `>= 9.x`

### Commands
```bash
# 1. Install dependencies
pnpm install

# 2. Run in development mode (defaults to rich in-memory mock store + SSE event simulator)
pnpm dev

# 3. Run strict TypeScript check, ESLint, and production build
pnpm typecheck
pnpm lint
pnpm build
pnpm start
```

Open `http://localhost:3000` (or preview `dev-house-console.html` directly in Canvas).

---

## 2. Switching Between Mock Mode and Live Backend API (`NEXT_PUBLIC_API_MODE`)

The entire UI reads and mutates data through a single typed contract in `src/lib/api/client.ts` (`DevHouseApiClient`) and consumes real-time telemetry from `src/hooks/useLiveEvents.ts`.

| Variable | Default | Description |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_API_MODE` | `mock` | Set to `mock` for the in-memory seed store (~30 content items, 12 runs, 13 agents, 6 providers, live SSE event loop) or `live` for your backend server. |
| `NEXT_PUBLIC_API_URL` | `https://api.devhouse.internal/v1` | Base REST + SSE endpoint (`GET /v1/events/stream`) used when `NEXT_PUBLIC_API_MODE=live`. |

```bash
# Example .env.local for connecting to the live backend & MCP server
NEXT_PUBLIC_API_MODE=live
NEXT_PUBLIC_API_URL=https://api.devhouse.internal/v1
```

---

## 3. Project Structure

```text
dev-house-console/
├── PLAN.md                         # Architecture & build order specification
├── README.md                       # Setup guide, tokens, libraries & assumptions
├── package.json                    # Next.js 15, React 19, Tailwind v4, @xyflow/react, etc.
├── tsconfig.json                   # Strict TypeScript (noImplicitAny, noUncheckedIndexedAccess)
├── public/
│   └── favicon.svg                 # Roofline + single lit ember window icon
└── src/
    ├── app/
    │   ├── globals.css             # CSS variable token definitions (Dark hero + Light theme)
    │   ├── layout.tsx              # Instrument Serif, Geist Sans, Geist Mono font loader
    │   ├── error.tsx               # Fault boundary with copyable Request ID
    │   ├── page.tsx                # 1. Command Center (/)
    │   ├── map/page.tsx            # Signature Screen: Live Map (/map)
    │   ├── library/page.tsx        # 2. Content Library (/library)
    │   ├── runs/page.tsx           # 3. Runs Queue (/runs)
    │   ├── runs/[id]/page.tsx      # Agent Theater, DAG & Gantt Critical Path (/runs/[id])
    │   ├── approvals/page.tsx      # 4. Human Approval Gate (/approvals)
    │   ├── calendar/page.tsx       # 5. Publishing Calendar (/calendar)
    │   ├── agents/page.tsx         # 6. Agent Crew Directory (/agents)
    │   ├── agents/[id]/page.tsx    # Prompt Studio, Schema Editor & Playground (/agents/[id])
    │   ├── workflows/page.tsx      # 7. Workflow DAG Canvas (/workflows)
    │   ├── providers/page.tsx      # 8. BYOK Models, Keys & Fallback Routing (/providers)
    │   ├── channels/page.tsx       # 9. LinkedIn, Instagram & YouTube OAuth (/channels)
    │   ├── analytics/page.tsx      # 10. Telemetry Heatmap, Analyst Feed & CSV Export (/analytics)
    │   ├── brand/page.tsx          # 11. Brand Kit & Voice Guardrail Linter (/brand)
    │   ├── connect/page.tsx        # 12. MCP Token Manager, Client Snippets & Tool Tester (/connect)
    │   ├── settings/page.tsx       # 13. Workspace, RBAC, Webhooks & Security (/settings)
    │   ├── system/page.tsx         # 14. Service Health & Dead-Letter Queue (/system)
    │   └── onboarding/page.tsx     # 15. 6-Step First-Run Setup Wizard (/onboarding)
    ├── components/
    │   ├── brand/DevHouseLogo.tsx  # Inline SVG roofline + lit ember window component
    │   └── shell/ConsoleWorkspace.tsx
    ├── hooks/
    │   └── useLiveEvents.ts        # Single-source-of-truth SSE simulator & replay scrubber
    └── lib/
        └── api/
            ├── types.ts            # End-to-end domain types
            ├── client.ts           # Swappable mock/live client interface
            ├── mock/index.ts       # In-memory mutable store
            └── live/index.ts       # Live fetch + SSE adapter
```

---

## 4. Design Tokens (CSS Variables Only)

Never hardcode hex values inside components; all surfaces, borders, and semantic states reference CSS variables in `src/app/globals.css`:

| Token | Dark (Default Hero) | Light Theme | Usage |
| :--- | :--- | :--- | :--- |
| `--bg` | `#0B0A09` | `#F6F3EE` | Primary canvas background |
| `--surface` | `#121110` | `#EFECE6` | Cards, sidebar, header, drawers |
| `--surface-raised` | `#1A1816` | `#E5E0D8` | Elevated cards, active pills, modals |
| `--border` | `#26231F` | `#D5CFC4` | 1px hairline structural dividers |
| `--text` | `#EDE8E1` | `#181614` | High-contrast primary copy (WCAG AA+) |
| `--text-muted` | `#8F877C` | `#6E665C` | Secondary metadata, labels, timestamps |
| `--accent` (Ember) | `#F2A33A` | `#D47E17` | **Single accent**: primary action, active nav marker, live breathing dot |
| `--success` | `#6FA287` | `#3E7B5B` | Healthy probes, passed brand gate, published status |
| `--warning` | `#C9A24B` | `#9E741E` | Rate-limit fallback, slot conflicts, kill-switch banner |
| `--danger` | `#D0594F` | `#B43E34` | Failed steps, DLQ errors, hard guardrail rejections |
| `--info` | `#7E93A8` | `#4A657D` | Tool call chips, scheduled badges |

---

## 5. Component Libraries & Stack Decisions

- **Base UI & Styling**: Next.js (App Router) + TypeScript strict (`noImplicitAny`, `strictNullChecks`), Tailwind v4 (`@tailwindcss/postcss`), `shadcn/ui` + Radix primitives, `lucide-react`.
- **Topology & Graphs**: `@xyflow/react` for `/map` and `/workflows`, `@dagrejs/dagre` for DAG auto-layout in Agent Theater, `d3-scale` + `d3-shape` for critical-path Gantt timelines, sparklines, and the IST engagement heatmap.
- **Restrained Polish**: SVG `animateMotion` packet beams (Magic UI Animated Beam pattern) on active `/map` edges, ticking token/cost counters, and slow CSS ember breathing rings (`prefers-reduced-motion` honoured globally).
- **State & Data**: `@tanstack/react-query` for async data and optimistic mutations, `@tanstack/react-table` + `@tanstack/react-virtual` for queues and logs, `zustand` for UI-only state, `nuqs` for URL state, `cmdk` for `Cmd/Ctrl+K`, `sonner` for toasts, `react-hook-form` + `zod` for validated forms, `@monaco-editor/react` (dynamic import) for prompt/schema editing.

---

## 6. Documented Engineering & Design Assumptions

1. **Deterministic 8-Lane Topology on `/map`**: To guarantee zero layout jitter when nodes change state or stream tokens, `/map` uses a hand-tuned 8-lane coordinate system (`01 Sources` → `02 Gateway` → `03 Core` → `04 Media` → `05 Agent Crew` → `06 Providers` → `07 Approval Gate` → `08 Publishers`) with an accessible keyboard-operable **Accessible Table** toggle for screen readers and keyboard-only operators.
2. **Cloudflare AI Gateway Fallback Simulation**: In the live event simulator (`useLiveEvents`), step 7 intentionally simulates an `HTTP 429` burst limit on `Google Gemini 2.5 Pro` during `LinkedIn Writer` execution and demonstrates automatic zero-downtime failover to `NVIDIA NIM (Llama 3.3 70B)` via a dashed ember fallback edge.
3. **One-Time Secret Reveal**: Both BYOK provider keys (`/providers`) and minted MCP bearer tokens (`/connect`) display the raw secret at most once during creation and permanently mask all stored keys (`AIzaSyD9••••••••••••••••••••••8kQ1`, `dh_live_99a8••••••4f12`).
4. **Default Timezone & Scheduling Windows**: Defaulted to `Asia/Kolkata (IST +05:30)` per workspace configuration, with a live switcher for `UTC` and `America/Los_Angeles`.
5. **Strict Editorial Restraint**: All seed copy, agent outputs, and UI empty states enforce the Brand Kit rule of zero exclamation marks, zero emoji icons, and concrete engineering benchmarks.
