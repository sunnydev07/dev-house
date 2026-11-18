import { Pool } from "pg";
import {
  workspaces,
  users,
  apiTokens,
  providers,
  platformLimitsConfig,
  agents,
  contentItems,
  runs,
  runSteps,
  publishLedger,
  brandVectorMemory,
  auditLogs,
} from "./schema.js";

const SCHEMA_TABLES = [
  { name: "workspaces", table: workspaces },
  { name: "users", table: users },
  { name: "api_tokens", table: apiTokens },
  { name: "providers", table: providers },
  { name: "platform_limits_config", table: platformLimitsConfig },
  { name: "agents", table: agents },
  { name: "content_items", table: contentItems },
  { name: "runs", table: runs },
  { name: "run_steps", table: runSteps },
  { name: "publish_ledger", table: publishLedger },
  { name: "brand_vector_memory", table: brandVectorMemory },
  { name: "audit_logs", table: auditLogs },
];

const DATABASE_URL_FALLBACK = "postgresql://devhouse:devhouse_secret_pw@localhost:5432/devhouse";

function describeError(err: unknown): string {
  if (err instanceof AggregateError) {
    return err.errors.map((inner) => describeError(inner)).join("; ") || "connection failed";
  }
  if (err instanceof Error) {
    const code = (err as { code?: string }).code;
    return err.message || code || err.name;
  }
  return String(err);
}

function ddlStatements(embeddingType: string): string[] {
  return [
    `CREATE TABLE IF NOT EXISTS workspaces (
      id text PRIMARY KEY,
      name text NOT NULL,
      slug text NOT NULL UNIQUE,
      timezone text NOT NULL DEFAULT 'Asia/Kolkata',
      autonomy_mode text NOT NULL DEFAULT 'approve_before_publish',
      publishing_paused boolean NOT NULL DEFAULT false,
      daily_budget_usd double precision NOT NULL DEFAULT 25.0,
      spent_today_usd double precision NOT NULL DEFAULT 0.0,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS users (
      id text PRIMARY KEY,
      workspace_id text NOT NULL REFERENCES workspaces(id),
      email text NOT NULL UNIQUE,
      name text NOT NULL,
      password_hash text NOT NULL,
      totp_secret_encrypted text,
      totp_enabled boolean NOT NULL DEFAULT true,
      role text NOT NULL DEFAULT 'owner',
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS api_tokens (
      id text PRIMARY KEY,
      workspace_id text NOT NULL REFERENCES workspaces(id),
      name text NOT NULL,
      prefix text NOT NULL,
      token_hash text NOT NULL UNIQUE,
      scopes jsonb NOT NULL,
      client_agent text NOT NULL,
      created_at text NOT NULL,
      expires_at text NOT NULL,
      last_used_at text NOT NULL,
      revoked boolean NOT NULL DEFAULT false
    )`,
    `CREATE TABLE IF NOT EXISTS providers (
      id text PRIMARY KEY,
      workspace_id text NOT NULL REFERENCES workspaces(id),
      name text NOT NULL,
      monogram text NOT NULL,
      status text NOT NULL DEFAULT 'connected',
      masked_key text NOT NULL,
      encrypted_key_envelope text NOT NULL,
      base_url text,
      latency_ms integer NOT NULL DEFAULT 250,
      requests_today integer NOT NULL DEFAULT 0,
      spend_today_usd double precision NOT NULL DEFAULT 0,
      budget_limit_usd double precision NOT NULL DEFAULT 10,
      fallback_order integer NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS platform_limits_config (
      platform text PRIMARY KEY,
      max_title_chars integer NOT NULL,
      max_body_chars integer NOT NULL,
      max_hashtags integer NOT NULL,
      aspect_ratio text NOT NULL,
      max_duration_sec integer NOT NULL,
      max_file_size_mb integer NOT NULL,
      audio_bitrate_kbps integer NOT NULL DEFAULT 192
    )`,
    `CREATE TABLE IF NOT EXISTS agents (
      id text PRIMARY KEY,
      workspace_id text NOT NULL REFERENCES workspaces(id),
      role text NOT NULL,
      name text NOT NULL,
      monogram text NOT NULL,
      description text NOT NULL,
      primary_model_id text NOT NULL,
      fallback_model_id text NOT NULL,
      temperature double precision NOT NULL DEFAULT 0.2,
      success_rate double precision NOT NULL DEFAULT 99.0,
      avg_cost_usd double precision NOT NULL DEFAULT 0.03,
      avg_duration_sec double precision NOT NULL DEFAULT 4.0,
      status text NOT NULL DEFAULT 'idle',
      current_task text NOT NULL,
      system_prompt text NOT NULL,
      output_schema text NOT NULL,
      tools jsonb NOT NULL,
      guardrails jsonb NOT NULL,
      versions jsonb NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS content_items (
      id text PRIMARY KEY,
      workspace_id text NOT NULL REFERENCES workspaces(id),
      sha256_hash text NOT NULL,
      title text NOT NULL,
      source text NOT NULL,
      duration_sec integer NOT NULL,
      duration_formatted text NOT NULL,
      status text NOT NULL,
      platforms jsonb NOT NULL,
      created_at text NOT NULL,
      scheduled_for text,
      run_id text NOT NULL,
      cost_usd double precision NOT NULL DEFAULT 0,
      transcript jsonb NOT NULL,
      variants jsonb NOT NULL,
      metadata jsonb NOT NULL
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS content_workspace_hash_idx
      ON content_items (workspace_id, sha256_hash)`,
    `CREATE TABLE IF NOT EXISTS runs (
      id text PRIMARY KEY,
      workspace_id text NOT NULL REFERENCES workspaces(id),
      content_id text NOT NULL,
      content_title text NOT NULL,
      source text NOT NULL,
      status text NOT NULL,
      started_at text NOT NULL,
      duration_sec double precision NOT NULL DEFAULT 0,
      total_tokens integer NOT NULL DEFAULT 0,
      total_cost_usd double precision NOT NULL DEFAULT 0,
      active_agent_id text,
      heartbeat_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS run_steps (
      id text PRIMARY KEY,
      run_id text NOT NULL REFERENCES runs(id),
      agent_id text NOT NULL,
      agent_name text NOT NULL,
      agent_monogram text NOT NULL,
      model_used text NOT NULL,
      provider_id text NOT NULL,
      status text NOT NULL,
      started_at text NOT NULL,
      duration_sec double precision NOT NULL DEFAULT 0,
      tokens_in integer NOT NULL DEFAULT 0,
      tokens_out integer NOT NULL DEFAULT 0,
      cost_usd double precision NOT NULL DEFAULT 0,
      tool_calls jsonb NOT NULL,
      streamed_output text NOT NULL,
      input_json jsonb NOT NULL,
      output_json jsonb NOT NULL,
      critical_path boolean NOT NULL DEFAULT true,
      start_offset_sec double precision NOT NULL DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS run_steps_run_id_idx ON run_steps (run_id)`,
    `CREATE TABLE IF NOT EXISTS publish_ledger (
      id text PRIMARY KEY,
      workspace_id text NOT NULL REFERENCES workspaces(id),
      content_id text NOT NULL,
      platform text NOT NULL,
      version integer NOT NULL,
      state text NOT NULL,
      platform_post_id text,
      published_url text,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS publish_idempotency_idx
      ON publish_ledger (workspace_id, content_id, platform, version)`,
    `CREATE TABLE IF NOT EXISTS brand_vector_memory (
      id text PRIMARY KEY,
      workspace_id text NOT NULL REFERENCES workspaces(id),
      category text NOT NULL,
      content text NOT NULL,
      embedding ${embeddingType} NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id text PRIMARY KEY,
      workspace_id text NOT NULL REFERENCES workspaces(id),
      timestamp text NOT NULL,
      actor text NOT NULL,
      category text NOT NULL,
      action text NOT NULL,
      target text NOT NULL,
      latency_ms integer,
      status text NOT NULL,
      meta text
    )`,
  ];
}

export async function runMigrations(): Promise<{
  migratedTables: string[];
  mode: "postgres" | "in-memory";
  pgvector: boolean;
}> {
  const dbUrl = process.env.DATABASE_URL?.trim() || DATABASE_URL_FALLBACK;
  const tableNames = SCHEMA_TABLES.map((t) => t.name);
  console.log(
    `[Dev House DB Migrate] Connecting to PostgreSQL 16 for ${tableNames.length} Drizzle tables (${dbUrl.replace(
      /:[^:@]+@/,
      ":****@"
    )})...`
  );

  const pool = new Pool({ connectionString: dbUrl, connectionTimeoutMillis: 3_000, max: 2 });
  pool.on("error", () => undefined);

  let pgvector = false;
  let mode: "postgres" | "in-memory" = "in-memory";

  try {
    await pool.query("SELECT 1");

    try {
      await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
      pgvector = true;
      console.log("  ✓ Extension enabled: vector (pgvector)");
    } catch (err) {
      console.warn(
        `  ! pgvector extension unavailable, storing embeddings as jsonb: ${describeError(err)}`
      );
    }

    for (const statement of ddlStatements(pgvector ? "vector(768)" : "jsonb")) {
      await pool.query(statement);
    }

    for (const name of tableNames) {
      console.log(`  ✓ Applied idempotent DDL: ${name}`);
    }
    console.log("  ✓ Verified indexes: content_workspace_hash_idx, publish_idempotency_idx, run_steps_run_id_idx");
    console.log("[Dev House DB Migrate] All 12 tables and indexes applied to PostgreSQL.");
    mode = "postgres";
  } catch (err) {
    console.warn(
      `[Dev House DB Migrate] PostgreSQL unreachable, keeping in-memory DevHouseRepository fallback: ${describeError(
        err
      )}`
    );
  } finally {
    await pool.end().catch(() => undefined);
  }

  return { migratedTables: tableNames, mode, pgvector };
}

const isMainEntry =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  Boolean(process.argv[1] && /migrate\.(ts|js)$/.test(process.argv[1]));

if (isMainEntry) {
  void runMigrations().then((result) => {
    console.log(
      `[Dev House DB Migrate] mode=${result.mode} pgvector=${result.pgvector} tables=${result.migratedTables.length}`
    );
  });
}
