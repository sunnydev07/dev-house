import crypto from "node:crypto";
import {
  SecretVault,
  AuthService,
  globalEventBus,
  type Workspace,
  type Provider,
  type Model,
  type Agent,
  type Workflow,
  type Run,
  type ContentItem,
  type Variant,
  type Approval,
  type Channel,
  type Post,
  type ApiToken,
  type UsageRecord,
  type AnalyticsSnapshot,
  type BrandKit,
  type AuditEvent,
  type SystemService,
  type DlqJob,
  type PlatformId,
  type ProviderId,
  type TokenScope,
} from "@devhouse/core";
import { pgBridge } from "./pgRepository.js";

export interface PlatformLimitSpec {
  platform: PlatformId;
  maxTitleChars: number;
  maxBodyChars: number;
  maxHashtags: number;
  aspectRatio: "16:9" | "9:16" | "1:1" | "4:5";
  maxDurationSec: number;
  maxFileSizeMb: number;
}

export interface PublishLedgerRecord {
  idempotencyKey: string;
  contentId: string;
  platform: PlatformId;
  version: number;
  state: "staged" | "uploading" | "published";
  platformPostId: string;
  publishedUrl: string;
  updatedAt: string;
}

/**
 * Idempotent publish ledger whose mutations are mirrored to PostgreSQL `publish_ledger`
 * via the write-through bridge when DATABASE_URL is reachable.
 */
class PersistentPublishLedger extends Map<string, PublishLedgerRecord> {
  constructor(private readonly workspaceId: string) {
    super();
  }

  override set(key: string, value: PublishLedgerRecord): this {
    super.set(key, value);
    void pgBridge.persistPublishLedger(value, this.workspaceId);
    return this;
  }
}

export class DevHouseRepository {
  public readonly vault = new SecretVault();
  public workspace: Workspace;
  public providers: Provider[];
  public encryptedProviderKeys = new Map<ProviderId, string[]>();
  public models: Model[];
  public agents: Agent[];
  public workflow: Workflow;
  public runs: Run[];
  public contentItems: ContentItem[];
  public contentHashes = new Map<string, string>(); // sha256 -> contentId
  public approvals: Approval[];
  public channels: Channel[];
  public encryptedChannelTokens = new Map<PlatformId, string>();
  public posts: Post[];
  public apiTokens: (ApiToken & { tokenHash: string; revoked?: boolean })[];
  public usageHistory: UsageRecord[];
  public analytics: AnalyticsSnapshot;
  public brandKit: BrandKit;
  public auditEvents: AuditEvent[];
  public systemServices: SystemService[];
  public dlqJobs: DlqJob[];
  public platformLimits: Record<PlatformId, PlatformLimitSpec>;
  public publishLedger: Map<string, PublishLedgerRecord>;

  constructor() {
    this.workspace = {
      id: "ws_devhouse_core",
      name: "Dev House Core",
      slug: "dev-house-core",
      timezone: "Asia/Kolkata",
      autonomyMode: "approve_before_publish",
      publishingPaused: false,
      dailyBudgetUsd: 25.0,
      spentTodayUsd: 14.82,
    };

    this.publishLedger = new PersistentPublishLedger(this.workspace.id);

    // Config-table driven platform limits (never hardcoded in worker)
    this.platformLimits = {
      linkedin: {
        platform: "linkedin",
        maxTitleChars: 140,
        maxBodyChars: 1600,
        maxHashtags: 6,
        aspectRatio: "16:9",
        maxDurationSec: 600,
        maxFileSizeMb: 512,
      },
      instagram: {
        platform: "instagram",
        maxTitleChars: 55,
        maxBodyChars: 2200,
        maxHashtags: 5,
        aspectRatio: "9:16",
        maxDurationSec: 90,
        maxFileSizeMb: 250,
      },
      youtube: {
        platform: "youtube",
        maxTitleChars: 62,
        maxBodyChars: 5000,
        maxHashtags: 8,
        aspectRatio: "16:9",
        maxDurationSec: 3600,
        maxFileSizeMb: 2048,
      },
    };

    // 6 BYOK Providers with AES-256-GCM encrypted keys in vault
    const initialProviderSeeds: {
      id: ProviderId;
      name: string;
      monogram: string;
      rawKey: string;
      baseUrl: string;
      latencyMs: number;
      requestsToday: number;
      spendTodayUsd: number;
      budgetLimitUsd: number;
      fallbackOrder: number;
    }[] = [
      {
        id: "gemini",
        name: "Google Gemini",
        monogram: "GM",
        rawKey: "AIzaSyD901928374655647382910DevHouse8kQ1",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        latencyMs: 380,
        requestsToday: 1420,
        spendTodayUsd: 6.84,
        budgetLimitUsd: 12.0,
        fallbackOrder: 1,
      },
      {
        id: "nvidia_nim",
        name: "NVIDIA NIM",
        monogram: "NV",
        rawKey: "nvapi-7x918273645546372819DevHouse9mP4",
        baseUrl: "https://integrate.api.nvidia.com/v1",
        latencyMs: 245,
        requestsToday: 890,
        spendTodayUsd: 3.42,
        budgetLimitUsd: 8.0,
        fallbackOrder: 2,
      },
      {
        id: "xai_grok",
        name: "xAI Grok",
        monogram: "XA",
        rawKey: "xai-4kL98172635445362718DevHouse2vR8",
        baseUrl: "https://api.x.ai/v1",
        latencyMs: 310,
        requestsToday: 640,
        spendTodayUsd: 2.95,
        budgetLimitUsd: 6.0,
        fallbackOrder: 3,
      },
      {
        id: "cf_workers_ai",
        name: "Cloudflare Workers AI",
        monogram: "CW",
        rawKey: "cf_ut_991827364554637281DevHouse4zW1",
        baseUrl: "https://api.cloudflare.com/client/v4/accounts/88a1/ai/run",
        latencyMs: 165,
        requestsToday: 2150,
        spendTodayUsd: 0.96,
        budgetLimitUsd: 4.0,
        fallbackOrder: 4,
      },
      {
        id: "cf_ai_gateway",
        name: "Cloudflare AI Gateway",
        monogram: "CG",
        rawKey: "cf_gw_219876543210123456DevHouse7nB3",
        baseUrl: "https://gateway.ai.cloudflare.com/v1/88a1/dev-house-prod",
        latencyMs: 42,
        requestsToday: 5100,
        spendTodayUsd: 0.15,
        budgetLimitUsd: 2.0,
        fallbackOrder: 5,
      },
      {
        id: "custom_openai",
        name: "Custom OpenAI-Compatible",
        monogram: "OA",
        rawKey: "sk-local9988776655443322DevHouse00x9",
        baseUrl: "https://vllm.devhouse.internal/v1",
        latencyMs: 190,
        requestsToday: 310,
        spendTodayUsd: 0.5,
        budgetLimitUsd: 5.0,
        fallbackOrder: 6,
      },
    ];

    this.providers = initialProviderSeeds.map((p) => {
      const envelope = this.vault.encrypt(p.rawKey, `provider:${p.id}`);
      this.encryptedProviderKeys.set(p.id, [envelope]);
      return {
        id: p.id,
        name: p.name,
        monogram: p.monogram,
        status: "connected",
        maskedKey: SecretVault.maskSecret(p.rawKey),
        baseUrl: p.baseUrl,
        latencyMs: p.latencyMs,
        requestsToday: p.requestsToday,
        spendTodayUsd: p.spendTodayUsd,
        budgetLimitUsd: p.budgetLimitUsd,
        fallbackOrder: p.fallbackOrder,
      };
    });

    this.models = [
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", providerId: "gemini", capabilities: ["reasoning", "vision", "structured_json", "long_context"], contextWindow: 2000000, inputCostPer1M: 1.25, outputCostPer1M: 5.0, latencyP50Ms: 410 },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", providerId: "gemini", capabilities: ["fast", "vision", "structured_json", "long_context"], contextWindow: 1000000, inputCostPer1M: 0.15, outputCostPer1M: 0.6, latencyP50Ms: 185 },
      { id: "nvidia-llama-3.3-70b", name: "Llama 3.3 70B Instruct NIM", providerId: "nvidia_nim", capabilities: ["reasoning", "structured_json", "fast"], contextWindow: 128000, inputCostPer1M: 0.4, outputCostPer1M: 0.4, latencyP50Ms: 230 },
      { id: "nvidia-nemotron-ultra-253b", name: "Nemotron Ultra 253B", providerId: "nvidia_nim", capabilities: ["reasoning", "structured_json"], contextWindow: 128000, inputCostPer1M: 0.85, outputCostPer1M: 1.8, latencyP50Ms: 390 },
      { id: "grok-3-mini", name: "Grok 3 Mini Fast", providerId: "xai_grok", capabilities: ["reasoning", "fast", "structured_json"], contextWindow: 131072, inputCostPer1M: 0.3, outputCostPer1M: 0.5, latencyP50Ms: 260 },
      { id: "grok-3-vision", name: "Grok 3 Vision", providerId: "xai_grok", capabilities: ["vision", "reasoning", "structured_json"], contextWindow: 131072, inputCostPer1M: 2.0, outputCostPer1M: 10.0, latencyP50Ms: 370 },
      { id: "cf-llama-3.1-8b", name: "Workers AI Llama 3.1 8B fp8", providerId: "cf_workers_ai", capabilities: ["fast", "structured_json"], contextWindow: 64000, inputCostPer1M: 0.08, outputCostPer1M: 0.12, latencyP50Ms: 140 },
      { id: "custom-local-vllm", name: "Qwen 2.5 Coder 32B (vLLM)", providerId: "custom_openai", capabilities: ["reasoning", "structured_json", "fast"], contextWindow: 65536, inputCostPer1M: 0.1, outputCostPer1M: 0.1, latencyP50Ms: 190 },
    ];

    this.agents = [
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
        versions: [
          { version: "v4.2 (Active)", createdAt: "2026-11-14 19:20 IST", author: "Sunny", note: "Added fallback routing directive when Gemini 2.5 Pro hits 429 RPM.", systemPrompt: "You are the Director of Dev House..." },
          { version: "v4.1", createdAt: "2026-11-08 14:10 IST", author: "Sunny", note: "Tightened persona mapping for Staff Systems Engineers.", systemPrompt: "You are the Director of Dev House (v4.1)..." },
          { version: "v4.0", createdAt: "2026-10-28 11:05 IST", author: "Sunny", note: "Initial 13-agent topology release.", systemPrompt: "You are the Director of Dev House (v4.0)..." },
        ],
      },
      {
        id: "agt_video_analyst",
        role: "video_analyst",
        name: "Video Analyst",
        monogram: "VA",
        description: "Extracts terminal keyframes, code diffs, spoken hooks, and pacing markers from raw video streams.",
        primaryModelId: "gemini-2.5-pro",
        fallbackModelId: "grok-3-vision",
        temperature: 0.1,
        successRate: 98.7,
        avgCostUsd: 0.068,
        avgDurationSec: 8.5,
        status: "running",
        currentTask: "Scanning 01:42 terminal flamegraph keyframe",
        systemPrompt: "Extract timestamped technical moments, visible CLI commands, and architecture diagrams.",
        outputSchema: '{"type":"object","required":["hooks","chapters","codeSnippets"]}',
        tools: ["ffmpeg_scene_detect", "whisper_align", "ocr_terminal_frame"],
        guardrails: ["Verify timestamp bounds against video duration", "Redact visible API keys in terminal frames"],
        versions: [{ version: "v2.8 (Active)", createdAt: "2026-11-12", author: "Sunny", note: "Added terminal secret redaction.", systemPrompt: "Extract timestamped technical moments..." }],
      },
      {
        id: "agt_strategist",
        role: "strategist",
        name: "Strategist",
        monogram: "ST",
        description: "Maps raw engineering walkthroughs to audience personas and platform-specific narrative arcs.",
        primaryModelId: "gemini-2.5-pro",
        fallbackModelId: "nvidia-llama-3.3-70b",
        temperature: 0.35,
        successRate: 99.1,
        avgCostUsd: 0.031,
        avgDurationSec: 5.1,
        status: "idle",
        currentTask: "Completed angle selection: Zero-copy IPC latency",
        systemPrompt: "Position technical demos for Staff Engineers on LinkedIn, builders on YouTube, and visual developers on Instagram.",
        outputSchema: '{"type":"object","required":["narrativeArc","hookCandidates"]}',
        tools: ["read_analytics_top_hooks", "persona_matcher"],
        guardrails: ["Avoid generic AI thought-leadership tropes"],
        versions: [{ version: "v3.1 (Active)", createdAt: "2026-11-10", author: "Sunny", note: "Grounded hooks in historical CTR data.", systemPrompt: "Position technical demos..." }],
      },
      {
        id: "agt_linkedin_writer",
        role: "linkedin_writer",
        name: "LinkedIn Writer",
        monogram: "LW",
        description: "Drafts technical architecture breakdowns and benchmark posts tailored for engineering leaders.",
        primaryModelId: "gemini-2.5-pro",
        fallbackModelId: "nvidia-llama-3.3-70b",
        temperature: 0.4,
        successRate: 97.9,
        avgCostUsd: 0.038,
        avgDurationSec: 6.4,
        status: "running",
        currentTask: "Streaming architecture breakdown (via NVIDIA NIM fallback)",
        systemPrompt: "Write concise, high-signal engineering posts for LinkedIn. Lead with a concrete metric or architectural trade-off. Never use exclamation marks.",
        outputSchema: '{"type":"object","required":["headline","body","cta","hashtags"]}',
        tools: ["brand_voice_check", "character_counter"],
        guardrails: ["Max 1,600 characters", "Zero banned hype words", "Include concrete tradeoff"],
        versions: [{ version: "v5.0 (Active)", createdAt: "2026-11-15", author: "Sunny", note: "Enforced short paragraph cadence.", systemPrompt: "Write concise, high-signal engineering posts..." }],
      },
      {
        id: "agt_instagram_writer",
        role: "instagram_writer",
        name: "Instagram Writer",
        monogram: "IW",
        description: "Crafts kinetic Reel captions, on-screen hook overlays, and concise builder notes.",
        primaryModelId: "grok-3-mini",
        fallbackModelId: "cf-llama-3.1-8b",
        temperature: 0.45,
        successRate: 98.5,
        avgCostUsd: 0.019,
        avgDurationSec: 3.8,
        status: "running",
        currentTask: "Generating Reel overlay timestamps + caption",
        systemPrompt: "Write tight, technical Reel captions with a 6-word first-frame hook and clean builder notes below.",
        outputSchema: '{"type":"object","required":["frameHook","caption","hashtags"]}',
        tools: ["reel_safe_zone_check", "hashtag_selector"],
        guardrails: ["First line under 55 chars", "Max 5 hashtags"],
        versions: [{ version: "v2.4 (Active)", createdAt: "2026-11-09", author: "Sunny", note: "Tuned for 9:16 code walkthroughs.", systemPrompt: "Write tight, technical Reel captions..." }],
      },
      {
        id: "agt_youtube_writer",
        role: "youtube_writer",
        name: "YouTube Writer",
        monogram: "YW",
        description: "Produces high-retention titles, technical descriptions, timestamped chapters, and repo links.",
        primaryModelId: "gemini-2.5-pro",
        fallbackModelId: "nvidia-llama-3.3-70b",
        temperature: 0.3,
        successRate: 99.0,
        avgCostUsd: 0.045,
        avgDurationSec: 7.1,
        status: "running",
        currentTask: "Building timestamped chapters & architecture links",
        systemPrompt: "Generate 3 title variants under 62 characters, a structured technical description, and exact timestamp chapters starting at 00:00.",
        outputSchema: '{"type":"object","required":["title","description","chapters","tags"]}',
        tools: ["chapter_validator", "seo_keyword_lookup"],
        guardrails: ["Title <= 62 chars", "First chapter must be 00:00"],
        versions: [{ version: "v3.6 (Active)", createdAt: "2026-11-11", author: "Sunny", note: "Added automatic GitHub commit link insertion.", systemPrompt: "Generate 3 title variants..." }],
      },
      {
        id: "agt_seo_hashtag",
        role: "seo_hashtag",
        name: "SEO & Hashtag",
        monogram: "SH",
        description: "Optimizes search terms, technical taxonomy tags, and platform indexing metadata.",
        primaryModelId: "cf-llama-3.1-8b",
        fallbackModelId: "gemini-2.5-flash",
        temperature: 0.15,
        successRate: 99.6,
        avgCostUsd: 0.008,
        avgDurationSec: 2.1,
        status: "idle",
        currentTask: "Indexed 14 developer tooling keywords",
        systemPrompt: "Select high-intent technical keywords and platform-native tags without spammy broad tags.",
        outputSchema: '{"type":"object","required":["keywords","hashtags"]}',
        tools: ["search_volume_lookup"],
        guardrails: ["No generic #ai or #viral tags"],
        versions: [{ version: "v1.9 (Active)", createdAt: "2026-11-01", author: "Sunny", note: "Filtered generic tags.", systemPrompt: "Select high-intent technical keywords..." }],
      },
      {
        id: "agt_thumbnail_concept",
        role: "thumbnail_concept",
        name: "Thumbnail Concept",
        monogram: "TC",
        description: "Designs high-contrast architectural diagram callouts and frame composition specs for YouTube.",
        primaryModelId: "gemini-2.5-flash",
        fallbackModelId: "grok-3-mini",
        temperature: 0.4,
        successRate: 98.2,
        avgCostUsd: 0.014,
        avgDurationSec: 3.4,
        status: "idle",
        currentTask: "Selected frame 01:18 with 3-word metric callout",
        systemPrompt: "Specify a clean dark-mode wireframe or terminal benchmark composition with at most 4 words of overlay copy.",
        outputSchema: '{"type":"object","required":["frameTimestamp","overlayText","layoutNotes"]}',
        tools: ["extract_high_contrast_frame"],
        guardrails: ["Overlay text <= 4 words", "No shocked faces or red arrows"],
        versions: [{ version: "v2.1 (Active)", createdAt: "2026-11-05", author: "Sunny", note: "Banned clickbait arrows.", systemPrompt: "Specify a clean dark-mode wireframe..." }],
      },
      {
        id: "agt_brand_reviewer",
        role: "brand_reviewer",
        name: "Brand Reviewer",
        monogram: "BR",
        description: "Audits every variant against Brand Kit voice sliders, banned vocabulary, and factual grounding.",
        primaryModelId: "gemini-2.5-pro",
        fallbackModelId: "nvidia-llama-3.3-70b",
        temperature: 0.0,
        successRate: 99.8,
        avgCostUsd: 0.027,
        avgDurationSec: 3.9,
        status: "waiting",
        currentTask: "Awaiting writer stream completion for compliance gate",
        systemPrompt: "Score each draft from 0-100 against the Dev House Brand Kit. Reject any copy containing banned words, exclamation marks, or unsubstantiated claims.",
        outputSchema: '{"type":"object","required":["passed","score","violations","suggestedEdits"]}',
        tools: ["scan_banned_words", "verify_transcript_grounding"],
        guardrails: ["Hard fail on score < 88", "Zero tolerance for exclamation marks"],
        versions: [{ version: "v4.0 (Active)", createdAt: "2026-11-14", author: "Sunny", note: "Strict transcript citation check.", systemPrompt: "Score each draft from 0-100..." }],
      },
      {
        id: "agt_scheduler",
        role: "scheduler",
        name: "Scheduler",
        monogram: "SC",
        description: "Computes optimal publishing slots in Asia/Kolkata & global dev windows while preventing collisions.",
        primaryModelId: "cf-llama-3.1-8b",
        fallbackModelId: "gemini-2.5-flash",
        temperature: 0.1,
        successRate: 99.9,
        avgCostUsd: 0.005,
        avgDurationSec: 1.4,
        status: "idle",
        currentTask: "Assigned Tue 18:30 IST slot (94% audience overlap)",
        systemPrompt: "Select the highest-engagement conflict-free window per channel based on historical audience telemetry.",
        outputSchema: '{"type":"object","required":["slotIso","confidence","conflictCheck"]}',
        tools: ["calendar_conflict_scan", "heatmap_slot_ranker"],
        guardrails: ["Min 4h gap between same-channel posts"],
        versions: [{ version: "v1.5 (Active)", createdAt: "2026-10-29", author: "Sunny", note: "IST/US-West dual peak optimization.", systemPrompt: "Select the highest-engagement..." }],
      },
      {
        id: "agt_publisher",
        role: "publisher",
        name: "Publisher",
        monogram: "PB",
        description: "Deterministic non-LLM publisher: executes signed OAuth dispatches to LinkedIn, Instagram Graph, and YouTube Data API v3.",
        primaryModelId: "cf-llama-3.1-8b",
        fallbackModelId: "custom-local-vllm",
        temperature: 0.0,
        successRate: 98.4,
        avgCostUsd: 0.0,
        avgDurationSec: 2.8,
        status: "idle",
        currentTask: "Standing by for Human Approval Gate & Kill-Switch check",
        systemPrompt: "DETERMINISTIC_STATE_MACHINE: Verify human approval signature, schema validity, and kill-switch status before invoking idempotent platform connectors.",
        outputSchema: '{"type":"object","required":["platformPostId","publishedUrl","status"]}',
        tools: ["linkedin_rest_publish", "ig_graph_container_publish", "yt_videos_insert"],
        guardrails: ["Abort immediately if publishingPaused === true", "Require valid approval signature", "Deterministic non-LLM execution only"],
        versions: [{ version: "v3.0 (Active)", createdAt: "2026-11-02", author: "Sunny", note: "Added idempotent retry key.", systemPrompt: "DETERMINISTIC_STATE_MACHINE..." }],
      },
      {
        id: "agt_analyst",
        role: "analyst",
        name: "Analyst",
        monogram: "AN",
        description: "Synthesizes post-publish retention curves, hook drop-off, and attribution back into Strategist memory.",
        primaryModelId: "gemini-2.5-pro",
        fallbackModelId: "grok-3-mini",
        temperature: 0.2,
        successRate: 99.2,
        avgCostUsd: 0.033,
        avgDurationSec: 5.7,
        status: "idle",
        currentTask: "Updated 30d cohort retention benchmark (+14.2%)",
        systemPrompt: "Analyze 24h and 7d telemetry across channels and distill concrete structural lessons for future runs.",
        outputSchema: '{"type":"object","required":["insightTitle","metricDelta","recommendation"]}',
        tools: ["query_channel_metrics", "update_strategist_memory"],
        guardrails: ["Require N >= 5 posts before declaring pattern"],
        versions: [{ version: "v2.2 (Active)", createdAt: "2026-11-07", author: "Sunny", note: "Added watch-time curve synthesis.", systemPrompt: "Analyze 24h and 7d telemetry..." }],
      },
      {
        id: "agt_engagement",
        role: "engagement_assistant",
        name: "Engagement Assistant",
        monogram: "EA",
        description: "Monitors early technical comments on LinkedIn and YouTube, drafting grounded code-level replies (drafts only).",
        primaryModelId: "grok-3-mini",
        fallbackModelId: "gemini-2.5-flash",
        temperature: 0.3,
        successRate: 99.0,
        avgCostUsd: 0.011,
        avgDurationSec: 2.6,
        status: "idle",
        currentTask: "Drafted 3 replies on MCP WebSocket pooling thread",
        systemPrompt: "Draft helpful, deeply technical replies to developer questions referencing exact repo files and benchmarks. Never auto-publish.",
        outputSchema: '{"type":"object","required":["commentId","draftReply","confidence","draftOnly"]}',
        tools: ["fetch_channel_comments", "search_repo_context"],
        guardrails: ["Drafts only — never auto-post comment replies without review"],
        versions: [{ version: "v1.4 (Active)", createdAt: "2026-11-04", author: "Sunny", note: "Grounded in repo context.", systemPrompt: "Draft helpful, deeply technical replies..." }],
      },
    ];

    this.workflow = {
      id: "wf_video_to_3_platforms",
      name: "Video → 3 Platforms (Canonical Production DAG)",
      version: "v3.4",
      description: "Ingests 4K video stream, extracts FFmpeg keyframes + Whisper word timestamps, runs Director + 3 parallel writers, enforces Brand Reviewer gate, and dispatches to LinkedIn, Instagram, and YouTube.",
      isDefault: true,
      valid: true,
      validationNotes: [
        "Zero cycles — Kahn topological sort verified",
        "All output schemas align with downstream consumer inputs",
        "3x exponential backoff + Cloudflare AI Gateway provider fallback enabled",
      ],
      updatedAt: "2026-11-16T16:30:00+05:30",
      nodes: [
        // Lane 0: Sources
        { id: "src_antigravity", lane: 0, row: 0, layer: "infra", type: "source", label: "Antigravity Automation", sublabel: "Render & Commit Hook", status: "running", currentTask: "Streaming ag-stream-904.mp4", latencyMs: 38, tokensPerSec: 0, costUsd: 0, lastEvent: "video.chunk.push (48.2 MB)", sparkline: [12, 18, 25, 42, 39, 51, 48] },
        { id: "src_mcp_clients", lane: 0, row: 1, layer: "infra", type: "source", label: "MCP Coding Clients", sublabel: "Claude Code · Cursor · CLI", status: "running", currentTask: "tool.call: ingest_release_clip", latencyMs: 22, tokensPerSec: 0, costUsd: 0, lastEvent: "rpc.call: trigger_pipeline", sparkline: [8, 10, 14, 19, 24, 21, 29] },
        { id: "src_manual", lane: 0, row: 2, layer: "infra", type: "source", label: "Console Dropzone", sublabel: "Direct Browser Upload", status: "idle", currentTask: "Listening for MP4/MOV drop", latencyMs: 11, tokensPerSec: 0, costUsd: 0, lastEvent: "upload.complete (2h ago)", sparkline: [2, 0, 5, 1, 0, 3, 2] },
        // Lane 1: Gateway
        { id: "gw_ingest", lane: 1, row: 0, layer: "infra", type: "gateway", label: "Ingest Edge API", sublabel: "HMAC + Chunk Validator", status: "running", currentTask: "Validating SHA-256 & muxing", latencyMs: 19, tokensPerSec: 0, costUsd: 0.001, lastEvent: "stream.verified: 9042", sparkline: [30, 44, 52, 49, 60, 58, 63] },
        { id: "gw_mcp", lane: 1, row: 1, layer: "infra", type: "gateway", label: "MCP Server (SSE/Stdio)", sublabel: "22 Registered Tools", status: "running", currentTask: "Serving get_run_telemetry", latencyMs: 15, tokensPerSec: 0, costUsd: 0, lastEvent: "mcp.tool.ok (14ms)", sparkline: [15, 22, 19, 31, 28, 35, 33] },
        // Lane 2: Core Storage & Queue
        { id: "core_redis", lane: 2, row: 0, layer: "infra", type: "core", label: "Redis Streams Queue", sublabel: "BullMQ · 0 DLQ Critical", status: "running", currentTask: "Dispatching job #9042-write", latencyMs: 4, tokensPerSec: 0, costUsd: 0.001, lastEvent: "xadd: stream:agent_jobs", sparkline: [65, 70, 68, 82, 79, 88, 84] },
        { id: "core_postgres", lane: 2, row: 1, layer: "infra", type: "core", label: "Postgres State DB", sublabel: "Runs · Variants · Audit", status: "idle", currentTask: "Checkpointing step 4/8", latencyMs: 7, tokensPerSec: 0, costUsd: 0.001, lastEvent: "tx.commit: run_steps", sparkline: [20, 24, 22, 29, 27, 30, 26] },
        { id: "core_r2", lane: 2, row: 2, layer: "infra", type: "core", label: "Cloudflare R2 Storage", sublabel: "Raw MP4 + Keyframes", status: "idle", currentTask: "Stored 18 scene frames", latencyMs: 28, tokensPerSec: 0, costUsd: 0.002, lastEvent: "putObject: frames/9042/", sparkline: [14, 18, 32, 28, 19, 22, 25] },
        // Lane 3: Media Pipeline
        { id: "med_ffmpeg", lane: 3, row: 0, layer: "infra", type: "media", label: "FFmpeg Scene Pipeline", sublabel: "Keyframe & Aspect Crop", status: "idle", currentTask: "Extracted 9:16 & 16:9 masters", latencyMs: 140, tokensPerSec: 0, costUsd: 0.004, lastEvent: "scene.cut: 18 keyframes", sparkline: [40, 62, 85, 30, 12, 10, 15] },
        { id: "med_whisper", lane: 3, row: 1, layer: "infra", type: "media", label: "Transcription Engine", sublabel: "Word-level Timestamps", status: "idle", currentTask: "Aligned 1,420 words (99.4%)", latencyMs: 210, tokensPerSec: 180, costUsd: 0.012, lastEvent: "transcript.ready: 03:48", sparkline: [25, 55, 78, 45, 18, 12, 14] },
        // Lane 4: Agent Orchestration Crew
        { id: "agt_director", lane: 4, row: 0, layer: "agents", type: "agent", label: "Director Agent", sublabel: "Crew Orchestrator", status: "running", currentTask: "Fan-out to 3 channel writers", latencyMs: 390, tokensPerSec: 94, costUsd: 0.042, lastEvent: "handoff.fanout -> writers", sparkline: [32, 48, 75, 82, 90, 86, 94] },
        { id: "agt_video_analyst", lane: 4, row: 1, layer: "agents", type: "agent", label: "Video Analyst + Strategist", sublabel: "Visual & Angle Extraction", status: "idle", currentTask: "Identified zero-copy IPC hook", latencyMs: 420, tokensPerSec: 78, costUsd: 0.068, lastEvent: "brief.locked: 94% match", sparkline: [50, 72, 88, 64, 30, 22, 20] },
        { id: "agt_linkedin_writer", lane: 4, row: 2, layer: "agents", type: "agent", label: "LinkedIn Writer", sublabel: "Architecture Breakdown", status: "running", currentTask: "Streaming via NVIDIA fallback", latencyMs: 245, tokensPerSec: 118, costUsd: 0.038, lastEvent: "token.stream: 312/450 tok", sparkline: [15, 28, 64, 92, 110, 115, 118] },
        { id: "agt_instagram_writer", lane: 4, row: 3, layer: "agents", type: "agent", label: "Instagram Reel Writer", sublabel: "Hook + Caption Overlay", status: "running", currentTask: "Drafting 9:16 frame callouts", latencyMs: 290, tokensPerSec: 86, costUsd: 0.019, lastEvent: "token.stream: 180/220 tok", sparkline: [10, 35, 70, 80, 84, 88, 86] },
        { id: "agt_youtube_writer", lane: 4, row: 4, layer: "agents", type: "agent", label: "YouTube + SEO + Thumb", sublabel: "Chapters, Title & Wireframe", status: "running", currentTask: "Generating 00:00-03:48 chapters", latencyMs: 380, tokensPerSec: 92, costUsd: 0.059, lastEvent: "chapters.verified (6 stops)", sparkline: [18, 42, 68, 77, 89, 91, 92] },
        { id: "agt_brand_reviewer", lane: 4, row: 5, layer: "agents", type: "agent", label: "Brand Reviewer + Scheduler", sublabel: "Guardrail & Slot Gate", status: "waiting", currentTask: "Checking banned word list", latencyMs: 195, tokensPerSec: 64, costUsd: 0.032, lastEvent: "compliance.score: 96/100", sparkline: [12, 19, 25, 44, 62, 58, 64] },
        // Lane 5: BYOK Providers
        { id: "prv_cf_gw", lane: 5, row: 0, layer: "providers", type: "provider", label: "Cloudflare AI Gateway", sublabel: "Router · Cache · Fallback", status: "running", currentTask: "Rerouting 429 -> NVIDIA NIM", latencyMs: 42, tokensPerSec: 290, costUsd: 0.002, lastEvent: "fallback.triggered: gemini->nim", sparkline: [80, 95, 110, 145, 160, 152, 170] },
        { id: "prv_gemini", lane: 5, row: 1, layer: "providers", type: "provider", label: "Google Gemini 2.5 Pro", sublabel: "Primary Vision & Synthesis", status: "degraded", currentTask: "RPM burst limit (auto-rerouted)", latencyMs: 620, tokensPerSec: 54, costUsd: 0.095, lastEvent: "http.429: quota_cooldown_4s", sparkline: [90, 88, 92, 40, 25, 30, 54] },
        { id: "prv_nvidia", lane: 5, row: 2, layer: "providers", type: "provider", label: "NVIDIA NIM (Llama 3.3 70B)", sublabel: "Active Fallback Route", status: "running", currentTask: "Serving LinkedIn Writer stream", latencyMs: 235, tokensPerSec: 124, costUsd: 0.034, lastEvent: "stream.chunk: 124 tok/s", sparkline: [20, 25, 45, 98, 118, 122, 124] },
        { id: "prv_grok", lane: 5, row: 3, layer: "providers", type: "provider", label: "xAI Grok-3 + Workers AI", sublabel: "Fast Hooks & Tagging", status: "running", currentTask: "Serving IG Writer & SEO tags", latencyMs: 210, tokensPerSec: 112, costUsd: 0.027, lastEvent: "completion.ok (210ms)", sparkline: [45, 52, 68, 74, 88, 95, 112] },
        // Lane 6: Human Approval Gate
        { id: "gate_approval", lane: 6, row: 1, layer: "channels", type: "approval", label: "Human Approval Gate", sublabel: "Mode: Approve-before-publish", status: "waiting", currentTask: "4 variants queued for Sunny", latencyMs: 0, tokensPerSec: 0, costUsd: 0, lastEvent: "inbox.awaiting: run_9042", sparkline: [3, 4, 4, 5, 4, 4, 4] },
        // Lane 7: Social Publishers
        { id: "pub_linkedin", lane: 7, row: 0, layer: "channels", type: "publisher", label: "LinkedIn Publisher", sublabel: "@devhouse-systems", status: "idle", currentTask: "Next slot: Tue 18:30 IST", latencyMs: 210, tokensPerSec: 0, costUsd: 0, lastEvent: "post.published (4h ago)", sparkline: [10, 12, 15, 14, 18, 16, 20] },
        { id: "pub_instagram", lane: 7, row: 1, layer: "channels", type: "publisher", label: "Instagram Reels Graph", sublabel: "@devhouse.sh", status: "idle", currentTask: "Container staged (9:16 MP4)", latencyMs: 285, tokensPerSec: 0, costUsd: 0, lastEvent: "media.staged: ig_9041", sparkline: [8, 14, 12, 19, 17, 21, 18] },
        { id: "pub_youtube", lane: 7, row: 2, layer: "channels", type: "publisher", label: "YouTube Data API v3", sublabel: "@DevHouseEngineering", status: "idle", currentTask: "Quota 7,420 / 10,000 units", latencyMs: 340, tokensPerSec: 0, costUsd: 0, lastEvent: "video.scheduled: Wed 19:30", sparkline: [6, 9, 11, 10, 14, 13, 15] },
      ],
      edges: [
        { id: "e_ag_ingest", source: "src_antigravity", target: "gw_ingest", status: "active", throughput: 3 },
        { id: "e_mcp_gw", source: "src_mcp_clients", target: "gw_mcp", status: "active", throughput: 2 },
        { id: "e_man_ingest", source: "src_manual", target: "gw_ingest", status: "idle", throughput: 1 },
        { id: "e_ingest_redis", source: "gw_ingest", target: "core_redis", status: "active", throughput: 3 },
        { id: "e_ingest_r2", source: "gw_ingest", target: "core_r2", status: "active", throughput: 2 },
        { id: "e_mcp_redis", source: "gw_mcp", target: "core_redis", status: "active", throughput: 2 },
        { id: "e_mcp_pg", source: "gw_mcp", target: "core_postgres", status: "idle", throughput: 1 },
        { id: "e_redis_ffmpeg", source: "core_redis", target: "med_ffmpeg", status: "idle", throughput: 2 },
        { id: "e_r2_whisper", source: "core_r2", target: "med_whisper", status: "idle", throughput: 2 },
        { id: "e_ffmpeg_dir", source: "med_ffmpeg", target: "agt_director", status: "active", throughput: 2 },
        { id: "e_whisper_dir", source: "med_whisper", target: "agt_director", status: "active", throughput: 3 },
        { id: "e_dir_va", source: "agt_director", target: "agt_video_analyst", status: "idle", throughput: 2 },
        { id: "e_dir_lw", source: "agt_director", target: "agt_linkedin_writer", status: "active", throughput: 3 },
        { id: "e_dir_iw", source: "agt_director", target: "agt_instagram_writer", status: "active", throughput: 2 },
        { id: "e_dir_yw", source: "agt_director", target: "agt_youtube_writer", status: "active", throughput: 3 },
        { id: "e_lw_gw", source: "agt_linkedin_writer", target: "prv_cf_gw", status: "active", throughput: 3 },
        { id: "e_iw_gw", source: "agt_instagram_writer", target: "prv_cf_gw", status: "active", throughput: 2 },
        { id: "e_yw_gw", source: "agt_youtube_writer", target: "prv_cf_gw", status: "active", throughput: 3 },
        { id: "e_gw_gemini", source: "prv_cf_gw", target: "prv_gemini", status: "failed", throughput: 1, label: "429 Cooldown" },
        { id: "e_gw_nvidia", source: "prv_cf_gw", target: "prv_nvidia", status: "fallback", throughput: 3, label: "Auto Fallback" },
        { id: "e_gw_grok", source: "prv_cf_gw", target: "prv_grok", status: "active", throughput: 2 },
        { id: "e_lw_br", source: "agt_linkedin_writer", target: "agt_brand_reviewer", status: "active", throughput: 2 },
        { id: "e_iw_br", source: "agt_instagram_writer", target: "agt_brand_reviewer", status: "active", throughput: 2 },
        { id: "e_yw_br", source: "agt_youtube_writer", target: "agt_brand_reviewer", status: "active", throughput: 2 },
        { id: "e_br_gate", source: "agt_brand_reviewer", target: "gate_approval", status: "active", throughput: 3 },
        { id: "e_gate_li", source: "gate_approval", target: "pub_linkedin", status: "idle", throughput: 2 },
        { id: "e_gate_ig", source: "gate_approval", target: "pub_instagram", status: "idle", throughput: 2 },
        { id: "e_gate_yt", source: "gate_approval", target: "pub_youtube", status: "idle", throughput: 2 },
      ],
    };

    // All 30 Content Items matching the frontend console seed 1:1
    const seedTitles: [string, string, ContentItem["source"], number, string, ContentItem["status"], PlatformId[], string, number][] = [
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
      ["cnt_13", "MCP Server Security: Scoped Bearer Tokens and Tool Call Audit Logs", "MCP (Claude Code)", 219, "03:39", "published", ["linkedin", "youtube"], "run_9031", 0.155],
      ["cnt_14", "Local vLLM Speculative Decoding with Qwen 2.5 Coder 32B", "Manual Drop", 280, "04:40", "scheduled", ["linkedin", "youtube"], "run_9037", 0.189],
      ["cnt_15", "Hybrid RAG Chunking: AST-Aware Code Splitters vs Fixed Token Windows", "Antigravity", 230, "03:50", "published", ["linkedin", "instagram", "youtube"], "run_9031", 0.162],
      ["cnt_16", "Blender 5.2 Python MCP Bridge: Procedural Scene Generation from CLI", "MCP (Claude Code)", 195, "03:15", "published", ["instagram", "youtube"], "run_9031", 0.138],
      ["cnt_17", "Eliminating React Flow Re-Layout Jitter in Live Telemetry Topologies", "MCP (Cursor)", 168, "02:48", "scheduled", ["linkedin", "instagram"], "run_9033", 0.129],
      ["cnt_18", "Redis Streams Consumer Groups: Handling Poison Pills & Dead-Letter Queues", "Antigravity", 242, "04:02", "published", ["linkedin", "youtube"], "run_9032", 0.177],
      ["cnt_19", "Zero-Allocation JSON Streaming Parsers in C++20 for Edge Gateways", "Antigravity", 275, "04:35", "analysing", ["linkedin", "instagram", "youtube"], "run_9042_live", 0.084],
      ["cnt_20", "Tailwind v4 CSS-First Token Architecture for High-Contrast Dark UIs", "MCP (Cursor)", 154, "02:34", "published", ["linkedin", "instagram"], "run_9033", 0.112],
      ["cnt_21", "How We Cut Cold Starts on Cloudflare Workers AI with Warm Model Routing", "Antigravity", 208, "03:28", "published", ["linkedin", "youtube"], "run_9032", 0.144],
      ["cnt_22", "Pinecone Hybrid Sparse-Dense Retrieval: Tuning Alpha for Policy Docs", "MCP (Claude Code)", 224, "03:44", "published", ["linkedin", "youtube"], "run_9031", 0.168],
      ["cnt_23", "Android On-Device TensorFlow Lite Context Classifier Under 12MB RAM", "Antigravity", 248, "04:08", "published", ["linkedin", "instagram", "youtube"], "run_9031", 0.181],
      ["cnt_24", "Implementing j/k Vim-Style Queue Navigation in Next.js App Router", "MCP (Cursor)", 142, "02:22", "scheduled", ["linkedin", "instagram"], "run_9033", 0.098],
      ["cnt_25", "Why Our Brand Reviewer Agent Rejects Exclamation Marks & Hype Adjectives", "Antigravity", 165, "02:45", "published", ["linkedin", "instagram"], "run_9031", 0.119],
      ["cnt_26", "Fine-Grained RBAC and Webhook HMAC Signatures for Multi-Tenant Consoles", "MCP (Claude Code)", 234, "03:54", "published", ["linkedin", "youtube"], "run_9031", 0.159],
      ["cnt_27", "Audio Beat-Synced Frame Transitions Using Web Audio FFT & FFmpeg Filters", "Manual Drop", 188, "03:08", "ingested", ["instagram", "youtube"], "run_9042_live", 0.021],
      ["cnt_28", "Benchmarking NVIDIA NIM Llama 3.3 70B vs Gemini 2.5 Pro on Structured JSON", "Antigravity", 260, "04:20", "published", ["linkedin", "instagram", "youtube"], "run_9031", 0.205],
      ["cnt_29", "Preventing Token Leakage in Multi-Agent Prompt Version Rollbacks", "MCP (Claude Code)", 192, "03:12", "published", ["linkedin", "youtube"], "run_9031", 0.147],
      ["cnt_30", "End-to-End Type Safety Between Fastify SSE Streams and TanStack Query", "Antigravity", 216, "03:36", "ingested", ["linkedin", "instagram", "youtube"], "run_9042_live", 0.018],
    ];

    this.contentItems = seedTitles.map(([id, title, source, durationSec, durationFormatted, status, platforms, runId, costUsd], idx) => {
      const hash = crypto.createHash("sha256").update(`${id}:${title}`).digest("hex");
      this.contentHashes.set(hash, id);
      return {
        id,
        title,
        source,
        durationSec,
        durationFormatted,
        status,
        platforms,
        createdAt: idx === 0 ? "Just now" : idx < 4 ? `${idx * 42}m ago` : `${Math.ceil(idx / 3)}d ago`,
        scheduledFor: status === "scheduled" ? `Nov ${17 + (idx % 5)}, 18:30 IST` : undefined,
        runId,
        costUsd,
        transcript: [
          { timeSec: 0, timestamp: "00:00", speaker: "Sunny", text: `In this walkthrough we inspect ${title} inside the production environment.` },
          { timeSec: 42, timestamp: "00:42", speaker: "Sunny", text: "Notice the flamegraph spike here—31% of wall-clock time is spent serializing payloads across boundaries." },
          { timeSec: 102, timestamp: "01:42", speaker: "Sunny", text: "By switching to a zero-copy slice layout and deterministic schema validation, p99 drops from 14.2ms down to 0.38ms." },
          { timeSec: 175, timestamp: "02:55", speaker: "Sunny", text: "Every failure mode is logged directly to the SSE event bus so the console and MCP clients stay synchronized." },
        ],
        variants: this.buildVariantsForContent(id, title, status),
        metadata: {
          resolution: "3840x2160 (4K)",
          fps: 60,
          codec: "H.265 / HEVC + PCM",
          fileSizeMb: +(34.2 + ((idx * 3.7) % 45)).toFixed(1),
          ingestCommit: `8f92c${(10 + idx).toString(16)}`,
        },
      };
    });

    this.runs = [
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
            streamedOutput: "Extracted flamegraph comparison at 01:42 showing p99 serialization drop from 14.2ms to 0.38ms using SharedArrayBuffer.",
            inputJson: { videoUri: "r2://devhouse-prod/ag-stream-904.mp4", durationSec: 228, fps: 60 },
            outputJson: { primaryMetric: "14.2ms -> 0.38ms p99", keyframes: ["00:14", "01:18", "01:42", "02:55"], codeLang: "Rust + TypeScript" },
            criticalPath: true,
            startOffsetSec: 0,
          },
          {
            id: "stp_2",
            agentId: "agt_director",
            agentName: "Director",
            agentMonogram: "DR",
            modelUsed: "gemini-2.5-pro",
            providerId: "gemini",
            status: "completed",
            startedAt: "16:34:20",
            durationSec: 4.1,
            tokensIn: 2100,
            tokensOut: 510,
            costUsd: 0.038,
            toolCalls: ["query_brand_kit()", "dispatch_subagents(3)"],
            streamedOutput: "Thesis locked: Why JSON.stringify across worker boundaries quietly taxes high-throughput LLM gateways, and how zero-copy N-API buffers eliminate it.",
            inputJson: { analystHook: "14.2ms -> 0.38ms p99", brandTone: "calm_precise_adult" },
            outputJson: { fanOut: ["agt_linkedin_writer", "agt_instagram_writer", "agt_youtube_writer"], guardrailStrictness: "high" },
            criticalPath: true,
            startOffsetSec: 8.2,
          },
          {
            id: "stp_3",
            agentId: "agt_linkedin_writer",
            agentName: "LinkedIn Writer",
            agentMonogram: "LW",
            modelUsed: "nvidia-llama-3.3-70b (Fallback)",
            providerId: "nvidia_nim",
            status: "running",
            startedAt: "16:34:25",
            durationSec: 12.4,
            tokensIn: 3100,
            tokensOut: 640,
            costUsd: 0.034,
            toolCalls: ["route_fallback_provider(gemini->nvidia_nim)", "brand_voice_check()"],
            streamedOutput: "When our MCP gateway crossed 4,000 concurrent tool calls, 31% of CPU time wasn't spent on socket I/O—it was spent serializing JSON payloads across Node.js worker boundaries.\n\nMoving the hot ring-buffer to Rust via N-API with zero-copy SharedArrayBuffer slices cut p99 bridge latency from 14.2ms to 0.38ms.",
            inputJson: { targetAudience: "Staff & Principal Systems Engineers", maxChars: 1600 },
            outputJson: { status: "streaming_tokens", compliancePrecheck: 97 },
            criticalPath: true,
            startOffsetSec: 12.3,
          },
          {
            id: "stp_4",
            agentId: "agt_instagram_writer",
            agentName: "Instagram Writer",
            agentMonogram: "IW",
            modelUsed: "grok-3-mini",
            providerId: "xai_grok",
            status: "running",
            startedAt: "16:34:25",
            durationSec: 9.0,
            tokensIn: 1900,
            tokensOut: 380,
            costUsd: 0.019,
            toolCalls: ["reel_safe_zone_check(9:16)"],
            streamedOutput: 'Frame overlay [00:00-00:03]: "14.2ms -> 0.38ms: Killing JSON serialization overhead in Node + Rust."',
            inputJson: { aspect: "9:16", durationSec: 58 },
            outputJson: { overlayHook: "14.2ms -> 0.38ms p99", captionReady: true },
            criticalPath: false,
            startOffsetSec: 12.3,
          },
          {
            id: "stp_5",
            agentId: "agt_youtube_writer",
            agentName: "YouTube Writer",
            agentMonogram: "YW",
            modelUsed: "gemini-2.5-pro",
            providerId: "gemini",
            status: "running",
            startedAt: "16:34:25",
            durationSec: 14.1,
            tokensIn: 3800,
            tokensOut: 890,
            costUsd: 0.039,
            toolCalls: ["chapter_validator(6)", "seo_keyword_lookup()"],
            streamedOutput: "Title: Zero-Copy Rust + Node.js N-API: Cutting IPC Latency by 97%\nChapters:\n00:00 The hidden tax of worker_threads JSON cloning\n00:48 Inspecting the flamegraph bottleneck\n01:42 SharedArrayBuffer + Rust N-API slice layout\n02:55 Live benchmark: 14.2ms down to 0.38ms",
            inputJson: { videoLength: "03:48", repoCommit: "8f92c1a" },
            outputJson: { titleCandidates: 3, chaptersCount: 4 },
            criticalPath: true,
            startOffsetSec: 12.3,
          },
          {
            id: "stp_6",
            agentId: "agt_brand_reviewer",
            agentName: "Brand Reviewer",
            agentMonogram: "BR",
            modelUsed: "gemini-2.5-pro",
            providerId: "gemini",
            status: "waiting",
            startedAt: "16:34:39",
            durationSec: 3.2,
            tokensIn: 1800,
            tokensOut: 220,
            costUsd: 0.0,
            toolCalls: ["scan_banned_words()", "verify_transcript_grounding()"],
            streamedOutput: "Waiting on final token stream from LinkedIn and YouTube writers to issue compliance seal.",
            inputJson: { minScore: 88 },
            outputJson: { pending: true },
            criticalPath: true,
            startOffsetSec: 26.4,
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
        steps: [
          { id: "stp_41_1", agentId: "agt_director", agentName: "Director", agentMonogram: "DR", modelUsed: "gemini-2.5-pro", providerId: "gemini", status: "completed", startedAt: "15:10:04", durationSec: 5.0, tokensIn: 2400, tokensOut: 490, costUsd: 0.039, toolCalls: ["inspect_transcript", "dispatch_subagents"], streamedOutput: "Dispatched Kahn topological sort & bin-packing walkthrough to all 3 channel writers.", inputJson: { clip: "dag-scheduler.mp4" }, outputJson: { status: "ok" }, criticalPath: true, startOffsetSec: 0 },
          { id: "stp_41_2", agentId: "agt_brand_reviewer", agentName: "Brand Reviewer", agentMonogram: "BR", modelUsed: "gemini-2.5-pro", providerId: "gemini", status: "completed", startedAt: "15:10:29", durationSec: 4.2, tokensIn: 3100, tokensOut: 410, costUsd: 0.031, toolCalls: ["scan_banned_words"], streamedOutput: "Brand compliance score 96/100. Zero banned words detected. Routed to Human Approval Gate.", inputJson: { variants: 3 }, outputJson: { score: 96, passed: true }, criticalPath: true, startOffsetSec: 25 },
        ],
      },
      {
        id: "run_9040",
        contentId: "cnt_03",
        contentTitle: "Cloudflare AI Gateway Fallback Chains: Surviving Provider 429s",
        source: "Antigravity",
        status: "awaiting_approval",
        startedAt: "13:45:19 IST",
        durationSec: 34,
        totalTokens: 14900,
        totalCostUsd: 0.158,
        steps: [],
      },
      {
        id: "run_9039",
        contentId: "cnt_04",
        contentTitle: "Why We Replaced Vector HNSW Re-Indexing with Streaming WAL Segments",
        source: "MCP (Cursor)",
        status: "completed",
        startedAt: "11:20:00 IST",
        durationSec: 41,
        totalTokens: 19300,
        totalCostUsd: 0.21,
        steps: [],
      },
      {
        id: "run_9038",
        contentId: "cnt_05",
        contentTitle: "Sub-50ms WebSocket Backpressure Control in Node.js 22",
        source: "Antigravity",
        status: "completed",
        startedAt: "Yesterday 21:15 IST",
        durationSec: 36,
        totalTokens: 15400,
        totalCostUsd: 0.164,
        steps: [],
      },
      {
        id: "run_9037",
        contentId: "cnt_06",
        contentTitle: "Local vLLM Speculative Decoding with Qwen 2.5 Coder 32B",
        source: "Manual Drop",
        status: "completed",
        startedAt: "Yesterday 18:02 IST",
        durationSec: 44,
        totalTokens: 21100,
        totalCostUsd: 0.189,
        steps: [],
      },
      {
        id: "run_9036",
        contentId: "cnt_07",
        contentTitle: "PostgreSQL 17 JSONB Indexing Pitfalls Under High Write Concurrency",
        source: "Antigravity",
        status: "failed",
        startedAt: "Yesterday 14:12 IST",
        durationSec: 19,
        totalTokens: 6400,
        totalCostUsd: 0.052,
        steps: [],
      },
      {
        id: "run_9035",
        contentId: "cnt_08",
        contentTitle: "Designing Keyboard-First Pro Developer Consoles Without Visual Clutter",
        source: "MCP (Claude Code)",
        status: "completed",
        startedAt: "2d ago",
        durationSec: 39,
        totalTokens: 16800,
        totalCostUsd: 0.175,
        steps: [],
      },
      {
        id: "run_9034",
        contentId: "cnt_09",
        contentTitle: "Tauri v2 vs Electron Memory Footprint on Windows 11 Workstations",
        source: "Antigravity",
        status: "completed",
        startedAt: "2d ago",
        durationSec: 37,
        totalTokens: 15100,
        totalCostUsd: 0.149,
        steps: [],
      },
      {
        id: "run_9033",
        contentId: "cnt_10",
        contentTitle: "Structured Outputs with Zod & Gemini 2.5 Pro Response Schemas",
        source: "MCP (Cursor)",
        status: "completed",
        startedAt: "3d ago",
        durationSec: 33,
        totalTokens: 13900,
        totalCostUsd: 0.141,
        steps: [],
      },
      {
        id: "run_9032",
        contentId: "cnt_11",
        contentTitle: "Automating FFmpeg Keyframe Extraction & Whisper Word Timestamps",
        source: "Antigravity",
        status: "completed",
        startedAt: "3d ago",
        durationSec: 46,
        totalTokens: 20400,
        totalCostUsd: 0.218,
        steps: [],
      },
      {
        id: "run_9031",
        contentId: "cnt_12",
        contentTitle: "MCP Server Security: Scoped Bearer Tokens and Tool Call Audit Logs",
        source: "MCP (Claude Code)",
        status: "completed",
        startedAt: "4d ago",
        durationSec: 35,
        totalTokens: 14700,
        totalCostUsd: 0.155,
        steps: [],
      },
    ];

    this.approvals = [
      {
        id: "apr_01",
        contentId: "cnt_02",
        contentTitle: "Building Deterministic DAG Schedulers with Kahn Topological Sort",
        runId: "run_9041",
        submittedAt: "18m ago",
        authorAgent: "LinkedIn + IG + YT Writers (Reviewed by BR v4.0)",
        brandComplianceScore: 96,
        status: "pending",
        variants: this.contentItems[1]!.variants,
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
        variants: this.contentItems[2]!.variants,
      },
      {
        id: "apr_03",
        contentId: "cnt_06",
        contentTitle: "Sub-50ms OCR & Barcode Compliance Validation Over WebSockets",
        runId: "run_9038",
        submittedAt: "3h ago",
        authorAgent: "Director + 3 Writers",
        brandComplianceScore: 98,
        status: "pending",
        variants: this.contentItems[5]!.variants,
      },
      {
        id: "apr_04",
        contentId: "cnt_09",
        contentTitle: "Payment Gateway Idempotency Keys: Preventing Double Debits Under Retry Storms",
        runId: "run_9035",
        submittedAt: "5h ago",
        authorAgent: "Director + 3 Writers",
        brandComplianceScore: 95,
        status: "pending",
        variants: this.contentItems[8]!.variants,
      },
    ];

    this.channels = [
      {
        id: "linkedin",
        name: "LinkedIn Company & Author",
        handle: "@devhouse-systems · Sunny Gupta",
        connected: true,
        tokenHealth: "healthy",
        tokenExpiresInDays: 52,
        autonomyMode: "approve_before_publish",
        defaultHashtags: ["#SystemsEngineering", "#LLMOrchestration", "#RustLang", "#DeveloperTools"],
        defaultCta: "Full benchmark harness and MCP config in the repository link below.",
        signature: "— Built inside Dev House",
        postingWindows: ["Tue 09:30 IST", "Wed 18:30 IST", "Thu 10:00 IST"],
        language: "en-IN / Technical",
        latencyMs: 210,
      },
      {
        id: "instagram",
        name: "Instagram Reels (Builder Feed)",
        handle: "@devhouse.sh",
        connected: true,
        tokenHealth: "healthy",
        tokenExpiresInDays: 44,
        autonomyMode: "approve_before_publish",
        defaultHashtags: ["#devtooling", "#buildinpublic", "#softwarearchitecture", "#terminal"],
        defaultCta: "Architecture diagram + CLI snippet pinned in bio.",
        signature: "devhouse.sh",
        postingWindows: ["Mon 20:00 IST", "Thu 21:00 IST", "Sat 17:00 IST"],
        language: "en-US / Concise",
        latencyMs: 285,
      },
      {
        id: "youtube",
        name: "YouTube Engineering Channel",
        handle: "youtube.com/@DevHouseEngineering",
        connected: true,
        tokenHealth: "expiring_soon",
        tokenExpiresInDays: 6,
        autonomyMode: "manual",
        quotaUsed: 7420,
        quotaLimit: 10000,
        defaultHashtags: ["#AIInfrastructure", "#MCPServer", "#TypeScript"],
        defaultCta: "Star the repository and inspect the live trace in the description.",
        signature: "Dev House Engineering · Jaipur",
        postingWindows: ["Wed 19:30 IST", "Sun 16:00 IST"],
        language: "en-US / Deep Dive",
        latencyMs: 340,
      },
    ];

    this.channels.forEach((ch) => {
      this.encryptedChannelTokens.set(
        ch.id,
        this.vault.encrypt(`oauth_refresh_${ch.id}_${crypto.randomBytes(12).toString("hex")}`, `channel:${ch.id}`)
      );
    });

    this.posts = [
      { id: "pst_1", contentId: "cnt_04", title: "Streaming WAL Segments vs HNSW Re-Indexing", platform: "linkedin", status: "published", scheduledAt: "2026-11-14 09:30 IST", dayOfMonth: 14, hour: 9, impressions: 18420, engagementRate: 6.8, clicks: 940, bestTimeMatch: true },
      { id: "pst_2", contentId: "cnt_04", title: "Streaming WAL Segments (Reel)", platform: "instagram", status: "published", scheduledAt: "2026-11-14 20:00 IST", dayOfMonth: 14, hour: 20, impressions: 11200, engagementRate: 8.1, clicks: 410, bestTimeMatch: true },
      { id: "pst_3", contentId: "cnt_05", title: "Sub-50ms WebSocket Backpressure in Node 22", platform: "youtube", status: "published", scheduledAt: "2026-11-15 19:30 IST", dayOfMonth: 15, hour: 19, impressions: 24900, engagementRate: 9.4, clicks: 1820, bestTimeMatch: true },
      { id: "pst_4", contentId: "cnt_02", title: "Deterministic DAG Schedulers with Kahn Sort", platform: "linkedin", status: "scheduled", scheduledAt: "2026-11-17 09:30 IST", dayOfMonth: 17, hour: 9, bestTimeMatch: true },
      { id: "pst_5", contentId: "cnt_02", title: "Kahn Topological Sort in 0.4ms (Reel)", platform: "instagram", status: "scheduled", scheduledAt: "2026-11-17 20:00 IST", dayOfMonth: 17, hour: 20, bestTimeMatch: true },
      { id: "pst_6", contentId: "cnt_03", title: "Surviving Provider 429s with AI Gateway", platform: "linkedin", status: "conflict", scheduledAt: "2026-11-18 18:30 IST", dayOfMonth: 18, hour: 18, bestTimeMatch: true, conflictWarning: "Within 90m of another LinkedIn technical post" },
      { id: "pst_7", contentId: "cnt_03", title: "Zero-Downtime LLM Routing (Deep Dive)", platform: "youtube", status: "scheduled", scheduledAt: "2026-11-18 19:30 IST", dayOfMonth: 18, hour: 19, bestTimeMatch: true },
      { id: "pst_8", contentId: "cnt_06", title: "47ms Binary WebSocket OCR Pipeline", platform: "linkedin", status: "scheduled", scheduledAt: "2026-11-19 10:00 IST", dayOfMonth: 19, hour: 10, bestTimeMatch: true },
      { id: "pst_9", contentId: "cnt_06", title: "47ms Camera-to-Verdict Reel", platform: "instagram", status: "scheduled", scheduledAt: "2026-11-20 21:00 IST", dayOfMonth: 20, hour: 21, bestTimeMatch: true },
      { id: "pst_10", contentId: "cnt_09", title: "Payment Gateway Idempotency & Advisory Locks", platform: "youtube", status: "scheduled", scheduledAt: "2026-11-22 16:00 IST", dayOfMonth: 22, hour: 16, bestTimeMatch: true },
    ];

    // Seed pre-authorized MCP tokens (including deterministic test token `dh_live_devhouse_master_token`)
    const masterSecret = "dh_live_devhouse_master_token";
    this.apiTokens = [
      {
        id: "tok_01",
        name: "Antigravity Production Pipeline",
        prefix: "dh_live_devh••••••oken",
        tokenHash: AuthService.hashBearerToken(masterSecret),
        scopes: ["read", "write", "ingest", "publish", "admin"],
        createdAt: "2026-10-12",
        expiresAt: "2027-01-12",
        lastUsedAt: "12s ago",
        clientAgent: "Antigravity CLI v2.4",
      },
      {
        id: "tok_02",
        name: "Claude Code Local Workstation",
        prefix: "dh_live_71c3••••••8b90",
        tokenHash: AuthService.hashBearerToken("dh_live_71c3_claude_code_workstation_8b90"),
        scopes: ["read", "write", "ingest"],
        createdAt: "2026-10-28",
        expiresAt: "2027-04-28",
        lastUsedAt: "2m ago",
        clientAgent: "Claude Code MCP",
      },
      {
        id: "tok_03",
        name: "Cursor IDE Inspector",
        prefix: "dh_live_34e1••••••1d04",
        tokenHash: AuthService.hashBearerToken("dh_live_34e1_cursor_ide_readonly_1d04"),
        scopes: ["read"],
        createdAt: "2026-11-04",
        expiresAt: "2027-02-04",
        lastUsedAt: "19m ago",
        clientAgent: "Cursor 0.44 MCP",
      },
      {
        id: "tok_04",
        name: "CI Release Hook (GitHub Actions)",
        prefix: "dh_live_55f0••••••9a77",
        tokenHash: AuthService.hashBearerToken("dh_live_55f0_github_actions_ingest_9a77"),
        scopes: ["ingest", "read"],
        createdAt: "2026-11-09",
        expiresAt: "2027-05-09",
        lastUsedAt: "4h ago",
        clientAgent: "gh-action-runner",
      },
    ];

    this.usageHistory = [
      { date: "2026-11-10", geminiUsd: 4.8, nvidiaUsd: 2.1, grokUsd: 1.7, cloudflareUsd: 0.72, tokensTotal: 1180000 },
      { date: "2026-11-11", geminiUsd: 5.1, nvidiaUsd: 2.3, grokUsd: 1.85, cloudflareUsd: 0.78, tokensTotal: 1240000 },
      { date: "2026-11-12", geminiUsd: 5.4, nvidiaUsd: 2.5, grokUsd: 1.9, cloudflareUsd: 0.81, tokensTotal: 1310000 },
      { date: "2026-11-13", geminiUsd: 5.65, nvidiaUsd: 2.65, grokUsd: 2.0, cloudflareUsd: 0.85, tokensTotal: 1365000 },
      { date: "2026-11-14", geminiUsd: 5.9, nvidiaUsd: 2.8, grokUsd: 2.1, cloudflareUsd: 0.9, tokensTotal: 1420000 },
      { date: "2026-11-15", geminiUsd: 6.2, nvidiaUsd: 3.1, grokUsd: 2.4, cloudflareUsd: 1.05, tokensTotal: 1580000 },
      { date: "2026-11-16", geminiUsd: 6.84, nvidiaUsd: 3.42, grokUsd: 2.95, cloudflareUsd: 1.11, tokensTotal: 1740000 },
    ];

    this.analytics = {
      totalImpressions: 184920,
      avgEngagementRate: 7.84,
      publishedCount30d: 28,
      approvalTurnaroundMin: 4.2,
      platformBreakdown: [
        { platform: "linkedin", impressions: 82400, engagementRate: 6.8, watchTimeHrs: 410, topHook: "Why JSON.stringify across worker boundaries quietly taxes LLM gateways" },
        { platform: "instagram", impressions: 41200, engagementRate: 8.1, watchTimeHrs: 295, topHook: "14.2ms -> 0.38ms: Zero-copy Rust + Node IPC" },
        { platform: "youtube", impressions: 61320, engagementRate: 9.4, watchTimeHrs: 1840, topHook: "Deterministic DAG Scheduling: Kahn Topological Sort + LLMs" },
      ],
      bestTimeHeatmap: Array.from({ length: 7 }, (_, d) =>
        Array.from({ length: 24 }, (__, h) => (d * 17 + h * 29) % 100)
      ),
      analystInsights: [
        {
          id: "ins_01",
          timestamp: "2h ago",
          title: "Flamegraph & terminal diff in first 4 seconds outperforms talking-head intros",
          detail: "Across the last 9 YouTube and Instagram Reel uploads, videos opening directly on a before/after latency metric retained 74% of viewers at 00:30 vs 46% for conceptual introductions.",
          metricDelta: "+28.4% Watch Retention",
        },
        {
          id: "ins_02",
          timestamp: "Yesterday",
          title: "3-item numbered architectural tradeoffs beat bulleted feature lists",
          detail: "Posts stating what failed first (e.g. JSON serialization CPU tax) before presenting the Rust N-API fix generated 2.3x more comments from Principal/Staff engineers.",
          metricDelta: "+19.1% LinkedIn Dwell Time",
        },
        {
          id: "ins_03",
          timestamp: "3d ago",
          title: "18:30 IST captures both India evening and EU afternoon engineering cohorts",
          detail: "Scheduler agent updated default LinkedIn and YouTube release windows to 18:30–19:30 IST.",
          metricDelta: "Slot Calibration",
        },
      ],
    };

    this.brandKit = {
      voiceDescriptors: [
        { label: "Tone", value: 82, leftPole: "Casual / Conversational", rightPole: "Calm / Systems-Precise" },
        { label: "Density", value: 88, leftPole: "High-Level Overview", rightPole: "Benchmark & Code Grounded" },
        { label: "Posture", value: 76, leftPole: "Promotional", rightPole: "Measured Peer Engineer" },
        { label: "Pacing", value: 70, leftPole: "Narrative Essay", rightPole: "Crisp Architectural Notes" },
      ],
      freeTextVoice: "Write like a staff systems engineer sharing field notes from a quiet lab at night. Lead with concrete latency, throughput, or architectural trade-offs. Never use exclamation marks, artificial urgency, or vague AI futurism.",
      doList: [
        "Cite exact p50/p99 latency numbers, memory footprints, and commit hashes from the video transcript.",
        "Explain what broke first before showing the architectural fix.",
        "Use clean monospace identifiers for functions, queues, and CLI flags.",
        "Keep paragraphs under 3 sentences on LinkedIn and hooks under 6 words on Instagram.",
      ],
      dontList: [
        "Never use exclamation marks anywhere in titles, captions, or CTAs.",
        "Never use emojis as bullet points or structural dividers.",
        'Never claim a tool or pattern is "revolutionary", "game-changing", or "magical".',
        "Never publish unverified metrics not present in the source video or repo.",
      ],
      bannedWords: [
        "game-changer",
        "revolutionary",
        "unleash",
        "supercharge",
        "delve",
        "tapestry",
        "skyrocket",
        "mind-blowing",
        "secret sauce",
        "crushing it",
        "10x",
        "insane",
      ],
      examplePosts: [
        {
          platform: "linkedin",
          text: "Moving our token bucket rate-limiter from application memory into a single Redis Lua script eliminated 11ms of cross-node lock contention at 6,000 RPS. Here is the exact 28-line script and where it still trades off against local clock drift.",
        },
        {
          platform: "youtube",
          text: "00:00 Why naive retry loops amplify downstream brownouts\n01:14 Implementing decorrelated jitter backoff in TypeScript\n02:45 Live chaos test against Cloudflare AI Gateway",
        },
      ],
      personas: [
        {
          name: "Staff / Principal Infrastructure Engineer",
          role: "Evaluates architecture rigor, failure modes, and latency numbers.",
          painPoints: "Allergic to marketing fluff; wants reproducible benchmarks and trade-offs.",
        },
        {
          name: "Full-Stack AI Builder",
          role: "Ships production agent workflows with Next.js, Node, Rust, and MCP.",
          painPoints: "Wants copy-pasteable configs, schema patterns, and cost predictability.",
        },
        {
          name: "Technical Founder / CTO",
          role: "Balances provider spend, reliability, and publishing velocity.",
          painPoints: "Needs clear autonomy guardrails and observability.",
        },
      ],
      ctaLibrary: [
        "Full benchmark harness and MCP configuration in the repository link below.",
        "Inspect the live trace and schema definition in the description.",
        "Architecture diagram and CLI snippet pinned in the repository.",
      ],
      hashtagSets: [
        { name: "Core Systems & Infra", tags: ["#SystemsEngineering", "#DistributedSystems", "#BackendEngineering", "#RustLang"] },
        { name: "LLM & Agent Tooling", tags: ["#LLMOrchestration", "#MCPServer", "#AIInfrastructure", "#TypeScript"] },
        { name: "Builder Reels", tags: ["#devtooling", "#buildinpublic", "#softwarearchitecture", "#terminal"] },
      ],
    };

    this.auditEvents = [
      { id: "aud_1", timestamp: "16:34:45 IST", actor: "Claude Code MCP (tok_02)", category: "mcp.tool", action: "get_run_telemetry", target: "run_9042_live", latencyMs: 14, status: "ok", meta: '{"includeSteps":true}' },
      { id: "aud_2", timestamp: "16:34:39 IST", actor: "Cloudflare AI Gateway", category: "provider.fallback", action: "reroute_on_429", target: "gemini-2.5-pro -> nvidia-llama-3.3-70b", latencyMs: 42, status: "warning", meta: "HTTP 429 RPM limit on primary" },
      { id: "aud_3", timestamp: "16:34:12 IST", actor: "Antigravity CLI (tok_01)", category: "mcp.tool", action: "ingest_video_stream", target: "ag-stream-904.mp4", latencyMs: 38, status: "ok", meta: '{"sizeMb":48.2,"commit":"8f92c1a"}' },
      { id: "aud_4", timestamp: "15:12:08 IST", actor: "Brand Reviewer (agt_brand_reviewer)", category: "run.step", action: "compliance_gate_passed", target: "cnt_02 (Score 96/100)", latencyMs: 195, status: "ok", meta: "0 banned words" },
      { id: "aud_5", timestamp: "14:20:11 IST", actor: "Sunny (Owner)", category: "approval", action: "approve_and_schedule", target: "cnt_04 -> LinkedIn, Instagram", latencyMs: 18, status: "ok", meta: "Slot: 18:30 IST" },
      { id: "aud_6", timestamp: "12:05:44 IST", actor: "Cursor IDE (tok_03)", category: "mcp.tool", action: "list_awaiting_approvals", target: "ws_devhouse_core", latencyMs: 11, status: "ok", meta: "count=4" },
    ];

    this.systemServices = [
      { id: "srv_api", name: "Ingest & Console API", category: "api", status: "healthy", uptime: "99.98% (42d)", latencyMs: 16, detail: "Fastify v5 + OpenAPI 3.1 + SSE · v2.4.1" },
      { id: "srv_worker", name: "Agent Orchestration Worker Pool", category: "worker", status: "healthy", uptime: "99.95% (42d)", latencyMs: 28, detail: "8 concurrent DAG fibers · Crash-recovery supervisor" },
      { id: "srv_queues", name: "BullMQ Job Queues", category: "queues", status: "healthy", uptime: "100% (42d)", latencyMs: 4, detail: "Active: 3 · Waiting: 1 · Delayed: 6 · DLQ: 2" },
      { id: "srv_db", name: "PostgreSQL 16 + pgvector", category: "db", status: "healthy", uptime: "99.99% (90d)", latencyMs: 7, detail: "Drizzle ORM · Connection pool 18/100" },
      { id: "srv_redis", name: "Redis 7.4 Streams Bus", category: "redis", status: "healthy", uptime: "100% (90d)", latencyMs: 2, detail: "Memory 412 MB / 4.0 GB · Eviction: noeviction" },
      { id: "srv_storage", name: "Cloudflare R2 / MinIO S3 Bucket", category: "storage", status: "healthy", uptime: "100% (90d)", latencyMs: 29, detail: "142.8 GB stored · Zero egress fee" },
      { id: "srv_disk", name: "FFmpeg Scratch NVMe Scratchpad", category: "disk", status: "healthy", uptime: "99.90% (14d)", latencyMs: 9, detail: "42% utilized (84 GB / 200 GB)" },
    ];

    this.dlqJobs = [
      { id: "dlq_881", queue: "publish.youtube", payloadSummary: "cnt_07 · PostgreSQL 17 JSONB Indexing Pitfalls", errorReason: "YouTube OAuth refresh token near expiry window (HTTP 401 soft check)", failedAt: "Yesterday 14:12 IST", attempts: 3 },
      { id: "dlq_874", queue: "ingest.transcribe", payloadSummary: "cnt_19 · Raw 4K 120fps unindexed MOV chunk", errorReason: "FFmpeg audio stream #0:1 missing PCM header before remux", failedAt: "3d ago", attempts: 2 },
    ];

    // Seed initial live events into globalEventBus history so SSE connects with immediate context
    const initialEvents = [
      { id: "ev_104", timestamp: "16:34:30 IST", type: "run.status" as const, nodeId: "src_antigravity", runId: "run_9042_live", summary: "Antigravity automation ingested `ag-stream-904.mp4` (Zero-Copy IPC in Rust & Node.js)", status: "running" as const },
      { id: "ev_105", timestamp: "16:34:36 IST", type: "node.status" as const, nodeId: "med_whisper", runId: "run_9042_live", summary: "Transcription Engine aligned 1,420 spoken tokens across 03:48 video stream", status: "idle" as const },
      { id: "ev_106", timestamp: "16:34:41 IST", type: "edge.packet" as const, nodeId: "agt_director", edgeId: "e_dir_lw", runId: "run_9042_live", summary: "Director dispatched parallel platform briefs to LinkedIn, Instagram, and YouTube Writers", status: "running" as const },
      { id: "ev_107", timestamp: "16:34:45 IST", type: "tool.call" as const, nodeId: "gw_mcp", runId: "run_9042_live", summary: "MCP tool call `get_brand_guardrails` invoked by Brand Reviewer (14ms)", status: "running" as const },
      { id: "ev_108", timestamp: "16:34:49 IST", type: "agent.token" as const, nodeId: "agt_youtube_writer", runId: "run_9042_live", summary: "YouTube Writer generated 6 timestamped chapters + 3 title candidates (92 tok/s)", deltaTokens: 410, deltaCostUsd: 0.014, status: "running" as const },
      { id: "ev_109", timestamp: "16:34:52 IST", type: "provider.fallback" as const, nodeId: "prv_nvidia", edgeId: "e_gw_nvidia", runId: "run_9042_live", summary: "Cloudflare AI Gateway rerouted LinkedIn Writer from Gemini 2.5 Pro (HTTP 429) to NVIDIA NIM Llama-3.3-70B (235ms)", status: "running" as const },
    ];
    for (const ev of initialEvents) {
      globalEventBus.emitEvent(ev);
    }
  }

  /**
   * Builds fresh, isolated platform Variant objects for a ContentItem so mutations
   * never leak across items via shared object references.
   */
  buildVariantsForContent(
    contentId: string,
    title: string,
    status: ContentItem["status"] = "awaiting_approval"
  ): Record<PlatformId, Variant> {
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

  recordAudit(event: Omit<AuditEvent, "id" | "timestamp">): AuditEvent {
    const entry: AuditEvent = {
      id: `aud_${Date.now()}_${crypto.randomBytes(2).toString("hex")}`,
      timestamp:
        new Date().toLocaleTimeString("en-GB", { timeZone: this.workspace.timezone, hour12: false }) +
        " IST",
      ...event,
    };
    this.auditEvents.unshift(entry);
    void pgBridge.persistAuditLog(entry, this.workspace.id);
    return entry;
  }

  addOrRotateProviderKey(providerId: ProviderId, rawKey: string, baseUrl?: string): Provider {
    const provider = this.providers.find((p) => p.id === providerId);
    if (!provider) {
      throw new Error(`Provider not found: ${providerId}`);
    }
    const encrypted = this.vault.encrypt(rawKey, `provider:${providerId}`);
    const existingPool = this.encryptedProviderKeys.get(providerId) ?? [];
    // Multi-key rotation pool: push newest key to front
    this.encryptedProviderKeys.set(providerId, [encrypted, ...existingPool].slice(0, 5));
    provider.maskedKey = SecretVault.maskSecret(rawKey);
    provider.status = "connected";
    if (baseUrl) {
      provider.baseUrl = baseUrl;
    }
    void pgBridge.persistProvider(provider, encrypted, this.workspace.id);
    this.recordAudit({
      actor: "Owner",
      category: "security",
      action: "provider.key.rotate",
      target: providerId,
      status: "ok",
      meta: `Pool size: ${this.encryptedProviderKeys.get(providerId)?.length ?? 1}`,
    });
    return { ...provider };
  }

  createScopedApiToken(
    name: string,
    scopes: TokenScope[],
    expiresAt: string,
    clientAgent = "MCP Client"
  ): { token: ApiToken; plainSecret: string } {
    const { plainSecret, tokenHash, maskedPrefix } = AuthService.mintApiToken();
    const record = {
      id: `tok_0${this.apiTokens.length + 1}`,
      name,
      prefix: maskedPrefix,
      tokenHash,
      scopes: scopes.length > 0 ? scopes : (["read"] as TokenScope[]),
      createdAt: new Date().toISOString().slice(0, 10),
      expiresAt,
      lastUsedAt: "Just now",
      clientAgent,
      revoked: false,
    };
    this.apiTokens.unshift(record);
    this.recordAudit({
      actor: "Owner",
      category: "security",
      action: "mcp.token.create",
      target: `${record.id} (${name})`,
      status: "ok",
      meta: `Scopes: ${record.scopes.join(",")}`,
    });
    void pgBridge.persistApiToken(record, this.workspace.id);
    const { tokenHash: _omit, revoked: _rev, ...publicToken } = record;
    return { token: publicToken, plainSecret };
  }

  revokeApiToken(tokenId: string): boolean {
    const idx = this.apiTokens.findIndex((t) => t.id === tokenId);
    if (idx === -1) return false;
    const tok = this.apiTokens[idx]!;
    this.apiTokens.splice(idx, 1);
    tok.revoked = true;
    void pgBridge.persistApiTokenRevocation(tok.id);
    this.recordAudit({
      actor: "Owner",
      category: "security",
      action: "mcp.token.revoke",
      target: `${tok.id} (${tok.name})`,
      status: "warning",
    });
    return true;
  }

  verifyBearerToken(plainSecret: string): { valid: boolean; scopes: TokenScope[]; actor: string } {
    const hash = AuthService.hashBearerToken(plainSecret);
    const matched = this.apiTokens.find((t) => t.tokenHash === hash && !t.revoked);
    if (!matched) {
      return { valid: false, scopes: [], actor: "anonymous" };
    }
    const expiryTime = Date.parse(matched.expiresAt);
    if (!Number.isNaN(expiryTime) && expiryTime < Date.now()) {
      return { valid: false, scopes: [], actor: "expired" };
    }
    matched.lastUsedAt = "Just now";
    return { valid: true, scopes: matched.scopes, actor: `${matched.name} (${matched.id})` };
  }
}

export const dbStore = new DevHouseRepository();
