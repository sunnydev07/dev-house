# Dev House Console UI/UX Overhaul & Modern Component Architecture Plan (`ui-redesign-and-component-plan.md`)

> **Objective**: Transform the Dev House Agent Console (`frontend/` + `backend/` live stack) from a dense, over-saturated technical cockpit into a calm, high-velocity operator studio inspired by **Linear**, **Raycast**, and **Modern Creator Studios**, while preserving 1-click access to deep multi-agent telemetry, DAG traces, and MCP tooling via progressive disclosure.

## 1. Executive Summary & Forensic UI Audit

An end-to-end audit of the live application running at `http://localhost:3000` (backed by the Fastify + SSE + MCP server at `http://localhost:4000/api/v1`) identified three core UX bottlenecks that caused visual fatigue and hid primary creator workflows.

### 1.1 Before vs. After Architecture Snapshot

```text
BEFORE (High Cognitive Friction — Everything Competing on One Canvas):
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Header: QUIET WATCH · JAIPUR (IST) · 1 RUN STREAMING                                 │
│ "Good afternoon, Sunny. Four variants are waiting..." + 120-word provider debug dump │
│ [Review 4 Approvals] [Inspect Live Map] [Open Agent Theater]                         │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ Mini-Topology SVG (10 cryptic letter nodes: AG, DIR, LW, NIM, YW, GATE, IN, IG, YT)  │
│ 13 Agent Buttons (All printed at once with raw task strings taking 200px height)     │
│ 6 Pipeline Status Blocks (01·Ingested, 02·Analysing, 03·Writing, 04·Approval Gate)   │
│ 4 Live Run Ticker Items (Token counts, $0.194, source hashes, raw ID badges)         │
│ Upcoming Queue with slot collision warnings + 4 Provider p50 spend tiles             │
│ Video Dropzone with raw webhook signature specs                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘

AFTER (Linear / Raycast Precision — Progressive Disclosure & Action-First Hierarchy):
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Top Bar: Workspace Switcher · ● 13 Agents Online (1 Run) · Autonomy · Kill Switch    │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ Quick Ingest Action Bar: [ Drop 4K MP4/MOV or type content angle... ] [⚡ Generate ] │
│ At-a-Glance Pulse (3 Tremor KPI Tiles):                                              │
│   [ 4 Actions Required ]     [ 7 Scheduled Queue ]     [ $14.82 / $25.00 Spend ]     │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ Segmented Workspace Pill Tabs:                                                       │
│   ( ✦ Action Center & Social Previews )  ( ⚡ Quick Ingest )  ( 📅 Queue )  ( 🤖 Fleet )│
├──────────────────────────────────────────────────────────────────────────────────────┤
│ Active Tab Canvas (Default: Side-by-Side Authentic Social Previews + Live Counters): │
│  ┌─────────────────────────┬─────────────────────────┬────────────────────────────┐  │
│  │ Instagram Reel (9:16)   │ YouTube Watch (16:9)    │ LinkedIn Technical Post    │  │
│  │ • Hook <= 55 chars      │ • Title <= 62 chars     │ • Body <= 1,600 chars      │  │
│  │ • Caption <= 2,200 chars│ • 00:00 Clickable Chaps │ • Diff vs v-1 + Banned Linter│
│  │ • [Approve] [Edit]      │ • [Approve] [Schedule]  │ • [Approve & Publish]      │  │
│  └─────────────────────────┴─────────────────────────┴────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────────┘
  ↳ Clicking "Inspect Telemetry" on any card opens the Slide-Over Drawer (#global-right-sheet)
    with raw LLM token streams, Cloudflare AI Gateway 429->NIM failover logs, and JSON I/O.
```

### 1.2 Core Friction Points Resolved

1. **Information Overload & Zero Progressive Disclosure**:
   - *Problem*: The original Command Center rendered 13 agent cards, 6 pipeline counters, a 10-node SVG graph, 4 run logs, 4 provider latency boxes, 4 scheduled posts, and webhook instructions simultaneously.
   - *Fix*: Consolidated telemetry into a single clickable **Compact Fleet Health Pill** (`● 13 Agents Online · 1 Active Run`) that opens the **Slide-Over Technical Inspector Drawer** on demand, and organized the Command Center around **4 Segmented Workspace Pill Tabs** (`✦ Action Center & Social Previews`, `⚡ Quick Ingest & Create`, `📅 Publishing Queue & Calendar`, `🤖 Agent Fleet & Routing`).
2. **Competing Visual Anchors & Grid-Cage Borders**:
   - *Problem*: Warm brown-grey surfaces (`#0B0A09`, `#121110`) with high-contrast solid borders (`#26231F`) and tight `8–10px` gaps created a heavy "grid cage" effect.
   - *Fix*: Adopted a neutral **Linear / Raycast Obsidian Surface Elevation Ladder** (`#090A0F` canvas → `#121318` surface → `#181920` raised → `#1E2028` hover) with subtle `rgba(255, 255, 255, 0.08)` hairline borders, `20–24px` card padding, and `16–20px` zone spacing.
3. **Buried Primary Operator Workflow (Instagram, YouTube & LinkedIn Publishing)**:
   - *Problem*: Reviewing 9:16 Instagram Reels, 16:9 YouTube chapters/titles, and LinkedIn posts required navigating past developer debug logs.
   - *Fix*: Promoted **Action-First Social Previews** with **live inline editing and character-limit validation** (`dbStore.platformLimits`: Instagram `55`/`2200` chars, YouTube `62`/`5000` chars, LinkedIn `140`/`1600` chars) directly onto the default Command Center tab and `/approvals` split view.

## 2. Visual Foundation & Design Token Specification

All tokens are defined in `frontend/src/app/globals.css` and mirrored in `frontend/public/dev-house-console.html` across both Dark (default) and Light themes.

| CSS Variable | Dark Theme (Obsidian Hero) | Light Theme (Editorial Daylight) | Semantic Role |
| :--- | :--- | :--- | :--- |
| `--bg` | `#090A0F` | `#F7F8FA` | Primary application canvas background |
| `--surface` | `#121318` | `#FFFFFF` | Level 1 containers: Sidebar, header, primary cards |
| `--surface-raised` | `#181920` | `#F0F2F6` | Level 2 nested elements: Segmented pills, inputs, code blocks |
| `--surface-hover` | `#1E2028` | `#E6E9F0` | Interactive row/card hover elevation |
| `--border` | `rgba(255, 255, 255, 0.08)` | `rgba(15, 18, 28, 0.09)` | `1px` crisp hairline structural borders |
| `--border-strong` | `rgba(255, 255, 255, 0.14)` | `rgba(15, 18, 28, 0.16)` | Active focus rings and emphasized card outlines |
| `--text` | `#ECEEF4` | `#11131A` | Primary high-contrast typography (WCAG AAA) |
| `--text-muted` | `#8A8F9E` | `#5E6472` | Secondary labels, timestamps, metadata |
| `--accent` | `#F2A33A` | `#D47E17` | **Ember accent**: Primary CTAs, active tab bar, live breathing dot |
| `--success` | `#5EAD82` | `#2F7A54` | Passed Brand Gate (`>= 88/100`), healthy probes, published state |
| `--warning` | `#D4A74A` | `#9C7018` | Provider 429 fallback (`Gemini -> NIM`), slot conflict, kill-switch banner |
| `--danger` | `#D95C54` | `#B83A32` | Failed steps, DLQ errors, character-limit overrun, banned word match |
| `--info` | `#7895B2` | `#43617A` | MCP tool chips, scheduled badges |

## 3. Component Mapping Against Installed `frontend/package.json` Stack

Every pattern in this redesign maps directly to libraries already declared in `frontend/package.json` and the live backend contracts in `backend/packages/core/src/contracts.ts`:

| UI Zone | Installed Package / Pattern | Backend Contract & Endpoint Bound |
| :--- | :--- | :--- |
| **At-a-Glance Pulse (3 KPI Tiles)** | Tremor / Shadcn Stat Card + Progress Bar | `GET /api/v1/workspace`, `GET /api/v1/approvals`, `GET /api/v1/posts` |
| **Segmented Workspace Pill Tabs** | `@radix-ui/react-tabs` + `motion` pill bar | Client view state (`action_center`, `ingest`, `queue`, `fleet`) |
| **Quick Ingest Action Bar** | Minimalist floating bar + dropzone | `POST /api/v1/ingest` (SHA-256 dedup + FFmpeg/Whisper + 13-Agent DAG) |
| **Authentic Social Preview Cards** | 9:16 IG Reel Frame, 16:9 YT Player, LI Card | `PATCH /api/v1/content/:id/variants/:platform`, `POST /api/v1/approvals/:id/decide` |
| **Live Character & Guardrail Validator** | Inline counter against `platformLimitsConfig` | Validates IG (`55`/`2200`), YT (`62`/`5000`), LI (`140`/`1600`) + banned words |
| **Technical Inspector Drawer** | `vaul` / `@radix-ui/react-dialog` Right Sheet | `GET /api/v1/runs/:id`, `GET /api/v1/events/stream` (SSE live bus) |
| **Department-Grouped Agent Fleet** | 4-Department Card Grid + Prompt Studio | `GET /api/v1/agents`, `PATCH /api/v1/agents/:id`, `POST /api/v1/agents/:id/run` |
| **Global Command Palette (`Cmd+K`)** | `cmdk` + `react-hotkeys-hook` (`j`/`k`, `[`) | Instant keyboard navigation across all 15 routes and quick actions |
| **Toast Feedback System** | `sonner` non-blocking toast stack | Confirms approvals, key rotations, MCP token minting, and DLQ retries |

## 4. Re-Architected Information Hierarchy & Data Flow

```text
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ GLOBAL SHELL HEADER                                                                     │
│ [Dev House Core ▾]  [● 13 Agents Online · 1 Active Run]  [Autonomy: Gate]  [Kill Switch]│
└───────────────────────────────────────────┬─────────────────────────────────────────────┘
                                            │
        ┌───────────────────────────────────┼───────────────────────────────────┐
        ▼                                   ▼                                   ▼
┌───────────────────────┐       ┌───────────────────────┐       ┌─────────────────────────┐
│ 1. AT-A-GLANCE PULSE  │       │ 2. QUICK INGEST BAR   │       │ 3. SLIDE-OVER INSPECTOR │
│ • 4 Pending Approvals │       │ • 1-line prompt/drop  │       │ • Opened on demand only │
│ • 7 Scheduled Posts   │       │ • Triggers 13-agent   │       │ • Raw SSE token streams │
│ • $14.82 / $25.00 Cap │       │   DAG via POST /ingest│       │ • JSON I/O & 429 logs   │
└───────────┬───────────┘       └───────────┬───────────┘       └─────────────────────────┘
            │                               │
            └───────────────┬───────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ 4. SEGMENTED WORKSPACE TABS (Command Center Primary Canvas)                             │
├───────────────────────────┬───────────────────────────┬────────────────┬────────────────┤
│ Tab 1: ✦ Action Center    │ Tab 2: ⚡ Quick Ingest    │ Tab 3: 📅 Queue│ Tab 4: 🤖 Fleet│
│ • Switchable pending item │ • Drag-and-drop 4K MP4/MOV│ • Chronological│ • 13 Agents by │
│ • 3-column live previews: │ • Source selector         │   IST schedule │   4 departments│
│   - IG 9:16 Reel mockup   │ • Collapsible webhook &   │ • 1-click +1d  │ • Model badges │
│   - YT 16:9 + chapters    │   cURL developer specs    │   collision fix│   (Gemini 2.5) │
│   - LinkedIn + diff + edit│                           │                │ • Open Studio  │
└───────────────────────────┴───────────────────────────┴────────────────┴────────────────┘
```

## 5. Screen-by-Screen Redesign Specifications

### 5.1 Screen 1: Command Center (`/`)
- **Removed Clutter**:
  - Removed the 120-word provider failover narrative from the hero header.
  - Removed the static 10-node mini-topology SVG block and the 13-button horizontal text wall from the top fold.
  - Moved raw webhook/HMAC cURL documentation inside a collapsible `<details>` disclosure on the Ingest tab.
- **Added High-Velocity Operator Controls**:
  - **Compact Fleet Health Pill**: Header badge `● 13 Agents Online · 1 Active Run (run_9042_live)` that opens the Slide-Over Technical Inspector or navigates to `/map` on click.
  - **Quick Ingest Bar**: Top-of-page pill input allowing instant video title/angle submission to `POST /api/v1/ingest` plus a `Simulate 429 -> NIM Failover` toggle inside the inspector.
  - **3 Tremor-Style KPI Tiles**:
    1. *Actions Required*: Count of pending approvals at the gate (`4`), Brand Reviewer score badge (`94–98/100`), and 1-click jump to `/approvals`.
    2. *Publishing Queue*: Scheduled posts count (`7`), next IST slot (`Tue 09:30 IST`), and collision warning indicator (`1 conflict`).
    3. *Daily LLM Spend*: `$14.82 / $25.00` (`59%`) with smooth progress bar and active provider p50 summary (`Gemini 2.5 Pro · NIM Llama 3.3`).
  - **4 Segmented Pill Tabs**:
    - `✦ Action Center & Social Previews (Default)`: Selector pills for all pending approvals (`apr_01`..`apr_04`) + 3-column authentic social cards (Instagram 9:16 Reel, YouTube 16:9 Watch + Chapters, LinkedIn Post) with **inline copy editing, live character count validation (`1600` / `2200` / `62` chars), and 1-click Approve & Publish / Schedule / Regenerate**.
    - `⚡ Quick Ingest & Create`: Focused drag-and-drop MP4/MOV card + collapsible webhook/MCP CLI snippet.
    - `📅 Publishing Queue & Calendar`: Upcoming posts across LinkedIn, Instagram, and YouTube with 1-click `+1d` collision resolution and link to `/calendar`.
    - `🤖 Agent Fleet & Routing`: Department-grouped overview of all 13 agents + 6-Stage pipeline filter strip (`01 Ingested` → `06 Published`).

### 5.2 Screen 2: Approvals Inbox (`/approvals`)
- **Multi-Platform Split View**:
  - **Left Column (Queue)**: Keyboard-navigable (`j` / `k`) list of pending approvals with platform chips, submission timestamps, and Brand Reviewer compliance scores (`96/100`).
  - **Right Column (Interactive Social Previews & Live Character Meters)**:
    - **LinkedIn Card**: Editable title and post body with a live character meter (`len / 1,600 chars` turning `--danger` if exceeded), hashtag pills, CTA preview, and expandable side-by-side version diff (`- previousBody` vs `+ body`).
    - **Instagram Reel 9:16 Card**: Vertical phone safe-zone preview with editable first-frame hook (`len / 55 chars` live counter) and editable Reel caption (`len / 2,200 chars` live counter).
    - **YouTube Watch 16:9 Card**: Wireframe thumbnail preview, editable video title (`len / 62 chars` live counter), editable description (`len / 5,000 chars`), and timestamped chapters (`00:00` anchor verified).
  - **Sticky Action Header**: `Approve & Publish`, `Schedule (Tue 18:30)`, `Regenerate with feedback`, `Reject`, and `Bulk Approve All Pending`.

### 5.3 Screen 3: Runs & Agent Theater (`/runs` & `/runs/[id]`)
- **Clean Vertical Deployment Timeline (Swimlane Mode)**:
  - Each `RunStep` renders as a clean vertical timeline card with a numbered step badge, agent monogram avatar (`VA`, `DR`, `LW`, `IW`, `YW`, `BR`), model badge (`gemini-2.5-pro`, `nvidia-llama-3.3-70b (Fallback)`, `grok-3-mini`), token/cost pill, tool-call chips, and `Retry from step` action.
  - **Side-by-Side Input vs. Generated Output Diffing**: Collapsible payload inspector displaying the sanitized input brief/transcript alongside the structured JSON output.
- **DAG View & Critical-Path Gantt View**:
  - Preserves 1-click switching between `Agent Theater`, `DAG View`, and `Gantt Critical Path`.

### 5.4 Screen 4: Agent Crew & Prompt Studio (`/agents` & `/agents/[id]`)
- **Organized into 4 Functional Departments**:
  1. **01 · Intake & Analysis**: `Director` (`DR`), `Video Analyst` (`VA`), `Strategist` (`ST`).
  2. **02 · Platform Writers**: `LinkedIn Writer` (`LW`), `Instagram Writer` (`IW`), `YouTube Writer` (`YW`).
  3. **03 · Quality & Gatekeeping**: `SEO & Hashtag` (`SH`), `Thumbnail Concept` (`TC`), `Brand Reviewer` (`BR`).
  4. **04 · Publishing & Growth**: `Scheduler` (`SC`), `Publisher` (`PB` — deterministic non-LLM), `Analyst` (`AN`), `Engagement Assistant` (`EA` — draft-only).
- Each card displays the agent monogram, status badge, primary & fallback model badge (`gemini-2.5-pro` → `nvidia-llama-3.3-70b`), success rate, average cost per run, and opens the **Prompt & Schema Studio + Split-Pane Playground** below.

### 5.5 Screens 5–15: Cohesive Obsidian Surface Alignment
- **`/map` (Live System Topology)**: 8-lane, 24-node, 28-edge interactive canvas with animated SVG packet beams, layer toggles (`infra`, `agents`, `providers`, `channels`), replay timeline scrubber, accessible table view, and click-to-open node inspector drawer.
- **`/library` (Content Library)**: 30 engineering videos with status/platform/search filters, grid & table views, bulk approval, and click-to-seek transcript drawer.
- **`/calendar` (Publishing Schedule)**: Month, Week, and Agenda views with HTML5 drag-and-drop rescheduling across November 2026 and timezone switching (`Asia/Kolkata`, `UTC`, `America/Los_Angeles`).
- **`/workflows`, `/providers`, `/channels`, `/analytics`, `/brand`, `/connect`, `/settings`, `/system`, `/onboarding`**: Styled with the Obsidian Elevation Ladder (`#090A0F` / `#121318` / `#181920`) and wired to the live backend API and SSE event bus.

## 6. Implementation Status & Verification Checklist

### Phase 1: High-Impact Polish & De-Cluttering — COMPLETED & LIVE
- [x] **Linear/Raycast Obsidian Elevation Palette**: Applied across `frontend/src/app/globals.css` and `frontend/public/dev-house-console.html` (Dark + Light theme support).
- [x] **Progressive Disclosure Command Center**: Replaced debug text walls, static mini-SVG, and 13-agent button strip with the Compact Fleet Health Pill, Quick Ingest Action Bar, 3 Tremor KPI Cards, and 4 Segmented Workspace Pill Tabs.
- [x] **Department-Grouped Agent Crew Directory (`/agents`)**: Grouped all 13 agents into the 4 functional departments (`Intake & Analysis`, `Platform Writers`, `Quality & Gatekeeping`, `Publishing & Growth`) with `Gemini 2.5 Pro` / `NIM Llama 3.3` badges.

### Phase 2: Inline Validation, Payload Diffing & Live Full-Stack Sync — COMPLETED & LIVE
- [x] **Live Character-Count & Limit Validation**: Added real-time character counters (`updateLiveCharCounter`) on LinkedIn (`1,600` chars), Instagram Reel Hook (`55` chars) & Caption (`2,200` chars), and YouTube Title (`62` chars) & Description (`5,000` chars) in both the Command Center Action Center tab and `/approvals`.
- [x] **Side-by-Side Transcript vs. Output Diffing in Agent Theater (`/runs/[id]`)**: Enhanced step cards with clean visual timeline connectors and side-by-side input/output payload comparison.
- [x] **End-to-End Live Backend Synchronization**: All 25 REST endpoints, live SSE stream (`/api/v1/events/stream`), and 22 MCP tools (`/mcp`) synchronize seamlessly with the redesigned console UI.
