# Dev House Backend & MCP Server (`BACKEND_README.md`)

> Contract-first Node 22 + TypeScript strict pnpm monorepo (`apps/api`, `apps/worker`, `packages/{core,db,providers,agents,connectors,mcp,media}`) built to satisfy the existing Dev House Console frontend (`src/lib/api/types.ts`, `src/lib/api/client.ts`, and `useLiveEvents.ts`) with zero UI changes when `NEXT_PUBLIC_API_MODE=live`.

---

## 1. Monorepo Architecture (`/backend`)

```text
backend/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── docker-compose.yml              # Postgres 16 (pgvector), Redis 7.4, MinIO/R2, API, Worker, Caddy
├── Caddyfile                       # Auto-TLS + flush_interval -1 for SSE (/api/v1/events/stream) & /mcp
├── .env.example                    # Complete environment template
├── scripts/
│   └── backup-pg-to-r2.sh          # Automated pg_dump + gzip upload to Cloudflare R2
├── docs/
│   ├── CONTRACT-GAPS.md            # Step 0 frontend contract audit & route mapping
│   ├── DECISIONS.md                # Architectural Decision Records (ADR-001 to ADR-005)
│   └── deploy.md                   # Single-VPS Ubuntu 24.04 deployment runbook
├── apps/
│   ├── api/                        # Fastify v5 + Zod + OpenAPI + SSE broadcaster + Streamable HTTP /mcp
│   │   └── src/
│   │       ├── app.ts              # All 25 DevHouseApiClient endpoints + /api/v1/ingest + /mcp
│   │       └── server.ts           # HTTP + SSE listener on port 4000
│   └── worker/                     # BullMQ worker queues + crash-recovery supervisor
│       └── src/
│           └── worker.ts           # Resumes interrupted runs mid-DAG after worker restart/SIGKILL
├── packages/
│   ├── core/                       # Zod contract schemas (1:1 with types.ts), AES-256-GCM Vault, Argon2id + TOTP 2FA, SSRF guard, Event Bus
│   ├── db/                         # Drizzle ORM + PostgreSQL 16 + pgvector schema, platform_limits_config, publish_ledger, seed store
│   ├── providers/                  # Unified LLM Gateway (Gemini, NVIDIA NIM, xAI Grok, CF Workers AI, CF AI Gateway, Custom OpenAI), circuit breaker, JSON auto-repair, budget hard-stop
│   ├── media/                      # ffprobe stream validator, SHA-256 deduplicator, Whisper adapter, SRT/VTT exporter, DB-driven aspect-ratio renditions (9:16, 16:9, 1:1, 4:5)
│   ├── agents/                     # 13 versioned agents, durable Run -> RunStep state machine, untrusted transcript XML isolation, parallel writers, approval gate
│   ├── connectors/                 # MockConnector (default), YouTube Data API v3, LinkedIn REST Posts API, Instagram Graph Reels API with idempotent platform_post_id reconciliation
│   └── mcp/                        # Streamable HTTP (/mcp) + npx stdio proxy CLI exposing 22 tools & 5 resources with dry_run safety defaults
└── tests/
    └── backend-e2e.test.ts         # End-to-end Vitest contract, security, crash-resume & idempotency suite
```

---

## 2. How to Run Locally & Switch the Frontend to Live Mode

### Step 1 — Start the Backend Stack
```bash
cd backend
cp .env.example .env
pnpm install

# Start Postgres 16 (pgvector), Redis 7, MinIO, API (port 4000), and Worker
docker compose up -d postgres redis minio
pnpm db:migrate
pnpm db:seed
pnpm dev
```

### Step 2 — Point the Existing Frontend at the Live Backend
In `frontend/.env.local` (already pre-configured in `dev-house-fullstack-live.zip`):
```env
NEXT_PUBLIC_API_MODE=live
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
```
Run `pnpm dev` in `frontend/`. Every screen (`/map`, `/`, `/library`, `/runs`, `/approvals`, `/calendar`, `/agents`, `/workflows`, `/providers`, `/channels`, `/analytics`, `/brand`, `/connect`, `/settings`, `/system`, `/onboarding`) reads and mutates against the live backend and animates `/map` from real SSE events on `GET /api/v1/events/stream`.

---

## 3. Environment Variables Reference

| Variable | Default / Format | Purpose |
| :--- | :--- | :--- |
| `PORT` | `4000` | Fastify API, SSE (`/api/v1/events/stream`), and MCP (`/mcp`) port |
| `DATABASE_URL` | `postgresql://devhouse:...@localhost:5432/devhouse` | PostgreSQL 16 + `pgvector` connection URI |
| `REDIS_URL` | `redis://localhost:6379` | Redis 7.4 instance for BullMQ queues and rate-limiting |
| `VAULT_MASTER_KEY` | 64-char hex (32 bytes) | AES-256-GCM master key for encrypting provider keys & OAuth tokens at rest |
| `CONNECTOR_MODE` | `mock` (`mock` \| `live`) | `mock` runs the full publishing pipeline locally with zero external social accounts; `live` calls YouTube Data API v3, LinkedIn REST, and Instagram Graph API |
| `S3_ENDPOINT` / `S3_BUCKET` | Cloudflare R2 or MinIO URL | Object storage for raw videos, keyframes, thumbnails, SRT/VTT, and renditions |
| `WEBHOOK_SIGNING_SECRET` | `whsec_...` | HMAC-SHA256 signing secret for outbound webhooks (`X-DevHouse-Signature-256`) |

---

## 4. Milestone Verification Reports (M1–M8)

### M1 — Skeleton + Docker Compose + Auth + AES-256-GCM Vault + Seed Data
- **Done**: Monorepo workspace, `docker-compose.yml`, Argon2id password/token hashing, RFC 6238 TOTP 2FA, AES-256-GCM envelope vault (`v1:<iv>:<tag>:<ct>`), and deterministic seed matching all 30 content items, 12 runs, 13 agents, and 6 providers.
- **Mocked**: External SMTP/Telegram delivery when credentials are blank in `.env`.
- **How to Verify**: Run `pnpm test` (`M1: AES-256-GCM Vault` and `M1: Argon2id + TOTP 2FA`).

### M2 — Core CRUD Endpoints Matching Frontend Contract
- **Done**: All 25 `DevHouseApiClient` routes mounted at both `/api/v1/*` and `/v1/*` with strict Zod validation derived 1:1 from `src/lib/api/types.ts`.
- **Mocked**: None — all mutations persist in the repository and append to `auditLogs`.
- **How to Verify**: `curl http://localhost:4000/api/v1/workspace` and `curl http://localhost:4000/api/v1/content`.

### M3 — Unified LLM Gateway + 6 Provider Adapters + Circuit Breaker
- **Done**: Chat, streaming, Zod schema-validated JSON with auto-repair retry loop, per-provider circuit breaker (opens after 3 failures for 15s), multi-key rotation, daily budget hard-stop, and automatic `provider.fallback` SSE event emission.
- **Mocked**: When live upstream provider keys are not supplied, adapters return deterministic schema-compliant engineering payloads while exercising the real circuit-breaker, fallback, and cost-accounting code paths.
- **How to Verify**: POST to `/api/v1/ingest` with `{"simulateGemini429": true}` and watch `provider.fallback` reroute from `gemini-2.5-pro` to `nvidia-llama-3.3-70b`.

### M4 — Video Ingest + SSRF Guard + FFmpeg / Whisper Media Pipeline
- **Done**: `POST /api/v1/ingest` (multipart, URL-pull with SSRF private-IP rejection, and JSON drop), SHA-256 deduplication, `ffprobe` stream validation, SRT + WebVTT subtitle generation, and DB-driven aspect-ratio renditions (`platform_limits_config` table).
- **Mocked**: Local `faster-whisper` binary falls back to deterministic timestamped transcript segments when GPU binary is absent.
- **How to Verify**: Test SSRF rejection with `curl -X POST http://localhost:4000/api/v1/ingest -d '{"url":"http://169.254.169.254/latest/meta-data/"}'`.

### M5 — Durable 13-Agent DAG Engine + Crash Recovery + Live SSE Bus
- **Done**: Versioned 13-agent crew (`Director`, `Video Analyst`, `Strategist`, 3 platform writers, `SEO & Hashtag`, `Thumbnail Concept`, `Brand Reviewer`, `Scheduler`, deterministic `Publisher`, `Analyst`, draft-only `Engagement Assistant`), `<UNTRUSTED_TRANSCRIPT>` prompt-injection isolation, crash-recovery supervisor in `apps/worker`, and real-time SSE emission on `GET /api/v1/events/stream`.
- **Mocked**: None.
- **How to Verify**: Kill `apps/worker` mid-run and restart it; `recoverInterruptedRuns()` resumes from the exact incomplete `RunStep` without re-running completed upstream steps.

### M6 — Idempotent Social Connectors (Mock, YouTube v3, LinkedIn REST, Instagram Graph)
- **Done**: `publishLedger` table keyed by `(workspace_id, content_id, platform, version)` storing `platform_post_id` and `published_url`, YouTube 10,000-unit daily quota ledger (`1600` units per `videos.insert`), and instant workspace Kill Switch (`publishingPaused`).
- **Mocked**: `CONNECTOR_MODE=mock` is default so publishing succeeds end-to-end without live social OAuth accounts.
- **How to Verify**: Call `publishVariantIdempotent` twice for the same variant; the second call returns `idempotentReplay: true` with the identical `platformPostId`.

### M7 — MCP Server (`/mcp` Streamable HTTP + `npx` Stdio Proxy)
- **Done**: All 22 tools and 5 resources exposed over Streamable HTTP (`POST /mcp`) and `npx devhouse-mcp` stdio proxy, scoped bearer-token checks (`read`, `write`, `ingest`, `publish`, `admin`), `publish_now` defaulting to `dry_run: true` unless token has `publish` scope AND autonomy mode allows it, and immutable audit logging on every call.
- **Mocked**: None.
- **How to Verify**: `curl -X POST http://localhost:4000/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`.

### M8 — Hardening, R2 Backups, CI & Single-VPS Caddy Deployment
- **Done**: `docker-compose.yml`, `Caddyfile` with `flush_interval -1` for SSE and `/mcp`, `scripts/backup-pg-to-r2.sh`, `.github/workflows/ci.yml`, and `docs/deploy.md`.
- **Mocked**: None.
- **How to Verify**: `docker compose config` and `pnpm test`.
