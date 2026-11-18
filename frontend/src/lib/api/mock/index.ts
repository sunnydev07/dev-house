import type { DevHouseApiClient } from "../client";
import type {
  Workspace,
  Provider,
  Model,
  Agent,
  Workflow,
  Run,
  ContentItem,
  Approval,
  Channel,
  Post,
  ApiToken,
  UsageRecord,
  AnalyticsSnapshot,
  BrandKit,
  AuditEvent,
  SystemService,
  DlqJob,
  PlatformId,
  Variant,
} from "../types";

const delay = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));

function buildMockVariants(contentId: string, title: string, status: ContentItem["status"]): Record<PlatformId, Variant> {
  const variantStatus: Variant["status"] =
    status === "published" ? "published" : status === "scheduled" ? "scheduled" : "awaiting_approval";
  return {
    linkedin: {
      id: `var_${contentId}_li`,
      contentId,
      platform: "linkedin",
      status: variantStatus,
      title: `${title} — Production Field Notes`,
      body: `Engineering breakdown: ${title}.\n\nMoving the hot ring-buffer to Rust via N-API with zero-copy SharedArrayBuffer slices cut p99 bridge latency from 14.2ms to 0.38ms.\n\n— Built inside Dev House`,
      previousBody: `Initial draft covering ${title}.`,
      hashtags: ["#SystemsEngineering", "#LLMOrchestration", "#DeveloperTools"],
      cta: "Full benchmark harness and config in the repository link below.",
      score: 96,
      version: 2,
    },
    instagram: {
      id: `var_${contentId}_ig`,
      contentId,
      platform: "instagram",
      status: variantStatus,
      title: title.slice(0, 48),
      body: `Frame [00:00]: "14.2ms -> 0.38ms p99."\n\n${title}. Clean trace, zero fluff, reproducible config pinned in bio.`,
      previousBody: `Short Reel caption for ${title}.`,
      hashtags: ["#devtooling", "#buildinpublic", "#softwarearchitecture"],
      cta: "Trace + config in bio.",
      score: 95,
      version: 1,
    },
    youtube: {
      id: `var_${contentId}_yt`,
      contentId,
      platform: "youtube",
      status: variantStatus,
      title: title.slice(0, 60),
      body: `Deep-dive engineering walkthrough of ${title}, including flamegraphs, failure recovery, and MCP config snippets.`,
      previousBody: `YouTube description for ${title}.`,
      chapters: [
        { time: "00:00", title: "Problem statement & baseline telemetry" },
        { time: "00:42", title: "Profiling the bottleneck under concurrency" },
        { time: "01:42", title: "Architecture implementation & zero-copy fix" },
      ],
      thumbnailPrompt: "Dark charcoal canvas (#0B0A09), crisp topological DAG node graph with a single lit ember (#F2A33A) critical path edge",
      hashtags: ["#AIInfrastructure", "#SystemsEngineering"],
      cta: "Star the repository and inspect the trace in the description.",
      score: 97,
      version: 2,
    },
  };
}

let workspaceState: Workspace = {
  id: "ws_devhouse_core",
  name: "Dev House Core",
  slug: "dev-house-core",
  timezone: "Asia/Kolkata",
  autonomyMode: "approve_before_publish",
  publishingPaused: false,
  dailyBudgetUsd: 25.0,
  spentTodayUsd: 14.82,
};

const SEED_TITLES: [string, string, ContentItem["source"], number, string, ContentItem["status"], PlatformId[], string, number][] = [
  ["cnt_01", "Zero-Copy IPC Between Rust Worker Threads and Node.js N-API", "Antigravity", 228, "03:48", "writing", ["linkedin", "instagram", "youtube"], "run_9042_live", 0.194],
  ["cnt_02", "Building Deterministic DAG Schedulers with Kahn Topological Sort", "MCP (Claude Code)", 212, "03:32", "awaiting_approval", ["linkedin", "instagram", "youtube"], "run_9041", 0.172],
  ["cnt_03", "Cloudflare AI Gateway Fallback Chains: Surviving Provider 429s", "Antigravity", 245, "04:05", "awaiting_approval", ["linkedin", "instagram", "youtube"], "run_9040", 0.158],
  ["cnt_04", "Why We Replaced Vector HNSW Re-Indexing with Streaming WAL Segments", "MCP (Cursor)", 198, "03:18", "published", ["linkedin", "instagram", "youtube"], "run_9039", 0.21],
  ["cnt_05", "Sub-50ms WebSocket Backpressure Control in Node.js 22", "Antigravity", 264, "04:24", "published", ["linkedin", "youtube"], "run_9038", 0.164],
  ["cnt_06", "Sub-50ms OCR & Barcode Compliance Validation Over WebSockets", "Antigravity", 184, "03:04", "awaiting_approval", ["linkedin", "instagram", "youtube"], "run_9038", 0.148],
  ["cnt_07", "PostgreSQL 17 JSONB Indexing Pitfalls Under High Write Concurrency", "Antigravity", 310, "05:10", "failed", ["linkedin", "youtube"], "run_9036", 0.052],
  ["cnt_08", "Designing Keyboard-First Pro Developer Consoles Without Visual Clutter", "MCP (Claude Code)", 205, "03:25", "published", ["linkedin", "instagram", "youtube"], "run_9035", 0.175],
  ["cnt_09", "Payment Gateway Idempotency Keys: Preventing Double Debits Under Retry Storms", "MCP (Claude Code)", 236, "03:56", "awaiting_approval", ["linkedin", "instagram", "youtube"], "run_9035", 0.169],
  ["cnt_10", "Tauri v2 vs Electron Memory Footprint on Windows 11 Workstations", "Antigravity", 190, "03:10", "scheduled", ["linkedin", "instagram", "youtube"], "run_9034", 0.149],
  ["cnt_11", "Structured Outputs with Zod & Gemini 2.5 Pro Response Schemas", "MCP (Cursor)", 176, "02:56", "published", ["linkedin", "youtube"], "run_9033", 0.141],
  ["cnt_12", "Automating FFmpeg Keyframe Extraction & Whisper Word Timestamps", "Antigravity", 252, "04:12", "published", ["linkedin", "instagram", "youtube"], "run_9032", 0.218],
];

const contentItemsState: ContentItem[] = SEED_TITLES.map(
  ([id, title, source, durationSec, durationFormatted, status, platforms, runId, costUsd], idx) => ({
    id,
    title,
    source,
    durationSec,
    durationFormatted,
    status,
    platforms,
    createdAt: idx === 0 ? "Just now" : `${idx + 1}h ago`,
    scheduledFor: status === "scheduled" ? "2026-11-19 18:30 IST" : undefined,
    runId,
    costUsd,
    transcript: [
      { timeSec: 0, timestamp: "00:00", speaker: "Sunny", text: `In this walkthrough we inspect ${title} inside the production environment.` },
      { timeSec: 42, timestamp: "00:42", speaker: "Sunny", text: "Notice the flamegraph spike here—31% of wall-clock time is spent serializing payloads across boundaries." },
      { timeSec: 102, timestamp: "01:42", speaker: "Sunny", text: "By switching to a zero-copy slice layout and deterministic schema validation, p99 drops from 14.2ms down to 0.38ms." },
    ],
    variants: buildMockVariants(id, title, status),
    metadata: {
      resolution: "3840x2160 (4K)",
      fps: 60,
      codec: "H.265 / HEVC + PCM",
      fileSizeMb: 48.2,
      ingestCommit: `8f92c${(10 + idx).toString(16)}`,
    },
  })
);

const runsState: Run[] = [
  {
    id: "run_9042_live",
    contentId: "cnt_01",
    contentTitle: "Zero-Copy IPC Between Rust Worker Threads and Node.js N-API",
    source: "Antigravity",
    status: "running",
    startedAt: "16:34:12 IST",
    durationSec: 42,
    totalTokens: 18420,
    totalCostUsd: 0.194,
    activeAgentId: "agt_linkedin_writer",
    steps: [
      {
        id: "stp_1",
        agentId: "agt_video_analyst",
        agentName: "Video Analyst",
        agentMonogram: "VA",
        modelUsed: "gemini-2.5-pro",
        providerId: "gemini",
        status: "completed",
        startedAt: "16:34:12",
        durationSec: 8.2,
        tokensIn: 4200,
        tokensOut: 690,
        costUsd: 0.064,
        toolCalls: ["ffmpeg_scene_detect(18 frames)", "ocr_terminal_frame(01:42)"],
        streamedOutput: "Extracted flamegraph comparison at 01:42 showing p99 serialization drop from 14.2ms to 0.38ms.",
        inputJson: { videoUri: "r2://devhouse-prod/ag-stream-904.mp4", durationSec: 228, fps: 60 },
        outputJson: { primaryMetric: "14.2ms -> 0.38ms p99" },
        criticalPath: true,
        startOffsetSec: 0,
      },
    ],
  },
  {
    id: "run_9041",
    contentId: "cnt_02",
    contentTitle: "Building Deterministic DAG Schedulers with Kahn Topological Sort",
    source: "MCP (Claude Code)",
    status: "awaiting_approval",
    startedAt: "15:10:04 IST",
    durationSec: 38,
    totalTokens: 16210,
    totalCostUsd: 0.172,
    steps: [],
  },
];

const approvalsState: Approval[] = [
  {
    id: "apr_01",
    contentId: "cnt_02",
    contentTitle: "Building Deterministic DAG Schedulers with Kahn Topological Sort",
    runId: "run_9041",
    submittedAt: "18m ago",
    authorAgent: "LinkedIn + IG + YT Writers (Reviewed by BR v4.0)",
    brandComplianceScore: 96,
    status: "pending",
    variants: contentItemsState[1]!.variants,
  },
  {
    id: "apr_02",
    contentId: "cnt_03",
    contentTitle: "Cloudflare AI Gateway Fallback Chains: Surviving Provider 429s",
    runId: "run_9040",
    submittedAt: "1h ago",
    authorAgent: "Director + 3 Writers",
    brandComplianceScore: 94,
    status: "pending",
    variants: contentItemsState[2]!.variants,
  },
];

const postsState: Post[] = [
  { id: "pst_1", contentId: "cnt_04", title: "Streaming WAL Segments vs HNSW Re-Indexing", platform: "linkedin", status: "published", scheduledAt: "2026-11-14 09:30 IST", dayOfMonth: 14, hour: 9, impressions: 18420, engagementRate: 6.8, clicks: 940, bestTimeMatch: true },
  { id: "pst_4", contentId: "cnt_02", title: "Deterministic DAG Schedulers with Kahn Sort", platform: "linkedin", status: "scheduled", scheduledAt: "2026-11-17 09:30 IST", dayOfMonth: 17, hour: 9, bestTimeMatch: true },
  { id: "pst_6", contentId: "cnt_03", title: "Surviving Provider 429s with AI Gateway", platform: "linkedin", status: "conflict", scheduledAt: "2026-11-18 18:30 IST", dayOfMonth: 18, hour: 18, bestTimeMatch: true, conflictWarning: "Within 90m of another LinkedIn technical post" },
];

const agentsState: Agent[] = [
  {
    id: "agt_director",
    role: "director",
    name: "Director",
    monogram: "DR",
    description: "Orchestrates crew topology, inspects ingest payloads, assigns platform writers, and arbitrates retries.",
    primaryModelId: "gemini-2.5-pro",
    fallbackModelId: "nvidia-llama-3.3-70b",
    temperature: 0.2,
    successRate: 99.4,
    avgCostUsd: 0.042,
    avgDurationSec: 4.2,
    status: "running",
    currentTask: "Coordinating 3-channel fan-out for ag-stream-904.mp4",
    systemPrompt: "You are the Director of Dev House. Extract the core engineering insight and dispatch structured briefs to LinkedIn, Instagram, and YouTube Writers.",
    outputSchema: '{"type":"object","required":["thesis","targetPersona","platformBriefs"]}',
    tools: ["inspect_transcript", "query_brand_kit", "dispatch_subagents", "route_fallback_provider"],
    guardrails: ["No exclamation marks", "Reject unverified latency claims", "Max cost per run <= $0.65"],
    versions: [{ version: "v4.2 (Active)", createdAt: "2026-11-14 19:20 IST", author: "Sunny", note: "Added fallback routing directive.", systemPrompt: "You are the Director of Dev House..." }],
  },
];

let providersState: Provider[] = [
  { id: "gemini", name: "Google Gemini", monogram: "GM", status: "connected", maskedKey: "AIzaSyD••••••••••••••••••••••8kQ1", baseUrl: "https://generativelanguage.googleapis.com/v1beta", latencyMs: 380, requestsToday: 1420, spendTodayUsd: 6.84, budgetLimitUsd: 12.0, fallbackOrder: 1 },
  { id: "nvidia_nim", name: "NVIDIA NIM", monogram: "NV", status: "connected", maskedKey: "nvapi-7••••••••••••••••••••••9mP4", baseUrl: "https://integrate.api.nvidia.com/v1", latencyMs: 245, requestsToday: 890, spendTodayUsd: 3.42, budgetLimitUsd: 8.0, fallbackOrder: 2 },
  { id: "xai_grok", name: "xAI Grok", monogram: "XA", status: "connected", maskedKey: "xai-4kL••••••••••••••••••••••2vR8", baseUrl: "https://api.x.ai/v1", latencyMs: 310, requestsToday: 640, spendTodayUsd: 2.95, budgetLimitUsd: 6.0, fallbackOrder: 3 },
  { id: "cf_workers_ai", name: "Cloudflare Workers AI", monogram: "CW", status: "connected", maskedKey: "cf_ut_9••••••••••••••••••••••4zW1", baseUrl: "https://api.cloudflare.com/client/v4/accounts/88a1/ai/run", latencyMs: 165, requestsToday: 2150, spendTodayUsd: 0.96, budgetLimitUsd: 4.0, fallbackOrder: 4 },
  { id: "cf_ai_gateway", name: "Cloudflare AI Gateway", monogram: "CG", status: "connected", maskedKey: "cf_gw_2••••••••••••••••••••••7nB3", baseUrl: "https://gateway.ai.cloudflare.com/v1/88a1/dev-house-prod", latencyMs: 42, requestsToday: 5100, spendTodayUsd: 0.15, budgetLimitUsd: 2.0, fallbackOrder: 5 },
  { id: "custom_openai", name: "Custom OpenAI-Compatible", monogram: "OA", status: "connected", maskedKey: "sk-loca••••••••••••••••••••••00x9", baseUrl: "https://vllm.devhouse.internal/v1", latencyMs: 190, requestsToday: 310, spendTodayUsd: 0.5, budgetLimitUsd: 5.0, fallbackOrder: 6 },
];

const modelsState: Model[] = [
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", providerId: "gemini", capabilities: ["reasoning", "vision", "structured_json", "long_context"], contextWindow: 2000000, inputCostPer1M: 1.25, outputCostPer1M: 5.0, latencyP50Ms: 410 },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", providerId: "gemini", capabilities: ["fast", "vision", "structured_json", "long_context"], contextWindow: 1000000, inputCostPer1M: 0.15, outputCostPer1M: 0.6, latencyP50Ms: 185 },
  { id: "nvidia-llama-3.3-70b", name: "Llama 3.3 70B Instruct NIM", providerId: "nvidia_nim", capabilities: ["reasoning", "structured_json", "fast"], contextWindow: 128000, inputCostPer1M: 0.4, outputCostPer1M: 0.4, latencyP50Ms: 230 },
  { id: "grok-3-mini", name: "Grok 3 Mini Fast", providerId: "xai_grok", capabilities: ["reasoning", "fast", "structured_json"], contextWindow: 131072, inputCostPer1M: 0.3, outputCostPer1M: 0.5, latencyP50Ms: 260 },
  { id: "cf-llama-3.1-8b", name: "Workers AI Llama 3.1 8B fp8", providerId: "cf_workers_ai", capabilities: ["fast", "structured_json"], contextWindow: 64000, inputCostPer1M: 0.08, outputCostPer1M: 0.12, latencyP50Ms: 140 },
];

const channelsState: Channel[] = [
  { id: "linkedin", name: "LinkedIn Company & Author", handle: "@devhouse-systems · Sunny Gupta", connected: true, tokenHealth: "healthy", tokenExpiresInDays: 52, autonomyMode: "approve_before_publish", defaultHashtags: ["#SystemsEngineering", "#LLMOrchestration"], defaultCta: "Full benchmark harness in repo.", signature: "— Built inside Dev House", postingWindows: ["Tue 09:30 IST", "Wed 18:30 IST"], language: "en-IN / Technical", latencyMs: 210 },
  { id: "instagram", name: "Instagram Reels (Builder Feed)", handle: "@devhouse.sh", connected: true, tokenHealth: "healthy", tokenExpiresInDays: 44, autonomyMode: "approve_before_publish", defaultHashtags: ["#devtooling", "#buildinpublic"], defaultCta: "Trace in bio.", signature: "devhouse.sh", postingWindows: ["Mon 20:00 IST", "Thu 21:00 IST"], language: "en-US / Concise", latencyMs: 285 },
  { id: "youtube", name: "YouTube Engineering Channel", handle: "youtube.com/@DevHouseEngineering", connected: true, tokenHealth: "expiring_soon", tokenExpiresInDays: 6, autonomyMode: "manual", quotaUsed: 7420, quotaLimit: 10000, defaultHashtags: ["#AIInfrastructure", "#MCPServer"], defaultCta: "Star the repository.", signature: "Dev House Engineering · Jaipur", postingWindows: ["Wed 19:30 IST", "Sun 16:00 IST"], language: "en-US / Deep Dive", latencyMs: 340 },
];

let brandKitState: BrandKit = {
  voiceDescriptors: [
    { label: "Tone", value: 82, leftPole: "Casual / Conversational", rightPole: "Calm / Systems-Precise" },
    { label: "Density", value: 88, leftPole: "High-Level Overview", rightPole: "Benchmark & Code Grounded" },
  ],
  freeTextVoice: "Write like a staff systems engineer sharing field notes from a quiet lab at night. Never use exclamation marks.",
  doList: ["Cite exact p50/p99 latency numbers, memory footprints, and commit hashes from the video transcript."],
  dontList: ["Never use exclamation marks anywhere in titles, captions, or CTAs."],
  bannedWords: ["game-changer", "revolutionary", "unleash", "supercharge", "delve", "tapestry", "10x", "insane"],
  examplePosts: [{ platform: "linkedin", text: "Moving our token bucket rate-limiter into Redis Lua eliminated 11ms lock contention." }],
  personas: [{ name: "Staff / Principal Infrastructure Engineer", role: "Evaluates architecture rigor.", painPoints: "Allergic to marketing fluff." }],
  ctaLibrary: ["Full benchmark harness and MCP configuration in the repository link below."],
  hashtagSets: [{ name: "Core Systems & Infra", tags: ["#SystemsEngineering", "#DistributedSystems", "#RustLang"] }],
};

const apiTokensState: ApiToken[] = [
  { id: "tok_01", name: "Antigravity Production Pipeline", prefix: "dh_live_99a8••••••4f12", scopes: ["ingest", "read", "write"], createdAt: "2026-10-12", expiresAt: "2027-01-12", lastUsedAt: "12s ago", clientAgent: "Antigravity CLI v2.4" },
];

const usageHistoryState: UsageRecord[] = [
  { date: "2026-11-14", geminiUsd: 5.9, nvidiaUsd: 2.8, grokUsd: 2.1, cloudflareUsd: 0.9, tokensTotal: 1420000 },
  { date: "2026-11-15", geminiUsd: 6.2, nvidiaUsd: 3.1, grokUsd: 2.4, cloudflareUsd: 1.05, tokensTotal: 1580000 },
  { date: "2026-11-16", geminiUsd: 6.84, nvidiaUsd: 3.42, grokUsd: 2.95, cloudflareUsd: 1.11, tokensTotal: 1740000 },
];

const analyticsState: AnalyticsSnapshot = {
  totalImpressions: 184920,
  avgEngagementRate: 7.84,
  publishedCount30d: 28,
  approvalTurnaroundMin: 4.2,
  platformBreakdown: [
    { platform: "linkedin", impressions: 82400, engagementRate: 6.8, watchTimeHrs: 410, topHook: "Why JSON.stringify across worker boundaries quietly taxes LLM gateways" },
    { platform: "instagram", impressions: 41200, engagementRate: 8.1, watchTimeHrs: 295, topHook: "14.2ms -> 0.38ms: Zero-copy Rust + Node IPC" },
    { platform: "youtube", impressions: 61320, engagementRate: 9.4, watchTimeHrs: 1840, topHook: "Deterministic DAG Scheduling: Kahn Topological Sort + LLMs" },
  ],
  bestTimeHeatmap: Array.from({ length: 7 }, (_, d) => Array.from({ length: 24 }, (__, h) => (d * 17 + h * 29) % 100)),
  analystInsights: [
    { id: "ins_01", timestamp: "2h ago", title: "Flamegraph & terminal diff in first 4 seconds outperforms talking-head intros", detail: "Videos opening directly on a before/after latency metric retained 74% of viewers at 00:30.", metricDelta: "+28.4% Watch Retention" },
  ],
};

const auditEventsState: AuditEvent[] = [
  { id: "aud_1", timestamp: "16:34:45 IST", actor: "Claude Code MCP (tok_01)", category: "mcp.tool", action: "get_run_telemetry", target: "run_9042_live", latencyMs: 14, status: "ok", meta: '{"includeSteps":true}' },
];

const systemServicesState: SystemService[] = [
  { id: "srv_api", name: "Ingest & Console API", category: "api", status: "healthy", uptime: "99.98% (42d)", latencyMs: 16, detail: "Fastify v5 + OpenAPI 3.1 + SSE · v2.4.1" },
  { id: "srv_worker", name: "Agent Orchestration Worker Pool", category: "worker", status: "healthy", uptime: "99.95% (42d)", latencyMs: 28, detail: "8 concurrent DAG fibers · Crash-recovery supervisor" },
];

let dlqJobsState: DlqJob[] = [
  { id: "dlq_881", queue: "publish.youtube", payloadSummary: "cnt_07 · PostgreSQL 17 JSONB Indexing Pitfalls", errorReason: "YouTube OAuth refresh token near expiry window", failedAt: "Yesterday 14:12 IST", attempts: 3 },
];

const workflowState: Workflow = {
  id: "wf_video_to_3_platforms",
  name: "Video → 3 Platforms (Canonical Production DAG)",
  version: "v3.4",
  description: "Ingests 4K video stream, extracts FFmpeg keyframes + Whisper word timestamps, runs Director + 3 parallel writers, enforces Brand Reviewer gate, and dispatches to LinkedIn, Instagram, and YouTube.",
  isDefault: true,
  valid: true,
  validationNotes: ["Zero cycles — Kahn topological sort verified"],
  updatedAt: "2026-11-16T16:30:00+05:30",
  nodes: [
    { id: "src_antigravity", lane: 0, row: 0, layer: "infra", type: "source", label: "Antigravity Automation", sublabel: "Render & Commit Hook", status: "running", currentTask: "Streaming ag-stream-904.mp4", latencyMs: 38, tokensPerSec: 0, costUsd: 0, lastEvent: "video.chunk.push (48.2 MB)", sparkline: [12, 18, 25, 42, 39, 51, 48] },
    { id: "gw_ingest", lane: 1, row: 0, layer: "infra", type: "gateway", label: "Ingest Edge API", sublabel: "HMAC + Chunk Validator", status: "running", currentTask: "Validating SHA-256 & muxing", latencyMs: 19, tokensPerSec: 0, costUsd: 0.001, lastEvent: "stream.verified: 9042", sparkline: [30, 44, 52, 49, 60, 58, 63] },
  ],
  edges: [
    { id: "e_ag_ingest", source: "src_antigravity", target: "gw_ingest", status: "active", throughput: 3 },
  ],
};

export const mockApiClient: DevHouseApiClient = {
  async getWorkspace() {
    await delay();
    return { ...workspaceState };
  },
  async setAutonomyMode(mode) {
    await delay();
    workspaceState = { ...workspaceState, autonomyMode: mode };
    return { ...workspaceState };
  },
  async togglePublishingKillSwitch(paused) {
    await delay();
    workspaceState = { ...workspaceState, publishingPaused: paused };
    return { ...workspaceState };
  },
  async getContentItems() {
    await delay();
    return [...contentItemsState];
  },
  async ingestVideo(payload) {
    await delay();
    const id = `cnt_${contentItemsState.length + 1}`;
    const runId = `run_${9050 + runsState.length}`;
    const mins = Math.floor(payload.durationSec / 60).toString().padStart(2, "0");
    const secs = Math.floor(payload.durationSec % 60).toString().padStart(2, "0");
    const item: ContentItem = {
      id,
      title: payload.title,
      source: payload.source,
      durationSec: payload.durationSec,
      durationFormatted: `${mins}:${secs}`,
      status: "writing",
      platforms: ["linkedin", "instagram", "youtube"],
      createdAt: "Just now",
      runId,
      costUsd: 0.042,
      transcript: [
        { timeSec: 0, timestamp: "00:00", speaker: "Sunny", text: `Walkthrough of ${payload.title}.` },
      ],
      variants: buildMockVariants(id, payload.title, "writing"),
      metadata: { resolution: "3840x2160 (4K)", fps: 60, codec: "H.265 / HEVC", fileSizeMb: 41.8, ingestCommit: "a419e0b" },
    };
    contentItemsState.unshift(item);
    runsState.unshift({
      id: runId,
      contentId: id,
      contentTitle: payload.title,
      source: payload.source,
      status: "running",
      startedAt: "Just now",
      durationSec: 4,
      totalTokens: 2140,
      totalCostUsd: 0.042,
      activeAgentId: "agt_director",
      steps: [],
    });
    return item;
  },
  async getRuns() {
    await delay();
    return [...runsState];
  },
  async getRunById(id) {
    await delay();
    return runsState.find((r) => r.id === id);
  },
  async retryRunStep(runId, stepId) {
    await delay();
    const run = runsState.find((r) => r.id === runId) ?? runsState[0]!;
    const step = run.steps.find((s) => s.id === stepId);
    if (step) step.status = "completed";
    return { ...run };
  },
  async getApprovals() {
    await delay();
    return [...approvalsState];
  },
  async decideApproval(id, decision) {
    await delay();
    const apr = approvalsState.find((a) => a.id === id) ?? approvalsState[0]!;
    apr.status = decision;
    const item = contentItemsState.find((c) => c.id === apr.contentId);
    if (item) {
      item.status = decision === "approved" ? "published" : decision === "scheduled" ? "scheduled" : "failed";
    }
    return { ...apr };
  },
  async updateVariantCopy(contentId, platform, body) {
    await delay();
    const item = contentItemsState.find((c) => c.id === contentId) ?? contentItemsState[0]!;
    const v = item.variants[platform];
    v.previousBody = v.body;
    v.body = body;
    v.version += 1;
    return { ...item };
  },
  async getPosts() {
    await delay();
    return [...postsState];
  },
  async reschedulePost(postId, dayOfMonth, hour) {
    await delay();
    const p = postsState.find((x) => x.id === postId) ?? postsState[0]!;
    p.dayOfMonth = dayOfMonth;
    p.hour = hour;
    p.scheduledAt = `2026-11-${dayOfMonth} ${hour}:30 IST`;
    p.status = "scheduled";
    p.conflictWarning = undefined;
    return { ...p };
  },
  async getAgents() {
    await delay();
    return [...agentsState];
  },
  async updateAgent(agentId, patch) {
    await delay();
    const ag = agentsState.find((a) => a.id === agentId) ?? agentsState[0]!;
    Object.assign(ag, patch);
    return { ...ag };
  },
  async getWorkflow() {
    await delay();
    return workflowState;
  },
  async getProviders() {
    await delay();
    return [...providersState];
  },
  async addProviderKey(providerId, rawKey, baseUrl) {
    await delay();
    const prv = providersState.find((p) => p.id === providerId) ?? providersState[0]!;
    prv.maskedKey = `${rawKey.slice(0, 5)}••••••••••••••••••••••${rawKey.slice(-4)}`;
    prv.status = "connected";
    if (baseUrl) prv.baseUrl = baseUrl;
    return { ...prv };
  },
  async reorderProviderFallback(orderedIds) {
    await delay();
    orderedIds.forEach((id, idx) => {
      const p = providersState.find((x) => x.id === id);
      if (p) p.fallbackOrder = idx + 1;
    });
    providersState = [...providersState].sort((a, b) => a.fallbackOrder - b.fallbackOrder);
    return [...providersState];
  },
  async getModels() {
    await delay();
    return [...modelsState];
  },
  async getChannels() {
    await delay();
    return [...channelsState];
  },
  async toggleChannelConnection(channelId) {
    await delay();
    const ch = channelsState.find((c) => c.id === channelId) ?? channelsState[0]!;
    ch.connected = !ch.connected;
    return { ...ch };
  },
  async getAnalytics() {
    await delay();
    return analyticsState;
  },
  async getUsageHistory() {
    await delay();
    return [...usageHistoryState];
  },
  async getBrandKit() {
    await delay();
    return brandKitState;
  },
  async updateBrandKit(patch) {
    await delay();
    brandKitState = { ...brandKitState, ...patch };
    return brandKitState;
  },
  async getApiTokens() {
    await delay();
    return [...apiTokensState];
  },
  async createApiToken(name, scopes, expiresAt) {
    await delay();
    const plainSecret = `dh_live_${Math.random().toString(36).slice(2, 10)}_${Math.random().toString(36).slice(2, 14)}`;
    const token: ApiToken = {
      id: `tok_0${apiTokensState.length + 1}`,
      name,
      prefix: `${plainSecret.slice(0, 12)}••••••${plainSecret.slice(-4)}`,
      scopes,
      createdAt: "Just now",
      expiresAt,
      lastUsedAt: "Never",
      clientAgent: "MCP Client",
    };
    apiTokensState.unshift(token);
    return { token, plainSecret };
  },
  async getAuditEvents() {
    await delay();
    return [...auditEventsState];
  },
  async getSystemHealth() {
    await delay();
    return { services: [...systemServicesState], dlq: [...dlqJobsState] };
  },
  async retryDlqJob(jobId) {
    await delay();
    dlqJobsState = dlqJobsState.filter((j) => j.id !== jobId);
    return [...dlqJobsState];
  },
};
