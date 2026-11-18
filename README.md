# Dev House Full-Stack Live (`dev-house-fullstack-live-fixed`)

> *"A lit window in a quiet house at night."*
> Complete full-stack monorepo containing the **Dev House Console** (`frontend/`, Next.js 15 App Router + React 19 + Tailwind v4 + Interactive Console Runtime) and the **Dev House Backend & MCP Server** (`backend/`, Node 22 + TypeScript strict pnpm monorepo: Fastify v5 REST/SSE API, BullMQ Worker with crash-recovery supervisor, Drizzle PostgreSQL 16 + `pgvector`, AES-256-GCM Secret Vault, 6 BYOK LLM Providers, FFmpeg/Whisper Media Pipeline, Durable 13-Agent DAG, Idempotent Social Connectors, and 22-Tool MCP Server).

---

## Quick Start

### 1. Start the Backend API, SSE Bus & MCP Server (`:4000`)
```bash
cd backend
cp .env.example .env
pnpm install

# Optional: Start Postgres 16 (pgvector), Redis 7.4, and MinIO via Docker
docker compose up -d postgres redis minio

# Run schema migration, seed verification, and launch API + Worker
pnpm db:migrate
pnpm db:seed
pnpm dev
```

### 2. Start the Frontend Console (`:3000`)
```bash
cd frontend
pnpm install
pnpm dev
```
`frontend/.env.local` is pre-configured with:
```env
NEXT_PUBLIC_API_MODE=live
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
```

### 3. Run Verification & End-to-End Tests
```bash
# From root or backend/
pnpm test
pnpm typecheck
```

See [`AUDIT_AND_FIXES.md`](./AUDIT_AND_FIXES.md) for the complete architectural analysis and changelog of all 14 bugs and security/logic improvements resolved in this release.
