export type AutonomyMode = "manual" | "approve_before_publish" | "auto";
export type PlatformId = "linkedin" | "instagram" | "youtube";
export type ContentStatus =
  | "ingested"
  | "analysing"
  | "writing"
  | "awaiting_approval"
  | "scheduled"
  | "published"
  | "failed";

export type NodeStatus = "idle" | "running" | "waiting" | "failed" | "degraded";
export type ProviderId =
  | "gemini"
  | "nvidia_nim"
  | "xai_grok"
  | "cf_workers_ai"
  | "cf_ai_gateway"
  | "custom_openai";

export type AgentRole =
  | "director"
  | "video_analyst"
  | "strategist"
  | "linkedin_writer"
  | "instagram_writer"
  | "youtube_writer"
  | "seo_hashtag"
  | "thumbnail_concept"
  | "brand_reviewer"
  | "scheduler"
  | "publisher"
  | "analyst"
  | "engagement_assistant";

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  autonomyMode: AutonomyMode;
  publishingPaused: boolean;
  dailyBudgetUsd: number;
  spentTodayUsd: number;
}

export interface Provider {
  id: ProviderId;
  name: string;
  monogram: string;
  status: "connected" | "rate_limited" | "degraded" | "disconnected";
  maskedKey: string;
  baseUrl?: string;
  latencyMs: number;
  requestsToday: number;
  spendTodayUsd: number;
  budgetLimitUsd: number;
  fallbackOrder: number;
}

export interface Model {
  id: string;
  name: string;
  providerId: ProviderId;
  capabilities: ("reasoning" | "vision" | "fast" | "structured_json" | "long_context")[];
  contextWindow: number;
  inputCostPer1M: number;
  outputCostPer1M: number;
  latencyP50Ms: number;
}

export interface AgentPromptVersion {
  version: string;
  createdAt: string;
  author: string;
  note: string;
  systemPrompt: string;
}

export interface Agent {
  id: string;
  role: AgentRole;
  name: string;
  monogram: string;
  description: string;
  primaryModelId: string;
  fallbackModelId: string;
  temperature: number;
  successRate: number;
  avgCostUsd: number;
  avgDurationSec: number;
  status: NodeStatus;
  currentTask: string;
  systemPrompt: string;
  outputSchema: string;
  tools: string[];
  guardrails: string[];
  versions: AgentPromptVersion[];
}

export interface WorkflowNode {
  id: string;
  type: "source" | "gateway" | "core" | "media" | "agent" | "provider" | "approval" | "publisher" | "condition" | "parallel" | "delay";
  label: string;
  sublabel: string;
  lane: number;
  row: number;
  layer: "infra" | "agents" | "providers" | "channels";
  status: NodeStatus;
  currentTask: string;
  latencyMs: number;
  tokensPerSec: number;
  costUsd: number;
  lastEvent: string;
  sparkline: number[];
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  status: "idle" | "active" | "failed" | "fallback";
  throughput: number;
  label?: string;
}

export interface Workflow {
  id: string;
  name: string;
  version: string;
  description: string;
  isDefault: boolean;
  valid: boolean;
  validationNotes: string[];
  updatedAt: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface RunStep {
  id: string;
  agentId: string;
  agentName: string;
  agentMonogram: string;
  modelUsed: string;
  providerId: ProviderId;
  status: "completed" | "running" | "waiting" | "failed" | "queued";
  startedAt: string;
  durationSec: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  toolCalls: string[];
  streamedOutput: string;
  inputJson: Record<string, unknown>;
  outputJson: Record<string, unknown>;
  criticalPath: boolean;
  startOffsetSec: number;
}

export interface Run {
  id: string;
  contentId: string;
  contentTitle: string;
  source: "Antigravity" | "MCP (Claude Code)" | "MCP (Cursor)" | "Manual Drop";
  status: "running" | "awaiting_approval" | "completed" | "failed";
  startedAt: string;
  durationSec: number;
  totalTokens: number;
  totalCostUsd: number;
  activeAgentId?: string;
  steps: RunStep[];
}

export interface TranscriptSegment {
  timeSec: number;
  timestamp: string;
  speaker: string;
  text: string;
}

export interface Variant {
  id: string;
  contentId: string;
  platform: PlatformId;
  status: "draft" | "awaiting_approval" | "approved" | "scheduled" | "published" | "rejected";
  title: string;
  body: string;
  previousBody: string;
  hashtags: string[];
  cta: string;
  chapters?: { time: string; title: string }[];
  thumbnailPrompt?: string;
  scheduledFor?: string;
  score: number;
  version: number;
}

export interface ContentItem {
  id: string;
  title: string;
  source: "Antigravity" | "MCP (Claude Code)" | "MCP (Cursor)" | "Manual Drop";
  durationSec: number;
  durationFormatted: string;
  status: ContentStatus;
  platforms: PlatformId[];
  createdAt: string;
  scheduledFor?: string;
  runId: string;
  costUsd: number;
  transcript: TranscriptSegment[];
  variants: Record<PlatformId, Variant>;
  metadata: {
    resolution: string;
    fps: number;
    codec: string;
    fileSizeMb: number;
    ingestCommit?: string;
  };
}

export interface Approval {
  id: string;
  contentId: string;
  contentTitle: string;
  runId: string;
  submittedAt: string;
  authorAgent: string;
  brandComplianceScore: number;
  status: "pending" | "approved" | "rejected" | "scheduled";
  variants: Record<PlatformId, Variant>;
}

export interface Channel {
  id: PlatformId;
  name: string;
  handle: string;
  connected: boolean;
  tokenHealth: "healthy" | "expiring_soon" | "expired";
  tokenExpiresInDays: number;
  autonomyMode: AutonomyMode;
  quotaUsed?: number;
  quotaLimit?: number;
  defaultHashtags: string[];
  defaultCta: string;
  signature: string;
  postingWindows: string[];
  language: string;
  latencyMs: number;
}

export interface Post {
  id: string;
  contentId: string;
  title: string;
  platform: PlatformId;
  status: "scheduled" | "published" | "conflict";
  scheduledAt: string;
  dayOfMonth: number;
  hour: number;
  impressions?: number;
  engagementRate?: number;
  clicks?: number;
  bestTimeMatch: boolean;
  conflictWarning?: string;
}

export interface ApiToken {
  id: string;
  name: string;
  prefix: string;
  scopes: ("read" | "write" | "ingest" | "publish" | "admin")[];
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string;
  clientAgent: string;
}

export interface UsageRecord {
  date: string;
  geminiUsd: number;
  nvidiaUsd: number;
  grokUsd: number;
  cloudflareUsd: number;
  tokensTotal: number;
}

export interface AnalyticsSnapshot {
  totalImpressions: number;
  avgEngagementRate: number;
  publishedCount30d: number;
  approvalTurnaroundMin: number;
  platformBreakdown: {
    platform: PlatformId;
    impressions: number;
    engagementRate: number;
    watchTimeHrs: number;
    topHook: string;
  }[];
  bestTimeHeatmap: number[][]; // 7 days x 24 hours
  analystInsights: {
    id: string;
    timestamp: string;
    title: string;
    detail: string;
    metricDelta: string;
  }[];
}

export interface BrandKit {
  voiceDescriptors: { label: string; value: number; leftPole: string; rightPole: string }[];
  freeTextVoice: string;
  doList: string[];
  dontList: string[];
  bannedWords: string[];
  examplePosts: { platform: PlatformId; text: string }[];
  personas: { name: string; role: string; painPoints: string }[];
  ctaLibrary: string[];
  hashtagSets: { name: string; tags: string[] }[];
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  actor: string;
  category: "mcp.tool" | "run.step" | "approval" | "security" | "provider.fallback" | "publish";
  action: string;
  target: string;
  latencyMs?: number;
  status: "ok" | "warning" | "error";
  meta?: string;
}

export interface SystemService {
  id: string;
  name: string;
  category: "api" | "worker" | "queues" | "db" | "redis" | "storage" | "disk";
  status: "healthy" | "degraded" | "down";
  uptime: string;
  latencyMs: number;
  detail: string;
}

export interface DlqJob {
  id: string;
  queue: string;
  payloadSummary: string;
  errorReason: string;
  failedAt: string;
  attempts: number;
}

export type LiveEventType =
  | "node.status"
  | "edge.packet"
  | "agent.token"
  | "tool.call"
  | "provider.fallback"
  | "cost.tick"
  | "run.status";

export interface LiveBusEvent {
  id: string;
  timestamp: string;
  type: LiveEventType;
  nodeId?: string;
  edgeId?: string;
  agentId?: string;
  runId: string;
  summary: string;
  deltaCostUsd?: number;
  deltaTokens?: number;
  status?: NodeStatus;
}
