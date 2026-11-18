import {
  AuthService,
  globalEventBus,
  type TokenScope,
  type PlatformId,
  type ProviderId,
} from "@devhouse/core";
import { dbStore } from "@devhouse/db";
import { llmGateway } from "@devhouse/providers";
import { mediaPipeline } from "@devhouse/media";
import { agentDagOrchestrator } from "@devhouse/agents";
import { socialConnectors } from "@devhouse/connectors";

export interface McpToolDefinition {
  name: string;
  description: string;
  requiredScope: TokenScope;
  inputSchema: Record<string, unknown>;
}

export const MCP_TOOLS_CATALOG: McpToolDefinition[] = [
  { name: "list_channels", description: "List connected social channels, token health, and quotas", requiredScope: "read", inputSchema: { type: "object", properties: {} } },
  { name: "submit_video", description: "Ingest a video via URL or metadata and start an agent run", requiredScope: "ingest", inputSchema: { type: "object", required: ["title"], properties: { title: { type: "string" }, url: { type: "string" }, durationSec: { type: "number" } } } },
  { name: "list_content", description: "List content items filtered by status or platform", requiredScope: "read", inputSchema: { type: "object", properties: { status: { type: "string" }, platform: { type: "string" } } } },
  { name: "get_run", description: "Get detailed run status and DAG step timeline", requiredScope: "read", inputSchema: { type: "object", required: ["runId"], properties: { runId: { type: "string" } } } },
  { name: "tail_run_logs", description: "Tail live SSE event logs for a run", requiredScope: "read", inputSchema: { type: "object", required: ["runId"], properties: { runId: { type: "string" }, limit: { type: "number" } } } },
  { name: "list_approvals", description: "List pending or decided items at the Human Approval Gate", requiredScope: "read", inputSchema: { type: "object", properties: { status: { type: "string" }, limit: { type: "number" } } } },
  { name: "approve_item", description: "Approve a pending content item at the Human Approval Gate", requiredScope: "write", inputSchema: { type: "object", required: ["approvalId"], properties: { approvalId: { type: "string" } } } },
  { name: "reject_item", description: "Reject a pending approval item with feedback", requiredScope: "write", inputSchema: { type: "object", required: ["approvalId"], properties: { approvalId: { type: "string" }, feedback: { type: "string" } } } },
  { name: "edit_variant", description: "Edit platform-specific variant copy and increment version", requiredScope: "write", inputSchema: { type: "object", required: ["contentId", "platform", "body"], properties: { contentId: { type: "string" }, platform: { type: "string" }, body: { type: "string" } } } },
  { name: "schedule_post", description: "Schedule or reschedule a post in Asia/Kolkata timezone", requiredScope: "write", inputSchema: { type: "object", required: ["postId", "dayOfMonth", "hour"], properties: { postId: { type: "string" }, dayOfMonth: { type: "number" }, hour: { type: "number" } } } },
  { name: "publish_now", description: "Publish a variant immediately (defaults to dry_run unless token has publish scope AND autonomy mode allows it)", requiredScope: "read", inputSchema: { type: "object", required: ["contentId", "platform"], properties: { contentId: { type: "string" }, platform: { type: "string" }, dry_run: { type: "boolean" } } } },
  { name: "list_agents", description: "List all 13 orchestration agents and their current prompts/models", requiredScope: "read", inputSchema: { type: "object", properties: {} } },
  { name: "update_agent_prompt", description: "Create a new immutable version of an agent system prompt", requiredScope: "write", inputSchema: { type: "object", required: ["agentId", "systemPrompt"], properties: { agentId: { type: "string" }, systemPrompt: { type: "string" }, note: { type: "string" } } } },
  { name: "run_agent", description: "Execute a single agent in playground mode against sample input", requiredScope: "write", inputSchema: { type: "object", required: ["agentId", "sampleInput"], properties: { agentId: { type: "string" }, sampleInput: { type: "string" } } } },
  { name: "list_providers", description: "List BYOK LLM providers with masked keys and spend", requiredScope: "read", inputSchema: { type: "object", properties: {} } },
  { name: "test_provider", description: "Test connectivity and latency to a configured LLM provider", requiredScope: "read", inputSchema: { type: "object", required: ["providerId"], properties: { providerId: { type: "string" } } } },
  { name: "set_routing_policy", description: "Reorder the automatic LLM provider fallback chain", requiredScope: "admin", inputSchema: { type: "object", required: ["orderedIds"], properties: { orderedIds: { type: "array", items: { type: "string" } } } } },
  { name: "get_usage", description: "Get daily LLM token and cost usage breakdown", requiredScope: "read", inputSchema: { type: "object", properties: {} } },
  { name: "get_analytics", description: "Get multi-channel engagement telemetry and Analyst insights", requiredScope: "read", inputSchema: { type: "object", properties: {} } },
  { name: "get_brand_kit", description: "Get Brand Kit voice sliders, do/don't rules, and banned words", requiredScope: "read", inputSchema: { type: "object", properties: {} } },
  { name: "pause_publishing", description: "Engage workspace kill switch to immediately pause all outbound publishing", requiredScope: "admin", inputSchema: { type: "object", properties: {} } },
  { name: "resume_publishing", description: "Disengage workspace kill switch and resume scheduled publishing", requiredScope: "admin", inputSchema: { type: "object", properties: {} } },
];

// Normalize UI tool-tester aliases to canonical MCP tool names
const TOOL_ALIASES: Record<string, string> = {
  get_run_telemetry: "get_run",
  list_awaiting_approvals: "list_approvals",
  ingest_video_stream: "submit_video",
  approve_variant: "approve_item",
};

export const MCP_RESOURCES_CATALOG = [
  { uri: "devhouse://brand-kit", name: "Brand Kit & Voice Guardrails", mimeType: "application/json" },
  { uri: "devhouse://calendar", name: "Publishing Calendar (Asia/Kolkata)", mimeType: "application/json" },
  { uri: "devhouse://runs", name: "Active & Historical Agent Runs", mimeType: "application/json" },
  { uri: "devhouse://agents", name: "13-Agent Crew Prompts & Schemas", mimeType: "application/json" },
  { uri: "devhouse://docs", name: "Dev House Architecture & Contract Documentation", mimeType: "text/markdown" },
];

export class DevHouseMcpServer {
  /**
   * Executes an MCP tool call with bearer-token scope enforcement, `dry_run` safety defaults,
   * and immutable audit logging on every call.
   */
  async invokeTool(params: {
    toolName: string;
    args: Record<string, unknown>;
    grantedScopes: TokenScope[];
    actor: string;
  }): Promise<Record<string, unknown>> {
    const startMs = Date.now();
    const canonicalName = TOOL_ALIASES[params.toolName] ?? params.toolName;
    const def = MCP_TOOLS_CATALOG.find((t) => t.name === canonicalName);
    if (!def) {
      throw new Error(`Unknown MCP tool: ${params.toolName}`);
    }

    if (!AuthService.hasRequiredScope(params.grantedScopes, def.requiredScope)) {
      dbStore.recordAudit({
        actor: params.actor,
        category: "mcp.tool",
        action: `${params.toolName}.forbidden`,
        target: `Required scope: ${def.requiredScope}`,
        latencyMs: Date.now() - startMs,
        status: "error",
      });
      throw new Error(`ForbiddenScopeError: Tool '${params.toolName}' requires '${def.requiredScope}' scope`);
    }

    let result: Record<string, unknown>;

    switch (canonicalName) {
      case "list_channels":
        result = { channels: dbStore.channels };
        break;

      case "submit_video": {
        const title = String(params.args.title ?? "Untitled MCP Video Stream");
        const sourceUrl = params.args.url ? String(params.args.url) : undefined;
        const durationSec = Number(params.args.durationSec ?? 210);
        const probe = mediaPipeline.probeStream({ title, durationSec, sourceUrl });

        // Deduplicate by SHA-256 hash
        const existingId = dbStore.contentHashes.get(probe.sha256Hash);
        if (existingId) {
          const existingItem = dbStore.contentItems.find((c) => c.id === existingId)!;
          result = { deduplicated: true, contentItem: existingItem, runId: existingItem.runId };
          break;
        }

        const contentId = `cnt_${String(dbStore.contentItems.length + 1).padStart(2, "0")}`;
        const runId = `run_${9043 + dbStore.runs.length}`;
        const mediaArtifacts = await mediaPipeline.processIngestedMedia(contentId, runId, {
          title,
          durationSec,
          sourceUrl,
        });

        const newContent = {
          id: contentId,
          title,
          source: "MCP (Claude Code)" as const,
          durationSec: mediaArtifacts.probe.durationSec,
          durationFormatted: mediaArtifacts.probe.durationFormatted,
          status: "writing" as const,
          platforms: ["linkedin", "instagram", "youtube"] as PlatformId[],
          createdAt: "Just now",
          runId,
          costUsd: 0,
          transcript: mediaArtifacts.transcript,
          variants: dbStore.buildVariantsForContent(contentId, title, "writing"),
          metadata: {
            resolution: mediaArtifacts.probe.resolution,
            fps: mediaArtifacts.probe.fps,
            codec: mediaArtifacts.probe.codec,
            fileSizeMb: mediaArtifacts.probe.fileSizeMb,
            ingestCommit: probe.sha256Hash.slice(0, 7),
          },
        };
        dbStore.contentHashes.set(probe.sha256Hash, contentId);
        dbStore.contentItems.unshift(newContent);

        const newRun = {
          id: runId,
          contentId,
          contentTitle: title,
          source: "MCP (Claude Code)" as const,
          status: "running" as const,
          startedAt: "Just now",
          durationSec: 0,
          totalTokens: 0,
          totalCostUsd: 0,
          steps: [],
        };
        dbStore.runs.unshift(newRun);
        await agentDagOrchestrator.executeOrResumeRun(runId);
        result = { deduplicated: false, contentItem: newContent, run: newRun };
        break;
      }

      case "list_content": {
        const st = params.args.status ? String(params.args.status) : undefined;
        const pl = params.args.platform ? (String(params.args.platform) as PlatformId) : undefined;
        const items = dbStore.contentItems.filter(
          (c) => (!st || c.status === st) && (!pl || c.platforms.includes(pl))
        );
        result = { count: items.length, items };
        break;
      }

      case "get_run": {
        const targetId = params.args.runId ? String(params.args.runId) : dbStore.runs[0]?.id;
        const run = dbStore.runs.find((r) => r.id === targetId) ?? dbStore.runs[0];
        if (!run) throw new Error(`Run not found: ${String(targetId)}`);
        result = { run };
        break;
      }

      case "tail_run_logs": {
        const runId = params.args.runId ? String(params.args.runId) : "";
        const limit = Number(params.args.limit ?? 20);
        const logs = globalEventBus.getRecentEvents(limit).filter((e) => !runId || e.runId === runId);
        result = { runId: runId || "all", events: logs };
        break;
      }

      case "list_approvals": {
        const st = params.args.status ? String(params.args.status) : undefined;
        const limit = Number(params.args.limit ?? 50);
        const items = dbStore.approvals
          .filter((a) => !st || a.status === st)
          .slice(0, limit);
        result = { count: items.length, approvals: items };
        break;
      }

      case "approve_item": {
        const targetId = params.args.approvalId ? String(params.args.approvalId) : dbStore.approvals[0]?.id;
        const apr = dbStore.approvals.find((a) => a.id === targetId);
        if (!apr) throw new Error(`Approval not found: ${String(targetId)}`);
        apr.status = "approved";
        const content = dbStore.contentItems.find((c) => c.id === apr.contentId);
        if (content) content.status = "scheduled";
        result = { approval: apr };
        break;
      }

      case "reject_item": {
        const apr = dbStore.approvals.find((a) => a.id === String(params.args.approvalId));
        if (!apr) throw new Error(`Approval not found: ${String(params.args.approvalId)}`);
        apr.status = "rejected";
        const content = dbStore.contentItems.find((c) => c.id === apr.contentId);
        if (content) content.status = "failed";
        result = { approval: apr, feedback: params.args.feedback ?? "" };
        break;
      }

      case "edit_variant": {
        const content = dbStore.contentItems.find((c) => c.id === String(params.args.contentId));
        if (!content) throw new Error(`Content not found: ${String(params.args.contentId)}`);
        const plat = String(params.args.platform) as PlatformId;
        const variant = content.variants[plat];
        if (!variant) throw new Error(`Variant not found for platform: ${plat}`);
        variant.previousBody = variant.body;
        variant.body = String(params.args.body);
        variant.version += 1;
        result = { variant };
        break;
      }

      case "schedule_post": {
        const post = dbStore.posts.find((p) => p.id === String(params.args.postId));
        if (!post) throw new Error(`Post not found: ${String(params.args.postId)}`);
        post.dayOfMonth = Number(params.args.dayOfMonth);
        post.hour = Number(params.args.hour);
        post.scheduledAt = `2026-11-${post.dayOfMonth} ${post.hour}:30 IST`;
        post.status = "scheduled";
        post.conflictWarning = undefined;
        result = { post };
        break;
      }

      case "publish_now": {
        // SAFETY RULE: publish/delete default to dry_run unless the token has the `publish` scope
        // AND the workspace autonomy mode allows it (not `manual` and not `publishingPaused`).
        const hasPublishScope = AuthService.hasRequiredScope(params.grantedScopes, "publish");
        const autonomyAllows =
          dbStore.workspace.autonomyMode !== "manual" && !dbStore.workspace.publishingPaused;
        const requestedDryRun = params.args.dry_run === true;
        const effectiveDryRun = requestedDryRun || !hasPublishScope || !autonomyAllows;

        const content = dbStore.contentItems.find((c) => c.id === String(params.args.contentId));
        if (!content) throw new Error(`Content not found: ${String(params.args.contentId)}`);
        const platform = String(params.args.platform) as PlatformId;
        const variant = content.variants[platform];
        if (!variant) throw new Error(`Variant not found for platform: ${platform}`);

        if (effectiveDryRun) {
          result = {
            dry_run: true,
            reason: !hasPublishScope
              ? "Token lacks 'publish' scope — executed in safe dry_run mode"
              : !autonomyAllows
              ? "Workspace autonomy mode or kill-switch requires dry_run"
              : "Explicit dry_run requested",
            contentId: content.id,
            platform,
            validatedChars: variant.body.length,
          };
        } else {
          const receipt = await socialConnectors.publishVariantIdempotent({
            runId: content.runId,
            contentId: content.id,
            platform,
            variant,
          });
          variant.status = "published";
          content.status = "published";
          result = { dry_run: false, receipt };
        }
        break;
      }

      case "list_agents":
        result = { agents: dbStore.agents };
        break;

      case "update_agent_prompt": {
        const ag = dbStore.agents.find((a) => a.id === String(params.args.agentId));
        if (!ag) throw new Error(`Agent not found: ${String(params.args.agentId)}`);
        const newPrompt = String(params.args.systemPrompt);
        const nextVersion = `v${ag.versions.length + 4}.0 (Active)`;
        ag.systemPrompt = newPrompt;
        ag.versions.unshift({
          version: nextVersion,
          createdAt: new Date().toISOString(),
          author: params.actor,
          note: String(params.args.note ?? "Updated via MCP update_agent_prompt"),
          systemPrompt: newPrompt,
        });
        result = { agent: ag, newVersion: nextVersion };
        break;
      }

      case "run_agent": {
        const ag = dbStore.agents.find((a) => a.id === String(params.args.agentId));
        if (!ag) throw new Error(`Agent not found: ${String(params.args.agentId)}`);
        const completion = await llmGateway.complete({
          runId: "run_mcp_playground",
          agentId: ag.id,
          primaryModelId: ag.primaryModelId,
          fallbackModelId: ag.fallbackModelId,
          systemPrompt: ag.systemPrompt,
          userPrompt: String(params.args.sampleInput ?? ""),
          temperature: ag.temperature,
        });
        result = { completion };
        break;
      }

      case "list_providers":
        result = { providers: dbStore.providers };
        break;

      case "test_provider": {
        const probe = await llmGateway.testConnection(String(params.args.providerId) as ProviderId);
        result = probe;
        break;
      }

      case "set_routing_policy": {
        const orderedIds = (params.args.orderedIds as ProviderId[]) ?? [];
        orderedIds.forEach((id, index) => {
          const prv = dbStore.providers.find((p) => p.id === id);
          if (prv) prv.fallbackOrder = index + 1;
        });
        result = { providers: [...dbStore.providers].sort((a, b) => a.fallbackOrder - b.fallbackOrder) };
        break;
      }

      case "get_usage":
        result = { usage: dbStore.usageHistory, spentTodayUsd: dbStore.workspace.spentTodayUsd };
        break;

      case "get_analytics":
        result = { analytics: dbStore.analytics };
        break;

      case "get_brand_kit":
        result = { brandKit: dbStore.brandKit };
        break;

      case "pause_publishing":
        dbStore.workspace.publishingPaused = true;
        result = { publishingPaused: true, workspace: dbStore.workspace };
        break;

      case "resume_publishing":
        dbStore.workspace.publishingPaused = false;
        result = { publishingPaused: false, workspace: dbStore.workspace };
        break;

      default:
        throw new Error(`Unhandled MCP tool: ${params.toolName}`);
    }

    dbStore.recordAudit({
      actor: params.actor,
      category: "mcp.tool",
      action: params.toolName,
      target: JSON.stringify(params.args).slice(0, 80),
      latencyMs: Date.now() - startMs,
      status: "ok",
    });

    globalEventBus.emitEvent({
      type: "tool.call",
      runId: "run_9042_live",
      nodeId: "gw_mcp",
      status: "running",
      summary: `MCP tool '${params.toolName}' executed by ${params.actor} (${Date.now() - startMs}ms)`,
    });

    return result;
  }

  readResource(uri: string): { uri: string; mimeType: string; content: unknown } {
    switch (uri) {
      case "devhouse://brand-kit":
        return { uri, mimeType: "application/json", content: dbStore.brandKit };
      case "devhouse://calendar":
        return { uri, mimeType: "application/json", content: dbStore.posts };
      case "devhouse://runs":
        return { uri, mimeType: "application/json", content: dbStore.runs };
      case "devhouse://agents":
        return { uri, mimeType: "application/json", content: dbStore.agents };
      case "devhouse://docs":
        return {
          uri,
          mimeType: "text/markdown",
          content: "# Dev House MCP Server\nExposes 22 tools and 5 resources over Streamable HTTP (/mcp) and stdio.",
        };
      default:
        throw new Error(`Unknown MCP resource URI: ${uri}`);
    }
  }
}

export const mcpServer = new DevHouseMcpServer();
