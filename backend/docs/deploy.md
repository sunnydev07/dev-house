# Single-VPS Deployment Runbook (`docs/deploy.md`)

## 1. Host Requirements
- **OS**: Ubuntu 24.04 LTS (x86_64 or ARM64)
- **Specs**: 4 vCPU, 8 GB RAM, 120 GB NVMe SSD
- **Packages**: Docker Engine 27+, Docker Compose v2, `ffmpeg`, `aws-cli` (for R2 backups)

## 2. First-Time Provisioning
```bash
# 1. Clone repository & configure environment
cp .env.example .env
openssl rand -hex 32 # Paste into VAULT_MASTER_KEY in .env

# 2. Launch PostgreSQL 16 (pgvector), Redis 7.4, MinIO/R2, Fastify API, BullMQ Worker, and Caddy
docker compose up -d --build

# 3. Apply Drizzle schema migrations & seed initial workspace
docker compose exec api pnpm db:migrate
docker compose exec api pnpm db:seed
```

## 3. Automated Nightly Backups to Cloudflare R2
Add to `/etc/cron.d/devhouse-backup`:
```cron
15 2 * * * root /opt/devhouse/backend/scripts/backup-pg-to-r2.sh >> /var/log/devhouse-backup.log 2>&1
```

## 4. Connecting the Next.js Frontend (`NEXT_PUBLIC_API_MODE=live`)
In `frontend/.env.local`:
```env
NEXT_PUBLIC_API_MODE=live
NEXT_PUBLIC_API_URL=https://api.devhouse.internal/api/v1
```
Start the frontend (`pnpm build && pnpm start`). Zero UI changes are required.
