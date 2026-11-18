# Step 0 — Frontend Contract Audit & Gap Resolution (`docs/CONTRACT-GAPS.md`)

## 1. Inspected Frontend Contract Files
We inspected the uploaded `dev-house-console-nextjs.zip` across:
- `src/lib/api/types.ts` — 24 domain interfaces and union types (`AutonomyMode`, `PlatformId`, `ContentStatus`, `NodeStatus`, `ProviderId`, `AgentRole`, `Workspace`, `Provider`, `Model`, `Agent`, `AgentPromptVersion`, `Workflow`, `WorkflowNode`, `WorkflowEdge`, `Run`, `RunStep`, `TranscriptSegment`, `Variant`, `ContentItem`, `Approval`, `Channel`, `Post`, `ApiToken`, `UsageRecord`, `AnalyticsSnapshot`, `BrandKit`, `AuditEvent`, `SystemService`, `DlqJob`, `LiveEventType`, `LiveBusEvent`).
- `src/lib/api/client.ts` — `DevHouseApiClient` interface (25 methods) switching on `process.env.NEXT_PUBLIC_API_MODE === "live"`.
- `src/lib/api/live/index.ts` — Base URL `process.env.NEXT_PUBLIC_API_URL ?? "https://api.devhouse.internal/v1"` (or `http://localhost:4000/api/v1` locally).
- `src/hooks/useLiveEvents.ts` & `public/dev-house-console.html` — Live SSE event bus consuming `LiveBusEvent` (`node.status`, `edge.packet`, `agent.token`, `tool.call`, `provider.fallback`, `cost.tick`, `run.status`).

---

## 2. Canonical REST & SSE Route Mapping for `DevHouseApiClient`

Every method in `src/lib/api/client.ts` is mapped to an exact Fastify route under `/api/v1` (and aliased at `/v1` so both `NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1` and `https://api.devhouse.internal/v1` resolve identically):

| `DevHouseApiClient` Method | HTTP Route | Request Payload / Params | Response Shape |
| :--- | :--- | :--- | :--- |
| `getWorkspace()` | `GET /api/v1/workspace` | Scoped by session / bearer token `workspace_id` | `Workspace` |
| `setAutonomyMode(mode)` | `PATCH /api/v1/workspace/autonomy` | `{ mode: AutonomyMode }` | `Workspace` |
| `togglePublishingKillSwitch(paused)` | `POST /api/v1/workspace/kill-switch` | `{ paused: boolean }` | `Workspace` |
| `getContentItems()` | `GET /api/v1/content` | Optional `?status=&platform=&q=` | `ContentItem[]` |
| `ingestVideo(payload)` | `POST /api/v1/ingest` | Multipart file, `{ url }`, or `{ title, source, durationSec }` | `ContentItem` |
| `getRuns()` | `GET /api/v1/runs` | Optional `?status=` | `Run[]` |
| `getRunById(id)` | `GET /api/v1/runs/:id` | `:id` path param | `Run` |
| `retryRunStep(runId, stepId)` | `POST /api/v1/runs/:id/steps/:stepId/retry` | `{}` | `Run` |
| `getApprovals()` | `GET /api/v1/approvals` | Optional `?status=` | `Approval[]` |
| `decideApproval(id, decision, fb)` | `POST /api/v1/approvals/:id/decide` | `{ decision, feedback? }` | `Approval` |
| `updateVariantCopy(cid, plat, body)` | `PATCH /api/v1/content/:id/variants/:platform` | `{ body, title? }` | `ContentItem` |
| `getPosts()` | `GET /api/v1/posts` | Optional `?month=&timezone=` | `Post[]` |
| `reschedulePost(postId, day, hour)` | `PATCH /api/v1/posts/:id/schedule` | `{ dayOfMonth, hour }` | `Post` |
| `getAgents()` | `GET /api/v1/agents` | None | `Agent[]` |
| `updateAgent(agentId, patch)` | `PATCH /api/v1/agents/:id` | `Partial<Agent>` (creates new `AgentPromptVersion`) | `Agent` |
| `getWorkflow()` | `GET /api/v1/workflows/default` | None | `Workflow` |
| `getProviders()` | `GET /api/v1/providers` | None (keys always masked, never raw) | `Provider[]` |
| `addProviderKey(id, rawKey, url)` | `POST /api/v1/providers/:id/keys` | `{ rawKey, baseUrl? }` (encrypted via AES-256-GCM) | `Provider` |
| `reorderProviderFallback(ids)` | `PUT /api/v1/providers/fallback-order` | `{ orderedIds: ProviderId[] }` | `Provider[]` |
| `getModels()` | `GET /api/v1/models` | None | `Model[]` |
| `getChannels()` | `GET /api/v1/channels` | None | `Channel[]` |
| `toggleChannelConnection(id)` | `POST /api/v1/channels/:id/toggle` | `{}` | `Channel` |
| `getAnalytics()` | `GET /api/v1/analytics` | None | `AnalyticsSnapshot` |
| `getUsageHistory()` | `GET /api/v1/usage` | None | `UsageRecord[]` |
| `getBrandKit()` | `GET /api/v1/brand-kit` | None | `BrandKit` |
| `updateBrandKit(patch)` | `PATCH /api/v1/brand-kit` | `Partial<BrandKit>` | `BrandKit` |
| `getApiTokens()` | `GET /api/v1/tokens` | None (only prefix returned) | `ApiToken[]` |
| `createApiToken(name, scopes, exp)` | `POST /api/v1/tokens` | `{ name, scopes, expiresAt }` | `{ token: ApiToken, plainSecret: string }` |
| `getAuditEvents()` | `GET /api/v1/audit` | Optional `?category=&limit=` | `AuditEvent[]` |
| `getSystemHealth()` | `GET /api/v1/system/health` | None | `{ services: SystemService[], dlq: DlqJob[] }` |
| `retryDlqJob(jobId)` | `POST /api/v1/system/dlq/:id/retry` | `{}` | `DlqJob[]` |
| **Live SSE Event Bus** | `GET /api/v1/events/stream` | `Accept: text/event-stream` | `LiveBusEvent` stream |

---

## 3. Identified Contract Gaps & Safe Defaults Chosen

1. **Gap 01 — `src/lib/api/live/index.ts` Partial Stub in Uploaded Frontend**:
   - *Observation*: In the uploaded frontend zip, `src/lib/api/live/index.ts` implemented `getWorkspace`, `getContentItems`, `getRuns`, and `getApprovals` via `apiFetch()`, while spreading `...mockApiClient` for the remaining 21 methods.
   - *Resolution*: Per `BACKEND_PROMPT.md` ("Do NOT edit the frontend except `.env.local`"), the backend implements **all 25 REST endpoints + SSE `/api/v1/events/stream` + `/mcp`** matching the exact paths and TypeScript return shapes, and also provides a drop-in runtime bridge so both `apiFetch` calls and SSE `EventSource` work seamlessly with zero UI edits.
2. **Gap 02 — Dual Path Prefix (`/v1/*` vs `/api/v1/*`)**:
   - *Observation*: `src/lib/api/live/index.ts` defaults `NEXT_PUBLIC_API_URL` to `https://api.devhouse.internal/v1`, whereas `BACKEND_PROMPT.md` item 4 specifies `POST /api/v1/ingest`.
   - *Resolution*: The Fastify API mounts all routes under both `/api/v1` and `/v1` prefixes. Setting `NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1` in `.env.local` satisfies both conventions without ambiguity.
3. **Gap 03 — Ingest Payload Flexibility (JSON Metadata vs Multipart Upload vs Remote URL Pull)**:
   - *Observation*: `DevHouseApiClient.ingestVideo` sends `{ title, source, durationSec }`, while `BACKEND_PROMPT.md` requires multipart/resumable upload, SSRF-protected URL pull, and watch-folder ingestion.
   - *Resolution*: `POST /api/v1/ingest` accepts `multipart/form-data` (binary video stream validated via `ffprobe`), `application/json` with `{ url, title?, source? }` (validated through the SSRF private-IP/DNS resolver guard), OR `application/json` with `{ title, source, durationSec }` (synthesizing a deterministic probe fixture when triggered from the UI's quick-drop simulation button). All three paths deduplicate by SHA-256 hash, persist a `ContentItem`, enqueue the media worker, and launch a durable `Run`.
4. **Gap 04 — Live Event Bus (`useLiveEvents`) SSE Event Format**:
   - *Observation*: The frontend expects `LiveBusEvent` objects with `type` in `["node.status", "edge.packet", "agent.token", "tool.call", "provider.fallback", "cost.tick", "run.status"]` and topology node IDs matching the 27 nodes on `/map` (`src_antigravity`, `gw_ingest`, `core_redis`, `med_ffmpeg`, `agt_director`, `prv_cf_gw`, `prv_gemini`, `prv_nvidia`, `gate_approval`, `pub_linkedin`, etc.).
   - *Resolution*: `GET /api/v1/events/stream` emits standard SSE frames (`event: message\ndata: <JSON LiveBusEvent>\n\n`) and named event frames (`event: <LiveEventType>\ndata: <JSON LiveBusEvent>\n\n`) using the exact 27 node IDs and 28 edge IDs from `/map`.
5. **Gap 05 — Publisher & Engagement Assistant Determinism**:
   - *Observation*: The frontend lists `Publisher` and `Engagement Assistant` among the 13 agents with primary/fallback model metadata. `BACKEND_PROMPT.md` specifies that `Publisher` must be deterministic (non-LLM) and `Engagement Assistant` must produce drafts only.
   - *Resolution*: In the backend agent engine (`packages/agents`), `Publisher` executes a deterministic state machine (checking approval signature, workspace `publishingPaused` kill-switch, and idempotent `platform_post_id` reconciliation without calling an LLM), while preserving the `Agent` metadata shape for the `/agents` screen. `Engagement Assistant` enforces a hard `draftOnly: true` guardrail so it can never invoke outbound social mutation endpoints.
