#!/usr/bin/env bash
set -euo pipefail

TIMESTAMP=$(date -u +"%Y-%m-%dT%H-%M-%SZ")
BACKUP_FILE="/tmp/devhouse_pg_${TIMESTAMP}.sql.gz"

echo "[Backup] Dumping PostgreSQL database..."
pg_dump "${DATABASE_URL}" | gzip -9 > "${BACKUP_FILE}"

echo "[Backup] Uploading ${BACKUP_FILE} to S3/Cloudflare R2 (${S3_BUCKET})..."
aws s3 cp "${BACKUP_FILE}" "s3://${S3_BUCKET}/backups/postgres/devhouse_pg_${TIMESTAMP}.sql.gz" \
  --endpoint-url "${S3_ENDPOINT}"

rm -f "${BACKUP_FILE}"
echo "[Backup] Completed successfully at ${TIMESTAMP}."
