# Architecture & Engineering Decisions (`docs/DECISIONS.md`)

All autonomous architecture, security, data modeling, and operational decisions made during the Dev House Backend build are recorded below.

---

## ADR-001: pnpm Monorepo Topology under `/backend`
- **Decision**: Organize the backend as a strict TypeScript (`ES2022`, `moduleResolution: "bundler"`, `noImplicitAny: true`, `strictNullChecks: true`) pnpm workspace under `/backend` with two deployable apps and seven domain packages:
  - `apps/api`: Fastify v5 + Zod + `@fastify/swagger` OpenAPI 3.1 server, cookie/bearer auth middleware, SSE event broadcaster (`/api/v1/events/stream`), and Streamable HTTP MCP endpoint (`/mcp`).
  - `apps/worker`: BullMQ worker daemon running four isolated queues (`ingest.media`, `agent.dag`, `publish.channel`, `analytics.pull`) plus a dead-letter queue (`dlq.failed`) and crash-recovery supervisor.
  - `packages/core`: Shared Zod contract schemas derived 1:1 from the frontend's `src/lib/api/types.ts`, AES-256-GCM vault, Argon2id password/token hashing, RFC 6238 TOTP 2FA, SSRF URL validator, and typed event bus.
  - `packages/db`: Drizzle ORM + PostgreSQL 16 + `pgvector` schema, migrations, and deterministic seed loader matching the frontend's 30 content items, 12 runs, 13 agents, 6 providers, 3 channels, brand kit, and audit events.
  - `packages/providers`: Unified LLM Gateway interface with 6 adapters (Google Gemini, NVIDIA NIM, xAI Grok, Cloudflare Workers AI, Cloudflare AI Gateway base-URL proxy, Custom OpenAI-compatible), Zod JSON auto-repair retry loop, per-provider circuit breaker, multi-key rotation, token/cost ledger, and hard daily budget stop.
  - `packages/media`: `ffprobe` validator, SHA-256 stream deduplicator, audio extractor, pluggable transcription adapter (Whisper API / faster-whisper local / deterministic fixture fallback), keyframe & thumbnail generator, SRT/VTT formatter, and DB-driven aspect-ratio transcoder (`9:16`, `16:9`, `1:1`, `4:5`).
  - `packages/agents`: Durable Postgres DAG state machine (`Run` → `RunStep`) for the 13 built-in agents with prompt versioning, parallel writer branches, untrusted-input sanitization, Brand Kit + `pgvector` memory retrieval, approval gates, and crash recovery.
  - `packages/connectors`: Pluggable social publishing connectors (`MockConnector`, `YouTubeConnector`, `LinkedInConnector`, `InstagramConnector`) implementing an idempotent state machine (`staged` → `uploading` → `verifying` → `published`) keyed by `(content_id, platform, version)` and `platform_post_id`.
  - `packages/mcp`: Official MCP protocol server (`Streamable HTTP` on `/mcp` + standalone `npx` stdio proxy CLI) exposing all 22 required tools and 5 resources with token scope enforcement, `dry_run` safety defaults, and immutable audit logging.

## ADR-002: AES-256-GCM Envelope Encryption Vault (`packages/core/src/vault.ts`)
- **Decision**: Provider API keys and channel OAuth refresh/access tokens are encrypted before touching PostgreSQL using Node's native `crypto` AES-256-GCM with a 32-byte `VAULT_MASTER_KEY` from environment variables.
- **Format**: Each secret is stored as `v1:<iv_base64>:<authTag_base64>:<ciphertext_base64>` with a fresh 12-byte cryptographically random IV per encryption and key-version prefix `v1` to support zero-downtime key rotation.
- **Redaction**: API responses only ever emit a pre-computed masked prefix (e.g. `AIzaSyD9••••••••••••••••••••••8kQ1`), and Pino logger redaction paths (`req.headers.authorization`, `*.rawKey`, `*.accessToken`, `*.refreshToken`, `*.plainSecret`) prevent secret leakage into stdout or log files.

## ADR-003: Untrusted Content Isolation & Prompt-Injection Defense
- **Decision**: Video transcripts, scraped social comments, and external captions are treated as untrusted data (`<UNTRUSTED_TRANSCRIPT>` XML delimiter wrapping + control-character/instruction-override stripping).
- **Enforcement**:
  1. Untrusted text is never interpolated into system prompts; it is passed strictly in a structured user message block with explicit boundary instructions.
  2. Agent tool permissions are statically bound per `AgentRole` in code (e.g. writers can only call `brand_voice_check` and `character_counter`, never `linkedin_rest_publish` or `update_agent_prompt`).
  3. The `Publisher` agent is 100% deterministic (non-LLM) and verifies three invariants in PostgreSQL before any connector call: (a) `workspace.publishingPaused === false`, (b) valid human approval record (or `autonomyMode === "auto"` with `brandComplianceScore >= 88`), and (c) Zod schema validation of the variant payload.

## ADR-004: Durable DAG State Machine & Worker Crash Recovery
- **Decision**: Every `Run` and `RunStep` is persisted in PostgreSQL (`runs` and `run_steps` tables) with atomic state transitions (`queued` → `running` → `waiting` → `completed` / `failed`) and a `heartbeat_at` timestamp.
- **Crash Survival**: When `apps/worker` boots (or every 15 seconds via its supervisor loop), it scans for any `Run` in `status = 'running'` whose active `RunStep` has a stale `heartbeat_at` (> 30s) or was interrupted by `SIGKILL`. It resumes execution from the last incomplete step without re-running already `completed` upstream steps, and reconciles any in-flight `Publisher` step via the idempotent `platform_post_id` ledger so no duplicate social post is ever created.

## ADR-005: Official Social Connector API Versions (2026 Current)
- **YouTube Data API v3**: Uses OAuth 2.0 (`https://oauth2.googleapis.com/token`) and resumable media upload (`POST https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`) with `X-Upload-Content-Length` and chunked `PUT` range resumption, deducting `1600` quota units per `videos.insert` and `50` units per thumbnail/metadata update in the workspace quota ledger.
- **LinkedIn Posts API**: Uses the versioned REST Posts API (`POST https://api.linkedin.com/rest/posts` with header `LinkedIn-Version: 202411` and `X-Restli-Protocol-Version: 2.0.0`), initializing video uploads via `POST https://api.linkedin.com/rest/videos?action=initializeUpload`.
- **Instagram Graph API**: Uses the two-phase Reels Container workflow (`POST https://graph.facebook.com/v21.0/{ig-user-id}/media` with `media_type=REELS`, polling `GET /{container-id}?fields=status_code` until `FINISHED`, then publishing via `POST /{ig-user-id}/media_publish`).
- **Mock Connector First**: `CONNECTOR_MODE=mock` is enabled by default so the entire ingest → media → 13-agent DAG → approval → publish → analytics pipeline runs deterministically on a fresh VPS or developer machine without external social accounts.
