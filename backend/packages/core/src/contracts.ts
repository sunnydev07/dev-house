import { z } from "zod";

export const AutonomyModeSchema = z.enum(["manual", "approve_before_publish", "auto"]);
export type AutonomyMode = z.infer<typeof AutonomyModeSchema>;

export const PlatformIdSchema = z.enum(["linkedin", "instagram", "youtube"]);
export type PlatformId = z.infer<typeof PlatformIdSchema>;

export const ContentStatusSchema = z.enum([
  "ingested",
  "analysing",
  "writing",
  "awaiting_approval",
  "scheduled",
  "published",
  "failed",
]);
export type ContentStatus = z.infer<typeof ContentStatusSchema>;

export const NodeStatusSchema = z.enum(["idle", "running", "waiting", "failed", "degraded"]);
export type NodeStatus = z.infer<typeof NodeStatusSchema>;

export const ProviderIdSchema = z.enum([
  "gemini",
  "nvidia_nim",
  "xai_grok",
  "cf_workers_ai",
  "cf_ai_gateway",
  "custom_openai",
]);
export type ProviderId = z.infer<typeof ProviderIdSchema>;

export const AgentRoleSchema = z.enum([
  "director",
  "video_analyst",
  "strategist",
  "linkedin_writer",
  "instagram_writer",
  "youtube_writer",
  "seo_hashtag",
  "thumbnail_concept",
  "brand_reviewer",
  "scheduler",
  "publisher",
  "analyst",
  "engagement_assistant",
]);
export type AgentRole = z.infer<typeof AgentRoleSchema>;

export const WorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  timezone: z.string().default("Asia/Kolkata"),
  autonomyMode: AutonomyModeSchema,
  publishingPaused: z.boolean(),
  dailyBudgetUsd: z.number().nonnegative(),
  spentTodayUsd: z.number().nonnegative(),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;

export const ProviderSchema = z.object({
  id: ProviderIdSchema,
  name: z.string(),
  monogram: z.string(),
  status: z.enum(["connected", "rate_limited", "degraded", "disconnected"]),
  maskedKey: z.string(),
  baseUrl: z.string().optional(),
  latencyMs: z.number(),
  requestsToday: z.number(),
  spendTodayUsd: z.number(),
  budgetLimitUsd: z.number(),
  fallbackOrder: z.number().int(),
});
export type Provider = z.infer<typeof ProviderSchema>;

export const ModelCapabilitySchema = z.enum([
  "reasoning",
  "vision",
  "fast",
  "structured_json",
  "long_context",
]);

export const ModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  providerId: ProviderIdSchema,
  capabilities: z.array(ModelCapabilitySchema),
  contextWindow: z.number().int(),
  inputCostPer1M: z.number(),
  outputCostPer1M: z.number(),
  latencyP50Ms: z.number(),
});
export type Model = z.infer<typeof ModelSchema>;

export const AgentPromptVersionSchema = z.object({
  version: z.string(),
  createdAt: z.string(),
  author: z.string(),
  note: z.string(),
  systemPrompt: z.string(),
});
export type AgentPromptVersion = z.infer<typeof AgentPromptVersionSchema>;

export const AgentSchema = z.object({
  id: z.string(),
  role: AgentRoleSchema,
  name: z.string(),
  monogram: z.string(),
  description: z.string(),
  primaryModelId: z.string(),
  fallbackModelId: z.string(),
  temperature: z.number().min(0).max(2),
  successRate: z.number(),
  avgCostUsd: z.number(),
  avgDurationSec: z.number(),
  status: NodeStatusSchema,
  currentTask: z.string(),
  systemPrompt: z.string(),
  outputSchema: z.string(),
  tools: z.array(z.string()),
  guardrails: z.array(z.string()),
  versions: z.array(AgentPromptVersionSchema),
});
export type Agent = z.infer<typeof AgentSchema>;

export const WorkflowNodeSchema = z.object({
  id: z.string(),
  type: z.enum([
    "source",
    "gateway",
    "core",
    "media",
    "agent",
    "provider",
    "approval",
    "publisher",
    "condition",
    "parallel",
    "delay",
  ]),
  label: z.string(),
  sublabel: z.string(),
  lane: z.number().int(),
  row: z.number().int(),
  layer: z.enum(["infra", "agents", "providers", "channels"]),
  status: NodeStatusSchema,
  currentTask: z.string(),
  latencyMs: z.number(),
  tokensPerSec: z.number(),
  costUsd: z.number(),
  lastEvent: z.string(),
  sparkline: z.array(z.number()),
});
export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;

export const WorkflowEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  status: z.enum(["idle", "active", "failed", "fallback"]),
  throughput: z.number(),
  label: z.string().optional(),
});
export type WorkflowEdge = z.infer<typeof WorkflowEdgeSchema>;

export const WorkflowSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  description: z.string(),
  isDefault: z.boolean(),
  valid: z.boolean(),
  validationNotes: z.array(z.string()),
  updatedAt: z.string(),
  nodes: z.array(WorkflowNodeSchema),
  edges: z.array(WorkflowEdgeSchema),
});
export type Workflow = z.infer<typeof WorkflowSchema>;

export const RunStepSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  agentName: z.string(),
  agentMonogram: z.string(),
  modelUsed: z.string(),
  providerId: ProviderIdSchema,
  status: z.enum(["completed", "running", "waiting", "failed", "queued"]),
  startedAt: z.string(),
  durationSec: z.number(),
  tokensIn: z.number().int(),
  tokensOut: z.number().int(),
  costUsd: z.number(),
  toolCalls: z.array(z.string()),
  streamedOutput: z.string(),
  inputJson: z.record(z.unknown()),
  outputJson: z.record(z.unknown()),
  criticalPath: z.boolean(),
  startOffsetSec: z.number(),
});
export type RunStep = z.infer<typeof RunStepSchema>;

export const ContentSourceSchema = z.enum([
  "Antigravity",
  "MCP (Claude Code)",
  "MCP (Cursor)",
  "Manual Drop",
]);
export type ContentSource = z.infer<typeof ContentSourceSchema>;

export const RunSchema = z.object({
  id: z.string(),
  contentId: z.string(),
  contentTitle: z.string(),
  source: ContentSourceSchema,
  status: z.enum(["running", "awaiting_approval", "completed", "failed"]),
  startedAt: z.string(),
  durationSec: z.number(),
  totalTokens: z.number().int(),
  totalCostUsd: z.number(),
  activeAgentId: z.string().optional(),
  steps: z.array(RunStepSchema),
});
export type Run = z.infer<typeof RunSchema>;

export const TranscriptSegmentSchema = z.object({
  timeSec: z.number(),
  timestamp: z.string(),
  speaker: z.string(),
  text: z.string(),
});
export type TranscriptSegment = z.infer<typeof TranscriptSegmentSchema>;

export const VariantSchema = z.object({
  id: z.string(),
  contentId: z.string(),
  platform: PlatformIdSchema,
  status: z.enum(["draft", "awaiting_approval", "approved", "scheduled", "published", "rejected"]),
  title: z.string(),
  body: z.string(),
  previousBody: z.string(),
  hashtags: z.array(z.string()),
  cta: z.string(),
  chapters: z.array(z.object({ time: z.string(), title: z.string() })).optional(),
  thumbnailPrompt: z.string().optional(),
  scheduledFor: z.string().optional(),
  score: z.number(),
  version: z.number().int(),
});
export type Variant = z.infer<typeof VariantSchema>;

export const ContentItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  source: ContentSourceSchema,
  durationSec: z.number(),
  durationFormatted: z.string(),
  status: ContentStatusSchema,
  platforms: z.array(PlatformIdSchema),
  createdAt: z.string(),
  scheduledFor: z.string().optional(),
  runId: z.string(),
  costUsd: z.number(),
  transcript: z.array(TranscriptSegmentSchema),
  variants: z.record(PlatformIdSchema, VariantSchema),
  metadata: z.object({
    resolution: z.string(),
    fps: z.number(),
    codec: z.string(),
    fileSizeMb: z.number(),
    ingestCommit: z.string().optional(),
  }),
});
export type ContentItem = z.infer<typeof ContentItemSchema>;

export const ApprovalSchema = z.object({
  id: z.string(),
  contentId: z.string(),
  contentTitle: z.string(),
  runId: z.string(),
  submittedAt: z.string(),
  authorAgent: z.string(),
  brandComplianceScore: z.number(),
  status: z.enum(["pending", "approved", "rejected", "scheduled"]),
  variants: z.record(PlatformIdSchema, VariantSchema),
});
export type Approval = z.infer<typeof ApprovalSchema>;

export const ChannelSchema = z.object({
  id: PlatformIdSchema,
  name: z.string(),
  handle: z.string(),
  connected: z.boolean(),
  tokenHealth: z.enum(["healthy", "expiring_soon", "expired"]),
  tokenExpiresInDays: z.number(),
  autonomyMode: AutonomyModeSchema,
  quotaUsed: z.number().optional(),
  quotaLimit: z.number().optional(),
  defaultHashtags: z.array(z.string()),
  defaultCta: z.string(),
  signature: z.string(),
  postingWindows: z.array(z.string()),
  language: z.string(),
  latencyMs: z.number(),
});
export type Channel = z.infer<typeof ChannelSchema>;

export const PostSchema = z.object({
  id: z.string(),
  contentId: z.string(),
  title: z.string(),
  platform: PlatformIdSchema,
  status: z.enum(["scheduled", "published", "conflict"]),
  scheduledAt: z.string(),
  dayOfMonth: z.number().int().min(1).max(31),
  hour: z.number().int().min(0).max(23),
  impressions: z.number().optional(),
  engagementRate: z.number().optional(),
  clicks: z.number().optional(),
  bestTimeMatch: z.boolean(),
  conflictWarning: z.string().optional(),
});
export type Post = z.infer<typeof PostSchema>;

export const TokenScopeSchema = z.enum(["read", "write", "ingest", "publish", "admin"]);
export type TokenScope = z.infer<typeof TokenScopeSchema>;

export const ApiTokenSchema = z.object({
  id: z.string(),
  name: z.string(),
  prefix: z.string(),
  scopes: z.array(TokenScopeSchema),
  createdAt: z.string(),
  expiresAt: z.string(),
  lastUsedAt: z.string(),
  clientAgent: z.string(),
});
export type ApiToken = z.infer<typeof ApiTokenSchema>;

export const UsageRecordSchema = z.object({
  date: z.string(),
  geminiUsd: z.number(),
  nvidiaUsd: z.number(),
  grokUsd: z.number(),
  cloudflareUsd: z.number(),
  tokensTotal: z.number(),
});
export type UsageRecord = z.infer<typeof UsageRecordSchema>;

export const AnalyticsSnapshotSchema = z.object({
  totalImpressions: z.number(),
  avgEngagementRate: z.number(),
  publishedCount30d: z.number(),
  approvalTurnaroundMin: z.number(),
  platformBreakdown: z.array(
    z.object({
      platform: PlatformIdSchema,
      impressions: z.number(),
      engagementRate: z.number(),
      watchTimeHrs: z.number(),
      topHook: z.string(),
    })
  ),
  bestTimeHeatmap: z.array(z.array(z.number())),
  analystInsights: z.array(
    z.object({
      id: z.string(),
      timestamp: z.string(),
      title: z.string(),
      detail: z.string(),
      metricDelta: z.string(),
    })
  ),
});
export type AnalyticsSnapshot = z.infer<typeof AnalyticsSnapshotSchema>;

export const BrandKitSchema = z.object({
  voiceDescriptors: z.array(
    z.object({
      label: z.string(),
      value: z.number(),
      leftPole: z.string(),
      rightPole: z.string(),
    })
  ),
  freeTextVoice: z.string(),
  doList: z.array(z.string()),
  dontList: z.array(z.string()),
  bannedWords: z.array(z.string()),
  examplePosts: z.array(z.object({ platform: PlatformIdSchema, text: z.string() })),
  personas: z.array(z.object({ name: z.string(), role: z.string(), painPoints: z.string() })),
  ctaLibrary: z.array(z.string()),
  hashtagSets: z.array(z.object({ name: z.string(), tags: z.array(z.string()) })),
});
export type BrandKit = z.infer<typeof BrandKitSchema>;

export const AuditEventSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  actor: z.string(),
  category: z.enum(["mcp.tool", "run.step", "approval", "security", "provider.fallback", "publish"]),
  action: z.string(),
  target: z.string(),
  latencyMs: z.number().optional(),
  status: z.enum(["ok", "warning", "error"]),
  meta: z.string().optional(),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

export const SystemServiceSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(["api", "worker", "queues", "db", "redis", "storage", "disk"]),
  status: z.enum(["healthy", "degraded", "down"]),
  uptime: z.string(),
  latencyMs: z.number(),
  detail: z.string(),
});
export type SystemService = z.infer<typeof SystemServiceSchema>;

export const DlqJobSchema = z.object({
  id: z.string(),
  queue: z.string(),
  payloadSummary: z.string(),
  errorReason: z.string(),
  failedAt: z.string(),
  attempts: z.number().int(),
});
export type DlqJob = z.infer<typeof DlqJobSchema>;

export const LiveEventTypeSchema = z.enum([
  "node.status",
  "edge.packet",
  "agent.token",
  "tool.call",
  "provider.fallback",
  "cost.tick",
  "run.status",
]);
export type LiveEventType = z.infer<typeof LiveEventTypeSchema>;

export const LiveBusEventSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  type: LiveEventTypeSchema,
  nodeId: z.string().optional(),
  edgeId: z.string().optional(),
  agentId: z.string().optional(),
  runId: z.string(),
  summary: z.string(),
  deltaCostUsd: z.number().optional(),
  deltaTokens: z.number().optional(),
  status: NodeStatusSchema.optional(),
});
export type LiveBusEvent = z.infer<typeof LiveBusEventSchema>;
