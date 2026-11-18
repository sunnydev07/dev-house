import {
  pgTable,
  text,
  integer,
  doublePrecision,
  boolean,
  timestamp,
  jsonb,
  vector,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  autonomyMode: text("autonomy_mode").notNull().default("approve_before_publish"),
  publishingPaused: boolean("publishing_paused").notNull().default(false),
  dailyBudgetUsd: doublePrecision("daily_budget_usd").notNull().default(25.0),
  spentTodayUsd: doublePrecision("spent_today_usd").notNull().default(0.0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  totpSecretEncrypted: text("totp_secret_encrypted"),
  totpEnabled: boolean("totp_enabled").notNull().default(true),
  role: text("role").notNull().default("owner"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const apiTokens = pgTable("api_tokens", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  scopes: jsonb("scopes").$type<string[]>().notNull(),
  clientAgent: text("client_agent").notNull(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  lastUsedAt: text("last_used_at").notNull(),
  revoked: boolean("revoked").notNull().default(false),
});

export const providers = pgTable("providers", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  name: text("name").notNull(),
  monogram: text("monogram").notNull(),
  status: text("status").notNull().default("connected"),
  maskedKey: text("masked_key").notNull(),
  encryptedKeyEnvelope: text("encrypted_key_envelope").notNull(),
  baseUrl: text("base_url"),
  latencyMs: integer("latency_ms").notNull().default(250),
  requestsToday: integer("requests_today").notNull().default(0),
  spendTodayUsd: doublePrecision("spend_today_usd").notNull().default(0),
  budgetLimitUsd: doublePrecision("budget_limit_usd").notNull().default(10),
  fallbackOrder: integer("fallback_order").notNull(),
});

export const platformLimitsConfig = pgTable("platform_limits_config", {
  platform: text("platform").primaryKey(),
  maxTitleChars: integer("max_title_chars").notNull(),
  maxBodyChars: integer("max_body_chars").notNull(),
  maxHashtags: integer("max_hashtags").notNull(),
  aspectRatio: text("aspect_ratio").notNull(),
  maxDurationSec: integer("max_duration_sec").notNull(),
  maxFileSizeMb: integer("max_file_size_mb").notNull(),
  audioBitrateKbps: integer("audio_bitrate_kbps").notNull().default(192),
});

export const agents = pgTable("agents", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  role: text("role").notNull(),
  name: text("name").notNull(),
  monogram: text("monogram").notNull(),
  description: text("description").notNull(),
  primaryModelId: text("primary_model_id").notNull(),
  fallbackModelId: text("fallback_model_id").notNull(),
  temperature: doublePrecision("temperature").notNull().default(0.2),
  successRate: doublePrecision("success_rate").notNull().default(99.0),
  avgCostUsd: doublePrecision("avg_cost_usd").notNull().default(0.03),
  avgDurationSec: doublePrecision("avg_duration_sec").notNull().default(4.0),
  status: text("status").notNull().default("idle"),
  currentTask: text("current_task").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  outputSchema: text("output_schema").notNull(),
  tools: jsonb("tools").$type<string[]>().notNull(),
  guardrails: jsonb("guardrails").$type<string[]>().notNull(),
  versions: jsonb("versions").notNull(),
});

export const contentItems = pgTable(
  "content_items",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    sha256Hash: text("sha256_hash").notNull(),
    title: text("title").notNull(),
    source: text("source").notNull(),
    durationSec: integer("duration_sec").notNull(),
    durationFormatted: text("duration_formatted").notNull(),
    status: text("status").notNull(),
    platforms: jsonb("platforms").$type<string[]>().notNull(),
    createdAt: text("created_at").notNull(),
    scheduledFor: text("scheduled_for"),
    runId: text("run_id").notNull(),
    costUsd: doublePrecision("cost_usd").notNull().default(0),
    transcript: jsonb("transcript").notNull(),
    variants: jsonb("variants").notNull(),
    metadata: jsonb("metadata").notNull(),
  },
  (table) => ({
    hashIdx: uniqueIndex("content_workspace_hash_idx").on(table.workspaceId, table.sha256Hash),
  })
);

export const runs = pgTable("runs", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  contentId: text("content_id").notNull(),
  contentTitle: text("content_title").notNull(),
  source: text("source").notNull(),
  status: text("status").notNull(),
  startedAt: text("started_at").notNull(),
  durationSec: doublePrecision("duration_sec").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  totalCostUsd: doublePrecision("total_cost_usd").notNull().default(0),
  activeAgentId: text("active_agent_id"),
  heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }).defaultNow().notNull(),
});

export const runSteps = pgTable(
  "run_steps",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull().references(() => runs.id),
    agentId: text("agent_id").notNull(),
    agentName: text("agent_name").notNull(),
    agentMonogram: text("agent_monogram").notNull(),
    modelUsed: text("model_used").notNull(),
    providerId: text("provider_id").notNull(),
    status: text("status").notNull(),
    startedAt: text("started_at").notNull(),
    durationSec: doublePrecision("duration_sec").notNull().default(0),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    costUsd: doublePrecision("cost_usd").notNull().default(0),
    toolCalls: jsonb("tool_calls").$type<string[]>().notNull(),
    streamedOutput: text("streamed_output").notNull(),
    inputJson: jsonb("input_json").notNull(),
    outputJson: jsonb("output_json").notNull(),
    criticalPath: boolean("critical_path").notNull().default(true),
    startOffsetSec: doublePrecision("start_offset_sec").notNull().default(0),
  },
  (table) => ({
    runIdx: index("run_steps_run_id_idx").on(table.runId),
  })
);

export const publishLedger = pgTable(
  "publish_ledger",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    contentId: text("content_id").notNull(),
    platform: text("platform").notNull(),
    version: integer("version").notNull(),
    state: text("state").notNull(), // 'staged' | 'uploading' | 'published' | 'failed'
    platformPostId: text("platform_post_id"),
    publishedUrl: text("published_url"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idempotencyIdx: uniqueIndex("publish_idempotency_idx").on(
      table.workspaceId,
      table.contentId,
      table.platform,
      table.version
    ),
  })
);

export const brandVectorMemory = pgTable("brand_vector_memory", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  category: text("category").notNull(),
  content: text("content").notNull(),
  // pgvector embedding(768) — cosine-distance recall via `<=>`
  embedding: vector("embedding", { dimensions: 768 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const auditLogs = pgTable("audit_logs", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  timestamp: text("timestamp").notNull(),
  actor: text("actor").notNull(),
  category: text("category").notNull(),
  action: text("action").notNull(),
  target: text("target").notNull(),
  latencyMs: integer("latency_ms"),
  status: text("status").notNull(),
  meta: text("meta"),
});
