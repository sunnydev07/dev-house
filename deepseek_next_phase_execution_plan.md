# Dev House Full-Stack — Next-Phase Sequential Execution Plan for DeepSeek Agent (`deepseek-next-phase-execution-plan.md`)

> **Target Codebase**: `dev-house-fullstack` (from `dev-house-fullstack-live-fixed.zip`)
> **Execution Mode**: Single-Agent Sequential Vertical Tasks (Task 1 → Task 6)
> **Current Baseline**: All 15 core bugs fixed, all 25 REST routes + SSE `/api/v1/events/stream` + 22-tool `/mcp` server operational, and Phase 1 + Phase 2 Linear/Raycast Obsidian UI overhaul live in `frontend/public/dev-house-console.html` and `frontend/src/app/globals.css`.

## 1. What Is Already Completed vs. What Remains for Production Cutover

The table below summarizes what is already working in `dev-house-fullstack-live-fixed.zip` and the 6 high-impact engineering upgrades remaining for your DeepSeek agent to implement sequentially.

| Subsystem | Current Status in `dev-house-fullstack-live-fixed.zip` | Remaining Production Cutover Task for DeepSeek Agent |
| :--- | :--- | :--- |
| **1. Frontend Architecture (`frontend/src/`)** | 15 Next.js routes wrap `public/dev-house-console.html` via `<ConsoleWorkspace />` with full two-way `postMessage` + live REST/SSE sync. | **Task 1**: Extract the iframe screens into native Next.js 15 + React 19 components (`@xyflow/react`, `@radix-ui/react-tabs`, `vaul`, `cmdk`, `@monaco-editor/react`, `sonner`) wired directly to `useConsoleQueries.ts` and `useLiveEvents.ts`. |
| **2. Database Persistence (`backend/packages/db/`)** | Drizzle schema (`12` tables in `src/schema.ts`), `migrate.ts`, `seed.ts`, and in-memory `DevHouseRepository` (`src/store.ts` with 30 items, 12 runs, 4 approvals). | **Task 2**: Implement a write-through PostgreSQL 16 + `pgvector` Drizzle repository adapter (`src/pgRepository.ts`) that executes real SQL DDL and persists mutations when `DATABASE_URL` is connected. |
| **3. BYOK LLM Providers (`backend/packages/providers/`)** | Circuit breaker, multi-key vault rotation, daily budget hard-stop, 429 failover, and Zod JSON auto-repair loop work end-to-end using deterministic synthesized outputs. | **Task 3**: Decrypt real BYOK keys from `dbStore.vault` and invoke live upstream HTTP APIs (Gemini, NVIDIA NIM, xAI Grok, Cloudflare Workers AI, Cloudflare AI Gateway, Custom OpenAI) when a non-placeholder key is present. |
| **4. Media & BullMQ Worker (`backend/packages/media/`, `apps/worker/`)** | SHA-256 deduplication, SSRF guard, SRT/WebVTT subtitle formatting, DB-driven renditions, and `recoverInterruptedRuns()` work deterministically in-process. | **Task 4**: Wire real `child_process.execFile("ffprobe" / "ffmpeg")` stream inspection, 9:16 vertical crop, S3/Cloudflare R2 upload, and live BullMQ Redis queues (`ingest.media`, `agent.dag`, `publish.channel`, `dlq.failed`). |
| **5. Social Connectors (`backend/packages/connectors/`)** | Idempotent `publishLedger` state machine, Kill Switch check, character limit check, and YouTube 1,600-unit quota ledger work in `CONNECTOR_MODE=mock`. | **Task 5**: Implement the `CONNECTOR_MODE=live` HTTP dispatches for YouTube Data API v3 resumable upload, LinkedIn REST Posts API (`202411`), and Instagram Graph v21.0 Reels Containers using decrypted OAuth tokens. |
| **6. Outbound Webhooks & Alerts (`backend/packages/core/`)** | `RealtimeEventBus.signWebhookPayload()` signs HMAC-SHA256 payloads, and `.env.example` defines Telegram, Slack, and webhook secrets. | **Task 6**: Build `OutboundNotifierService` (`packages/core/src/notifiers.ts`) to dispatch signed webhooks (`X-DevHouse-Signature-256`), Telegram Bot messages, and Slack blocks on Approval Gate and Provider Fallback events. |

## 2. Sequential Execution Tasks for DeepSeek Agent

Feed the tasks below **one by one in order (Task 1 → Task 6)** to your DeepSeek CLI agent. Each task is self-contained, names exact file paths and functions, and includes a verification command before advancing.

### Task 1 — Native Next.js 15 / React 19 Component Extraction (`frontend/src/`)

- **Goal**: Replace the `<iframe src="/dev-house-console.html">` wrapper in `frontend/src/components/shell/ConsoleWorkspace.tsx` with native React 19 components using the packages already installed in `frontend/package.json` (`@tanstack/react-query`, `zustand`, `@xyflow/react`, `lucide-react`, `sonner`, `cmdk`, `vaul`) while keeping `/dev-house-console.html` as a standalone static fallback.
- **Files to Create / Update**:
  1. `frontend/src/components/shell/Providers.tsx`: Wrap the Next.js root layout in a `QueryClientProvider` (`@tanstack/react-query`) and `<Toaster />` (`sonner`).
  2. `frontend/src/app/layout.tsx`: Mount `<Providers>{children}</Providers>` inside `RootLayout`.
  3. `frontend/src/components/shell/AppShell.tsx`: Implement the left collapsible sidebar (`useUiStore.sidebarCollapsed`), top header bar (Workspace switcher, Compact Fleet Health Pill, Autonomy Mode cycle button calling `useSetAutonomyMutation()`, Emergency Kill Switch modal calling `useKillSwitchMutation()`, and Theme toggle), and `Cmd+K` Command Palette (`cmdk`).
  4. `frontend/src/components/dashboard/CommandCenterNative.tsx`: Implement the 3 Tremor KPI tiles (`useWorkspaceQuery`, `useApprovalsQuery`, `usePostsQuery`), the Quick Ingest Action Bar (`useIngestVideoMutation`), the 4 Segmented Pill Tabs, the 3-column social preview cards with live character-count meters (`55`/`2200` IG, `62`/`5000` YT, `1600` LinkedIn) calling `useUpdateVariantCopyMutation()` and `useDecideApprovalMutation()`, and the Slide-Over Telemetry Drawer (`vaul` / `@radix-ui/react-dialog`).
  5. `frontend/src/components/live/LiveMapCanvas.tsx`: Render the 8-lane, 24-node, 28-edge topology from `useWorkflowQuery()` and animate active edges from `useLiveEvents()` using `@xyflow/react` plus an accessible keyboard table toggle.
- **Verification**:
  - Run `pnpm --dir frontend typecheck && pnpm --dir frontend build` and verify zero TypeScript or Next.js build errors.

### Task 2 — Write-Through PostgreSQL 16 + `pgvector` Drizzle Repository (`backend/packages/db/`)

- **Goal**: Connect the 12 Drizzle ORM tables in `backend/packages/db/src/schema.ts` to a live PostgreSQL 16 + `pgvector` connection pool when `DATABASE_URL` is available, while preserving automatic fallback to the in-memory `DevHouseRepository` when running unit tests without Docker.
- **Files to Create / Update**:
  1. `backend/packages/db/src/migrate.ts`:
     - When `process.env.DATABASE_URL` is reachable via `pg.Pool`, execute `CREATE EXTENSION IF NOT EXISTS vector;` followed by idempotent `CREATE TABLE IF NOT EXISTS` statements matching every table and unique index (`content_workspace_hash_idx`, `publish_idempotency_idx`, `run_steps_run_id_idx`) in `src/schema.ts`.
  2. `backend/packages/db/src/seed.ts`:
     - Upsert (`ON CONFLICT DO NOTHING`) the initial workspace (`ws_devhouse_core`), 3 platform limit rows (`linkedin`, `instagram`, `youtube`), 6 encrypted BYOK providers, 13 agents, 30 content items, 12 runs, and 4 API tokens from `dbStore` into PostgreSQL.
  3. `backend/packages/db/src/pgRepository.ts`:
     - Export `PgWriteThroughBridge` using `drizzle(pool)` to persist mutations from `dbStore.recordAudit()`, `dbStore.addOrRotateProviderKey()`, `dbStore.createScopedApiToken()`, `dbStore.revokeApiToken()`, and `publishLedger.set()` asynchronously to PostgreSQL, plus a `queryBrandMemoryVectors(embedding: number[], topK = 3)` helper using cosine distance.
- **Verification**:
  - Run `pnpm --dir backend db:migrate && pnpm --dir backend db:seed && pnpm --dir backend test`.

### Task 3 — Live Upstream HTTP Calls in the 6 BYOK LLM Provider Adapters (`backend/packages/providers/src/index.ts`)

- **Goal**: Upgrade `LlmGateway.complete()` in `backend/packages/providers/src/index.ts` so that when a provider has a real user-supplied API key (not containing the seed demo marker `DevHouse` and `process.env.LLM_MODE !== "mock"`), it decrypts the active key from `dbStore.encryptedProviderKeys.get(providerId)` via `dbStore.vault.decrypt(envelope, "provider:" + providerId)` and performs a real upstream HTTP completion call with an 18-second timeout (`AbortSignal.timeout(18_000)`).
- **Exact Adapter Endpoints to Implement in `backend/packages/providers/src/index.ts`**:
  1. **`gemini` (`Google Gemini`)**:
     - `POST ${provider.baseUrl}/models/${model.id}:generateContent?key=${decryptedKey}`
     - Payload: `{ systemInstruction: { parts: [{ text: req.systemPrompt }] }, contents: [{ role: "user", parts: [{ text: req.userPrompt }] }], generationConfig: { temperature: req.temperature ?? 0.2, responseMimeType: "application/json" } }`.
  2. **`nvidia_nim`, `xai_grok`, `cf_ai_gateway`, `custom_openai` (OpenAI-Compatible Chat Completions)**:
     - `POST ${provider.baseUrl}/chat/completions` with header `Authorization: Bearer ${decryptedKey}`
     - Payload: `{ model: model.id, temperature: req.temperature ?? 0.2, response_format: { type: "json_object" }, messages: [{ role: "system", content: req.systemPrompt }, { role: "user", content: req.userPrompt }] }`.
  3. **`cf_workers_ai` (`Cloudflare Workers AI`)**:
     - `POST ${provider.baseUrl}/@cf/meta/llama-3.1-8b-instruct` with header `Authorization: Bearer ${decryptedKey}`
     - Payload: `{ messages: [{ role: "system", content: req.systemPrompt }, { role: "user", content: req.userPrompt }] }`.
  4. **Key Rotation & Circuit Breaker Integration**:
     - Use `this.circuits.get(providerId).keyRotationCursor % keyPool.length` to pick the active key from the encrypted key pool. On HTTP `429` or `5xx`, call `this.recordProviderFailure(providerId)` (which increments `keyRotationCursor` and opens the circuit after 3 failures) and automatically advance to the next candidate in `this.resolveCandidateModels()`.
  5. **Live `/providers/:id/test` Connectivity Probe**:
     - Update `LlmGateway.testConnection(providerId)` to measure real round-trip latency with a minimal 5-token ping when a real key is configured.
- **Verification**:
  - Run `pnpm --dir backend test` and verify both simulated 429 failover and live key decryption tests pass.

### Task 4 — Real FFmpeg / Whisper Subprocess Pipeline, S3/R2 Upload & BullMQ Worker Queues (`backend/packages/media/src/index.ts`, `backend/apps/worker/src/worker.ts`)

- **Goal**: Execute real `ffprobe` / `ffmpeg` binaries when a video file buffer or local path is ingested, upload generated keyframes/renditions to S3/Cloudflare R2 when `S3_ACCESS_KEY_ID` is configured, and bind BullMQ queues in `apps/worker/src/worker.ts`.
- **Files to Update**:
  1. `backend/packages/media/src/index.ts`:
     - Add `probeBinaryFileWithFfprobe(filePath: string): Promise<ProbedMediaMetadata>` using `node:child_process` `execFile("ffprobe", ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", filePath])`, falling back to `this.probeStream()` when no binary file is on disk.
     - Add `transcodeAspectRenditionsWithFfmpeg(filePath: string, contentId: string)` that reads `dbStore.platformLimits[platform].aspectRatio` (`9:16` crop filter `crop=ih*9/16:ih` for Instagram Reels, `16:9` scale for YouTube/LinkedIn) and extracts 4 keyframes (`-vf fps=1/30`).
  2. `backend/apps/worker/src/worker.ts`:
     - When `process.env.REDIS_URL` is reachable, initialize the 4 BullMQ workers (`ingest.media`, `agent.dag`, `publish.channel`, `analytics.pull`) and route exhausted jobs (`attempts >= 3`) into `dbStore.dlqJobs` (`dlq.failed`) while emitting a `node.status` event on `globalEventBus`.
     - Add a periodic 15-second supervisor interval calling `recoverInterruptedRuns()`.
- **Verification**:
  - Run `pnpm --dir backend typecheck && pnpm --dir backend test`.

### Task 5 — Live Social Connector OAuth 2.0 & Resumable Publishing (`backend/packages/connectors/src/index.ts`)

- **Goal**: Add the `CONNECTOR_MODE=live` execution branch inside `SocialConnectorsEngine.publishVariantIdempotent()` in `backend/packages/connectors/src/index.ts` while keeping `CONNECTOR_MODE=mock` as the default for zero-account testing.
- **Files to Update**:
  1. `backend/packages/connectors/src/index.ts`:
     - Decrypt the channel OAuth token envelope from `dbStore.encryptedChannelTokens.get(params.platform)` using `dbStore.vault.decrypt(envelope, "channel:" + params.platform)`.
     - **`youtube` (`CONNECTOR_MODE=live`)**:
       - Verify `ytChannel.quotaUsed + 1600 <= ytChannel.quotaLimit` before initiating network I/O.
       - Send `POST https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status` with `Authorization: Bearer ${accessToken}` and JSON metadata `{ snippet: { title: params.variant.title, description: params.variant.body, tags: params.variant.hashtags }, status: { privacyStatus: "public" } }`, extract the `Location` resumable session URI, and store the returned video `id` in `publishLedger`.
     - **`linkedin` (`CONNECTOR_MODE=live`)**:
       - Send `POST https://api.linkedin.com/rest/posts` with headers `Authorization: Bearer ${accessToken}`, `LinkedIn-Version: 202411`, and `X-Restli-Protocol-Version: 2.0.0`, reading `x-restli-id` as `platformPostId`.
     - **`instagram` (`CONNECTOR_MODE=live`)**:
       - Execute the two-step Instagram Graph API v21.0 Reels workflow: `POST https://graph.facebook.com/v21.0/${igUserId}/media` (`media_type: "REELS"`, `caption: params.variant.body`), poll `GET /${containerId}?fields=status_code` until `FINISHED`, then call `POST /${igUserId}/media_publish` (`creation_id: containerId`).
- **Verification**:
  - Add a unit test in `backend/tests/backend-e2e.test.ts` mocking global `fetch` when `CONNECTOR_MODE=live` to verify headers, quota deduction, and idempotent `publishLedger` replay.

### Task 6 — Outbound HMAC-Signed Webhooks & Telegram / Slack Alert Notifiers (`backend/packages/core/src/notifiers.ts`)

- **Goal**: Deliver real-time outbound notifications when a run reaches `awaiting_approval`, fails over across LLM providers (`provider.fallback`), or engages the global Kill Switch.
- **Files to Create / Update**:
  1. `backend/packages/core/src/notifiers.ts`:
     - Create `OutboundNotifierService` with:
       - `sendSignedWebhook(url: string, event: LiveBusEvent)`: Serializes `event` to JSON, signs it with `RealtimeEventBus.signWebhookPayload(json, process.env.WEBHOOK_SIGNING_SECRET ?? "whsec_devhouse_hmac_sha256_key")`, and sends `POST` with header `X-DevHouse-Signature-256`.
       - `sendTelegramAlert(summary: string)`: If `process.env.TELEGRAM_BOT_TOKEN` and `process.env.TELEGRAM_CHAT_ID` are set, sends `POST https://api.telegram.org/bot${token}/sendMessage`.
       - `sendSlackAlert(summary: string)`: If `process.env.SLACK_WEBHOOK_URL` is set, posts a formatted block payload.
  2. `backend/packages/core/src/index.ts`: Export `* from "./notifiers.js"`.
  3. `backend/packages/agents/src/index.ts` & `backend/packages/providers/src/index.ts`: Trigger `outboundNotifier.notifyApprovalStaged(newApproval)` when a run reaches the Human Approval Gate and `outboundNotifier.notifyProviderFallback(...)` when a primary LLM provider fails over.
- **Verification**:
  - Add a test in `backend/tests/backend-e2e.test.ts` verifying `RealtimeEventBus.signWebhookPayload()` produces a deterministic `sha256=<64-hex>` signature and `OutboundNotifierService` formats Telegram/Slack/Webhook payloads cleanly.

## 3. Copy-Paste Windows PowerShell Launch Commands (Sequential Single-Agent Execution)

Run these commands sequentially in **Windows PowerShell** from the extracted `dev-house-fullstack` directory using your DeepSeek CLI agent (or `gemini` / `claude` / `agy`):

```powershell
# 0. Enter project root and verify baseline tests pass
cd .\dev-house-fullstack
pnpm install
pnpm test

# Task 1: Extract Native Next.js 15 / React 19 Components from Iframe Runtime
deepseek "Read frontend/ui-redesign-and-component-plan.md and DEEPSEEK_EXECUTION_PLAN.md. Execute Task 1 ONLY: create frontend/src/components/shell/Providers.tsx, AppShell.tsx, CommandCenterNative.tsx, and LiveMapCanvas.tsx wired to useConsoleQueries.ts and useLiveEvents.ts while keeping /dev-house-console.html as fallback. Run pnpm --dir frontend typecheck to verify."

# Task 2: Wire Drizzle ORM PostgreSQL 16 + pgvector Write-Through Repository
deepseek "Read DEEPSEEK_EXECUTION_PLAN.md. Execute Task 2 ONLY: implement backend/packages/db/src/pgRepository.ts and upgrade backend/packages/db/src/migrate.ts and seed.ts so mutations write through to PostgreSQL when DATABASE_URL is reachable and fall back to in-memory DevHouseRepository offline. Run pnpm --dir backend test to verify."

# Task 3: Wire Live Upstream HTTP Fetch Calls in the 6 BYOK LLM Provider Adapters
deepseek "Read DEEPSEEK_EXECUTION_PLAN.md. Execute Task 3 ONLY: update backend/packages/providers/src/index.ts to decrypt BYOK keys from dbStore.vault and call live Gemini, NVIDIA NIM, xAI Grok, Cloudflare Workers AI, Cloudflare AI Gateway, and Custom OpenAI endpoints when a non-seed key is configured, preserving circuit breaker, key rotation, and Zod JSON auto-repair. Run pnpm --dir backend test to verify."

# Task 4: Wire FFmpeg/FFprobe Subprocess Pipeline & BullMQ Worker Queues
deepseek "Read DEEPSEEK_EXECUTION_PLAN.md. Execute Task 4 ONLY: add ffprobe/ffmpeg binary execution with graceful fallback in backend/packages/media/src/index.ts and wire BullMQ Redis queues + 15s crash-recovery supervisor in backend/apps/worker/src/worker.ts. Run pnpm --dir backend typecheck and pnpm --dir backend test."

# Task 5: Wire CONNECTOR_MODE=live OAuth 2.0 Social Publishing Calls
deepseek "Read DEEPSEEK_EXECUTION_PLAN.md. Execute Task 5 ONLY: implement the CONNECTOR_MODE=live HTTP publishing branches for YouTube Data API v3 resumable uploads, LinkedIn REST Posts API (202411), and Instagram Graph v21.0 Reels containers in backend/packages/connectors/src/index.ts using decrypted channel tokens from dbStore.vault. Add tests in backend/tests/backend-e2e.test.ts and run pnpm --dir backend test."

# Task 6: Wire Outbound HMAC-Signed Webhooks & Telegram/Slack Alert Notifiers
deepseek "Read DEEPSEEK_EXECUTION_PLAN.md. Execute Task 6 ONLY: create backend/packages/core/src/notifiers.ts (OutboundNotifierService with X-DevHouse-Signature-256 HMAC signing, Telegram Bot, and Slack webhook alerts), export it from packages/core/src/index.ts, hook it into packages/agents and packages/providers, and verify with pnpm test && pnpm typecheck."
```
