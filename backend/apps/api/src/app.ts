import http from "node:http";
import { URL } from "node:url";
import {
  AuthService,
  AutonomyModeSchema,
  PlatformIdSchema,
  ProviderIdSchema,
  TokenScopeSchema,
  globalEventBus,
  outboundNotifier,
  type TokenScope,
  type PlatformId,
  type ContentItem,
} from "@devhouse/core";
import { dbStore } from "@devhouse/db";
import { mediaPipeline } from "@devhouse/media";
import { agentDagOrchestrator } from "@devhouse/agents";
import { socialConnectors } from "@devhouse/connectors";
import { llmGateway } from "@devhouse/providers";
import { mcpServer, MCP_TOOLS_CATALOG, MCP_RESOURCES_CATALOG } from "@devhouse/mcp";

/**
 * Contract-first HTTP & SSE router that runs both inside Fastify and via Node's native
 * HTTP server so tests and zero-dependency verifications execute instantaneously.
 */
export async function handleApiRequest(
  method: string,
  rawUrl: string,
  headers: Record<string, string | string[] | undefined>,
  bodyText: string
): Promise<{ status: number; headers?: Record<string, string>; body: unknown }> {
  const parsedUrl = new URL(rawUrl, "http://localhost:4000");
  // Normalize both `/api/v1/*` and `/v1/*` so any NEXT_PUBLIC_API_URL works without UI changes
  const path = parsedUrl.pathname.replace(/^\/api\/v1/, "/v1");

  const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": String(headers.origin ?? "*"),
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-DevHouse-Token",
    "Access-Control-Allow-Credentials": "true",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
  };

  if (method === "OPTIONS") {
    return { status: 204, headers: corsHeaders, body: null };
  }

  let jsonBody: Record<string, unknown> = {};
  if (bodyText && bodyText.trim()) {
    try {
      jsonBody = JSON.parse(bodyText) as Record<string, unknown>;
    } catch {
      return { status: 400, headers: corsHeaders, body: { error: "Malformed JSON request body" } };
    }
  }

  // Resolve Bearer Token or default Owner session
  const authHeader = String(headers.authorization ?? headers["x-devhouse-token"] ?? "");
  let grantedScopes: TokenScope[] = ["read", "write", "ingest", "publish", "admin"];
  let actor = "Sunny (Owner Session)";

  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    const verified = dbStore.verifyBearerToken(token);
    if (!verified.valid) {
      return { status: 401, headers: corsHeaders, body: { error: "Invalid, expired, or revoked API token" } };
    }
    grantedScopes = verified.scopes;
    actor = verified.actor;
  } else if (authHeader && !authHeader.startsWith("Bearer ")) {
    const verified = dbStore.verifyBearerToken(authHeader.trim());
    if (!verified.valid) {
      return { status: 401, headers: corsHeaders, body: { error: "Invalid, expired, or revoked API token" } };
    }
    grantedScopes = verified.scopes;
    actor = verified.actor;
  }

  const assertScope = (required: TokenScope): { status: number; headers: Record<string, string>; body: unknown } | null => {
    if (!AuthService.hasRequiredScope(grantedScopes, required)) {
      return {
        status: 403,
        headers: corsHeaders,
        body: { error: `ForbiddenScopeError: Route '${method} ${path}' requires '${required}' scope` },
      };
    }
    return null;
  };

  try {
    // ---------------------------------------------------------------------------
    // 1. Workspace & Kill-Switch & Autonomy Mode
    // ---------------------------------------------------------------------------
    if (method === "GET" && path === "/v1/workspace") {
      const denied = assertScope("read");
      if (denied) return denied;
      return { status: 200, headers: corsHeaders, body: dbStore.workspace };
    }

    if (method === "PATCH" && path === "/v1/workspace") {
      const denied = assertScope("admin");
      if (denied) return denied;
      if (typeof jsonBody.name === "string" && jsonBody.name.trim()) {
        dbStore.workspace.name = jsonBody.name.trim();
      }
      if (typeof jsonBody.timezone === "string" && jsonBody.timezone.trim()) {
        dbStore.workspace.timezone = jsonBody.timezone.trim();
      }
      if (typeof jsonBody.dailyBudgetUsd === "number" && jsonBody.dailyBudgetUsd >= 0) {
        dbStore.workspace.dailyBudgetUsd = jsonBody.dailyBudgetUsd;
      }
      if (typeof jsonBody.autonomyMode === "string") {
        dbStore.workspace.autonomyMode = AutonomyModeSchema.parse(jsonBody.autonomyMode);
      }
      dbStore.recordAudit({
        actor,
        category: "security",
        action: "workspace.settings.update",
        target: dbStore.workspace.name,
        status: "ok",
      });
      return { status: 200, headers: corsHeaders, body: dbStore.workspace };
    }

    if ((method === "PATCH" || method === "POST") && path === "/v1/workspace/autonomy") {
      const denied = assertScope("write");
      if (denied) return denied;
      const mode = AutonomyModeSchema.parse(jsonBody.mode);
      dbStore.workspace.autonomyMode = mode;
      dbStore.recordAudit({
        actor,
        category: "security",
        action: "workspace.autonomy.update",
        target: mode,
        status: "ok",
      });
      return { status: 200, headers: corsHeaders, body: dbStore.workspace };
    }

    if (method === "POST" && path === "/v1/workspace/kill-switch") {
      const denied = assertScope("admin");
      if (denied) return denied;
      const paused = Boolean(jsonBody.paused);
      dbStore.workspace.publishingPaused = paused;
      dbStore.recordAudit({
        actor,
        category: "security",
        action: paused ? "kill_switch.engaged" : "kill_switch.resumed",
        target: dbStore.workspace.id,
        status: paused ? "warning" : "ok",
      });
      if (paused) {
        void outboundNotifier.notifyKillSwitchEngaged({
          workspaceId: dbStore.workspace.id,
          actor,
        });
      }
      return { status: 200, headers: corsHeaders, body: dbStore.workspace };
    }

    // ---------------------------------------------------------------------------
    // 2. Content Library & Video Ingest (POST /api/v1/ingest)
    // ---------------------------------------------------------------------------
    if (method === "GET" && path === "/v1/content") {
      const denied = assertScope("read");
      if (denied) return denied;
      const statusFilter = parsedUrl.searchParams.get("status");
      const platformFilter = parsedUrl.searchParams.get("platform") as PlatformId | null;
      const queryFilter = parsedUrl.searchParams.get("q")?.toLowerCase().trim();

      let items = dbStore.contentItems;
      if (statusFilter && statusFilter !== "all") {
        items = items.filter((c) => c.status === statusFilter);
      }
      if (platformFilter && (platformFilter as string) !== "all") {
        items = items.filter((c) => c.platforms.includes(platformFilter));
      }
      if (queryFilter) {
        items = items.filter(
          (c) => c.title.toLowerCase().includes(queryFilter) || c.id.toLowerCase().includes(queryFilter)
        );
      }
      return { status: 200, headers: corsHeaders, body: items };
    }

    if (method === "POST" && (path === "/v1/ingest" || path === "/v1/content")) {
      const denied = assertScope("ingest");
      if (denied) return denied;
      const title = String(jsonBody.title ?? "Walkthrough: Lock-Free Ring Buffers in Rust & Node.js");
      const validSources = ["Antigravity", "MCP (Claude Code)", "MCP (Cursor)", "Manual Drop"] as const;
      const rawSource = String(jsonBody.source ?? "Antigravity");
      const source = (validSources.includes(rawSource as (typeof validSources)[number])
        ? rawSource
        : "Antigravity") as ContentItem["source"];
      const durationSec = Number(jsonBody.durationSec ?? 220);
      const sourceUrl = jsonBody.url ? String(jsonBody.url) : undefined;
      const filePath = jsonBody.filePath ? String(jsonBody.filePath) : undefined;

      const probe = filePath
        ? await mediaPipeline.probeBinaryFileWithFfprobe(filePath)
        : mediaPipeline.probeStream({ title, durationSec, sourceUrl });
      const existingContentId = dbStore.contentHashes.get(probe.sha256Hash);
      if (existingContentId) {
        const existing = dbStore.contentItems.find((c) => c.id === existingContentId)!;
        return { status: 200, headers: corsHeaders, body: existing };
      }

      const contentId = `cnt_${String(dbStore.contentItems.length + 1).padStart(2, "0")}`;
      const runId = `run_${9050 + dbStore.runs.length}`;
      const mediaArtifacts = await mediaPipeline.processIngestedMedia(contentId, runId, {
        title,
        durationSec,
        sourceUrl,
        filePath,
      });

      const newItem: ContentItem = {
        id: contentId,
        title,
        source,
        durationSec: mediaArtifacts.probe.durationSec,
        durationFormatted: mediaArtifacts.probe.durationFormatted,
        status: "writing",
        platforms: ["linkedin", "instagram", "youtube"],
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
      dbStore.contentItems.unshift(newItem);

      dbStore.runs.unshift({
        id: runId,
        contentId,
        contentTitle: title,
        source,
        status: "running",
        startedAt: "Just now",
        durationSec: 0,
        totalTokens: 0,
        totalCostUsd: 0,
        steps: [],
      });

      await agentDagOrchestrator.executeOrResumeRun(runId, {
        simulateGemini429: Boolean(jsonBody.simulateGemini429),
      });

      return { status: 201, headers: corsHeaders, body: newItem };
    }

    // Variant inline edit: PATCH /v1/content/:id/variants/:platform
    const variantMatch = path.match(/^\/v1\/content\/([^/]+)\/variants\/([^/]+)$/);
    if (method === "PATCH" && variantMatch) {
      const denied = assertScope("write");
      if (denied) return denied;
      const contentId = variantMatch[1]!;
      const platform = PlatformIdSchema.parse(variantMatch[2]);
      const item = dbStore.contentItems.find((c) => c.id === contentId);
      if (!item) return { status: 404, headers: corsHeaders, body: { error: "ContentItem not found" } };
      const variant = item.variants[platform];
      if (!variant) {
        return { status: 404, headers: corsHeaders, body: { error: `Variant not found: ${platform}` } };
      }
      if (jsonBody.body !== undefined) {
        variant.previousBody = variant.body;
        variant.body = String(jsonBody.body);
        variant.version += 1;
      }
      if (typeof jsonBody.title === "string") {
        variant.title = jsonBody.title;
      }
      // Keep any matching approval's variant copy synchronized
      const matchingApproval = dbStore.approvals.find((a) => a.contentId === contentId);
      if (matchingApproval) {
        matchingApproval.variants[platform] = { ...variant };
      }
      return { status: 200, headers: corsHeaders, body: item };
    }

    // ---------------------------------------------------------------------------
    // 3. Runs, Clone Run & Retry-from-Step
    // ---------------------------------------------------------------------------
    if (method === "GET" && path === "/v1/runs") {
      const denied = assertScope("read");
      if (denied) return denied;
      const statusFilter = parsedUrl.searchParams.get("status");
      const runs =
        statusFilter && statusFilter !== "all"
          ? dbStore.runs.filter((r) => r.status === statusFilter)
          : dbStore.runs;
      return { status: 200, headers: corsHeaders, body: runs };
    }

    const runByIdMatch = path.match(/^\/v1\/runs\/([^/]+)$/);
    if (method === "GET" && runByIdMatch) {
      const denied = assertScope("read");
      if (denied) return denied;
      const run = dbStore.runs.find((r) => r.id === runByIdMatch[1]);
      if (!run) return { status: 404, headers: corsHeaders, body: { error: "Run not found" } };
      return { status: 200, headers: corsHeaders, body: run };
    }

    const cloneRunMatch = path.match(/^\/v1\/runs\/([^/]+)\/clone$/);
    if (method === "POST" && cloneRunMatch) {
      const denied = assertScope("write");
      if (denied) return denied;
      const orig = dbStore.runs.find((r) => r.id === cloneRunMatch[1]);
      if (!orig) return { status: 404, headers: corsHeaders, body: { error: "Run not found" } };
      const cloneId = `run_${9050 + dbStore.runs.length}`;
      const clonedRun = {
        ...orig,
        id: cloneId,
        status: "running" as const,
        startedAt: "Just now (Cloned)",
        steps: orig.steps.map((s, idx) => ({
          ...s,
          id: `${cloneId}_stp_${idx + 1}`,
        })),
      };
      dbStore.runs.unshift(clonedRun);
      return { status: 201, headers: corsHeaders, body: clonedRun };
    }

    const retryStepMatch = path.match(/^\/v1\/runs\/([^/]+)\/steps\/([^/]+)\/retry$/);
    if (method === "POST" && retryStepMatch) {
      const denied = assertScope("write");
      if (denied) return denied;
      const updatedRun = await agentDagOrchestrator.retryFromStep(retryStepMatch[1]!, retryStepMatch[2]!);
      return { status: 200, headers: corsHeaders, body: updatedRun };
    }

    // ---------------------------------------------------------------------------
    // 4. Approvals Gate
    // ---------------------------------------------------------------------------
    if (method === "GET" && path === "/v1/approvals") {
      const denied = assertScope("read");
      if (denied) return denied;
      const statusFilter = parsedUrl.searchParams.get("status");
      const approvals =
        statusFilter && statusFilter !== "all"
          ? dbStore.approvals.filter((a) => a.status === statusFilter)
          : dbStore.approvals;
      return { status: 200, headers: corsHeaders, body: approvals };
    }

    const approvalDecideMatch = path.match(/^\/v1\/approvals\/([^/]+)\/decide$/);
    if (method === "POST" && approvalDecideMatch) {
      const denied = assertScope("write");
      if (denied) return denied;
      const apr = dbStore.approvals.find((a) => a.id === approvalDecideMatch[1]);
      if (!apr) return { status: 404, headers: corsHeaders, body: { error: "Approval not found" } };
      const decision = String(jsonBody.decision) as "approved" | "rejected" | "scheduled";
      apr.status = decision;
      const content = dbStore.contentItems.find((c) => c.id === apr.contentId);
      const run = dbStore.runs.find((r) => r.id === apr.runId);
      if (content) {
        if (decision === "approved" && !dbStore.workspace.publishingPaused) {
          for (const platform of content.platforms) {
            const variant = content.variants[platform];
            if (variant) {
              await socialConnectors.publishVariantIdempotent({
                runId: apr.runId,
                contentId: content.id,
                platform,
                variant,
              });
              variant.status = "published";
            }
          }
          content.status = "published";
          if (run) run.status = "completed";
        } else if (decision === "approved" && dbStore.workspace.publishingPaused) {
          content.status = "scheduled";
          for (const platform of content.platforms) {
            if (content.variants[platform]) content.variants[platform].status = "scheduled";
          }
          if (run) run.status = "completed";
        } else if (decision === "scheduled") {
          content.status = "scheduled";
          for (const platform of content.platforms) {
            if (content.variants[platform]) content.variants[platform].status = "scheduled";
          }
          if (run) run.status = "completed";
        } else if (decision === "rejected") {
          content.status = "failed";
          for (const platform of content.platforms) {
            if (content.variants[platform]) content.variants[platform].status = "rejected";
          }
          if (run) run.status = "failed";
        }
      }
      dbStore.recordAudit({
        actor,
        category: "approval",
        action: `approval.${decision}`,
        target: `${apr.id} (${apr.contentId})`,
        status: decision === "rejected" ? "warning" : "ok",
        meta: jsonBody.feedback ? String(jsonBody.feedback) : undefined,
      });
      return { status: 200, headers: corsHeaders, body: apr };
    }

    const approvalRegenMatch = path.match(/^\/v1\/approvals\/([^/]+)\/regenerate$/);
    if (method === "POST" && approvalRegenMatch) {
      const denied = assertScope("write");
      if (denied) return denied;
      const apr = dbStore.approvals.find((a) => a.id === approvalRegenMatch[1]);
      if (!apr) return { status: 404, headers: corsHeaders, body: { error: "Approval not found" } };
      const feedback = String(jsonBody.feedback ?? "Tightened technical hook").trim();
      const linkedinVariant = apr.variants.linkedin;
      if (linkedinVariant) {
        linkedinVariant.previousBody = linkedinVariant.body;
        linkedinVariant.body = `[Regenerated with note: "${feedback}"]\n\n${linkedinVariant.body}`;
        linkedinVariant.version += 1;
        const content = dbStore.contentItems.find((c) => c.id === apr.contentId);
        if (content) {
          content.variants.linkedin = { ...linkedinVariant };
        }
      }
      return { status: 200, headers: corsHeaders, body: apr };
    }

    // ---------------------------------------------------------------------------
    // 5. Calendar Posts, Agents, Workflows, Providers, Models, Channels, Analytics, Brand Kit, Tokens, System
    // ---------------------------------------------------------------------------
    if (method === "GET" && path === "/v1/posts") {
      const denied = assertScope("read");
      if (denied) return denied;
      return { status: 200, headers: corsHeaders, body: dbStore.posts };
    }

    const postScheduleMatch = path.match(/^\/v1\/posts\/([^/]+)\/schedule$/);
    if (method === "PATCH" && postScheduleMatch) {
      const denied = assertScope("write");
      if (denied) return denied;
      const post = dbStore.posts.find((p) => p.id === postScheduleMatch[1]);
      if (!post) return { status: 404, headers: corsHeaders, body: { error: "Post not found" } };
      post.dayOfMonth = Number(jsonBody.dayOfMonth ?? post.dayOfMonth);
      post.hour = Number(jsonBody.hour ?? post.hour);
      post.scheduledAt = `2026-11-${post.dayOfMonth} ${post.hour}:30 IST`;
      post.status = "scheduled";
      post.conflictWarning = undefined;
      return { status: 200, headers: corsHeaders, body: post };
    }

    if (method === "GET" && path === "/v1/agents") {
      const denied = assertScope("read");
      if (denied) return denied;
      return { status: 200, headers: corsHeaders, body: dbStore.agents };
    }

    const agentRunMatch = path.match(/^\/v1\/agents\/([^/]+)\/run$/);
    if (method === "POST" && agentRunMatch) {
      const denied = assertScope("write");
      if (denied) return denied;
      const ag = dbStore.agents.find((a) => a.id === agentRunMatch[1]);
      if (!ag) return { status: 404, headers: corsHeaders, body: { error: "Agent not found" } };
      const completion = await llmGateway.complete({
        runId: "run_playground",
        agentId: ag.id,
        primaryModelId: ag.primaryModelId,
        fallbackModelId: ag.fallbackModelId,
        systemPrompt: ag.systemPrompt,
        userPrompt: String(jsonBody.sampleInput ?? "Zero-Copy IPC Between Rust Worker Threads and Node.js N-API"),
        temperature: ag.temperature,
      });
      return { status: 200, headers: corsHeaders, body: completion };
    }

    const agentUpdateMatch = path.match(/^\/v1\/agents\/([^/]+)$/);
    if (method === "PATCH" && agentUpdateMatch) {
      const denied = assertScope("write");
      if (denied) return denied;
      const ag = dbStore.agents.find((a) => a.id === agentUpdateMatch[1]);
      if (!ag) return { status: 404, headers: corsHeaders, body: { error: "Agent not found" } };
      if (typeof jsonBody.systemPrompt === "string" && jsonBody.systemPrompt !== ag.systemPrompt) {
        ag.systemPrompt = jsonBody.systemPrompt;
        ag.versions.unshift({
          version: `v${ag.versions.length + 4}.0 (Active)`,
          createdAt: "Just now",
          author: actor,
          note: typeof jsonBody.note === "string" ? jsonBody.note : "Updated via REST API",
          systemPrompt: jsonBody.systemPrompt,
        });
      }
      if (typeof jsonBody.primaryModelId === "string") ag.primaryModelId = jsonBody.primaryModelId;
      if (typeof jsonBody.fallbackModelId === "string") ag.fallbackModelId = jsonBody.fallbackModelId;
      if (typeof jsonBody.temperature === "number") ag.temperature = jsonBody.temperature;
      if (typeof jsonBody.outputSchema === "string") ag.outputSchema = jsonBody.outputSchema;
      return { status: 200, headers: corsHeaders, body: ag };
    }

    if (method === "GET" && (path === "/v1/workflows/default" || path === "/v1/workflow")) {
      const denied = assertScope("read");
      if (denied) return denied;
      return { status: 200, headers: corsHeaders, body: dbStore.workflow };
    }

    if (method === "GET" && path === "/v1/providers") {
      const denied = assertScope("read");
      if (denied) return denied;
      return { status: 200, headers: corsHeaders, body: dbStore.providers };
    }

    const providerKeyMatch = path.match(/^\/v1\/providers\/([^/]+)\/keys$/);
    if (method === "POST" && providerKeyMatch) {
      const denied = assertScope("admin");
      if (denied) return denied;
      const providerId = ProviderIdSchema.parse(providerKeyMatch[1]);
      const updated = dbStore.addOrRotateProviderKey(
        providerId,
        String(jsonBody.rawKey ?? ""),
        jsonBody.baseUrl ? String(jsonBody.baseUrl) : undefined
      );
      return { status: 200, headers: corsHeaders, body: updated };
    }

    const providerTestMatch = path.match(/^\/v1\/providers\/([^/]+)\/test$/);
    if (method === "POST" && providerTestMatch) {
      const denied = assertScope("read");
      if (denied) return denied;
      const providerId = ProviderIdSchema.parse(providerTestMatch[1]);
      const result = await llmGateway.testConnection(providerId);
      return { status: 200, headers: corsHeaders, body: result };
    }

    if (method === "PUT" && path === "/v1/providers/fallback-order") {
      const denied = assertScope("admin");
      if (denied) return denied;
      const orderedIds = (jsonBody.orderedIds as string[]).map((x) => ProviderIdSchema.parse(x));
      orderedIds.forEach((id, idx) => {
        const p = dbStore.providers.find((prv) => prv.id === id);
        if (p) p.fallbackOrder = idx + 1;
      });
      return {
        status: 200,
        headers: corsHeaders,
        body: [...dbStore.providers].sort((a, b) => a.fallbackOrder - b.fallbackOrder),
      };
    }

    if (method === "GET" && path === "/v1/models") {
      const denied = assertScope("read");
      if (denied) return denied;
      return { status: 200, headers: corsHeaders, body: dbStore.models };
    }

    if (method === "GET" && path === "/v1/channels") {
      const denied = assertScope("read");
      if (denied) return denied;
      return { status: 200, headers: corsHeaders, body: dbStore.channels };
    }

    const channelToggleMatch = path.match(/^\/v1\/channels\/([^/]+)\/toggle$/);
    if (method === "POST" && channelToggleMatch) {
      const denied = assertScope("write");
      if (denied) return denied;
      const chId = PlatformIdSchema.parse(channelToggleMatch[1]);
      const ch = dbStore.channels.find((c) => c.id === chId)!;
      ch.connected = !ch.connected;
      return { status: 200, headers: corsHeaders, body: ch };
    }

    const channelUpdateMatch = path.match(/^\/v1\/channels\/([^/]+)$/);
    if (method === "PATCH" && channelUpdateMatch) {
      const denied = assertScope("write");
      if (denied) return denied;
      const chId = PlatformIdSchema.parse(channelUpdateMatch[1]);
      const ch = dbStore.channels.find((c) => c.id === chId);
      if (!ch) return { status: 404, headers: corsHeaders, body: { error: "Channel not found" } };
      if (typeof jsonBody.autonomyMode === "string") {
        ch.autonomyMode = AutonomyModeSchema.parse(jsonBody.autonomyMode);
      }
      if (jsonBody.refreshToken === true) {
        ch.tokenHealth = "healthy";
        ch.tokenExpiresInDays = 60;
      }
      return { status: 200, headers: corsHeaders, body: ch };
    }

    if (method === "GET" && path === "/v1/analytics") {
      const denied = assertScope("read");
      if (denied) return denied;
      return { status: 200, headers: corsHeaders, body: dbStore.analytics };
    }

    if (method === "GET" && path === "/v1/usage") {
      const denied = assertScope("read");
      if (denied) return denied;
      return { status: 200, headers: corsHeaders, body: dbStore.usageHistory };
    }

    if (method === "GET" && path === "/v1/brand-kit") {
      const denied = assertScope("read");
      if (denied) return denied;
      return { status: 200, headers: corsHeaders, body: dbStore.brandKit };
    }

    if (method === "PATCH" && path === "/v1/brand-kit") {
      const denied = assertScope("write");
      if (denied) return denied;
      dbStore.brandKit = { ...dbStore.brandKit, ...(jsonBody as Partial<typeof dbStore.brandKit>) };
      return { status: 200, headers: corsHeaders, body: dbStore.brandKit };
    }

    if (method === "GET" && path === "/v1/tokens") {
      const denied = assertScope("read");
      if (denied) return denied;
      const safeTokens = dbStore.apiTokens
        .filter((t) => !t.revoked)
        .map(({ tokenHash: _h, revoked: _r, ...rest }) => rest);
      return { status: 200, headers: corsHeaders, body: safeTokens };
    }

    if (method === "POST" && path === "/v1/tokens") {
      const denied = assertScope("admin");
      if (denied) return denied;
      const scopes = ((jsonBody.scopes as string[]) ?? ["read"]).map((s) => TokenScopeSchema.parse(s));
      const minted = dbStore.createScopedApiToken(
        String(jsonBody.name ?? "MCP Token"),
        scopes,
        String(jsonBody.expiresAt ?? "2027-06-01")
      );
      return { status: 201, headers: corsHeaders, body: minted };
    }

    const tokenDeleteMatch = path.match(/^\/v1\/tokens\/([^/]+)$/);
    if (method === "DELETE" && tokenDeleteMatch) {
      const denied = assertScope("admin");
      if (denied) return denied;
      const ok = dbStore.revokeApiToken(tokenDeleteMatch[1]!);
      if (!ok) return { status: 404, headers: corsHeaders, body: { error: "Token not found" } };
      const safeTokens = dbStore.apiTokens
        .filter((t) => !t.revoked)
        .map(({ tokenHash: _h, revoked: _r, ...rest }) => rest);
      return { status: 200, headers: corsHeaders, body: safeTokens };
    }

    if (method === "GET" && path === "/v1/audit") {
      const denied = assertScope("read");
      if (denied) return denied;
      const categoryFilter = parsedUrl.searchParams.get("category");
      const limitParam = Number(parsedUrl.searchParams.get("limit") ?? 50);
      let events = dbStore.auditEvents;
      if (categoryFilter && categoryFilter !== "all") {
        events = events.filter((e) => e.category === categoryFilter);
      }
      return { status: 200, headers: corsHeaders, body: events.slice(0, Math.max(1, limitParam)) };
    }

    if (method === "GET" && path === "/v1/system/health") {
      const denied = assertScope("read");
      if (denied) return denied;
      return {
        status: 200,
        headers: corsHeaders,
        body: { services: dbStore.systemServices, dlq: dbStore.dlqJobs },
      };
    }

    if (method === "POST" && path === "/v1/system/dlq/retry-all") {
      const denied = assertScope("admin");
      if (denied) return denied;
      dbStore.dlqJobs = [];
      return { status: 200, headers: corsHeaders, body: dbStore.dlqJobs };
    }

    const dlqRetryMatch = path.match(/^\/v1\/system\/dlq\/([^/]+)\/retry$/);
    if (method === "POST" && dlqRetryMatch) {
      const denied = assertScope("admin");
      if (denied) return denied;
      dbStore.dlqJobs = dbStore.dlqJobs.filter((j) => j.id !== dlqRetryMatch[1]);
      return { status: 200, headers: corsHeaders, body: dbStore.dlqJobs };
    }

    // ---------------------------------------------------------------------------
    // 6. Streamable HTTP MCP Endpoint (/mcp)
    // ---------------------------------------------------------------------------
    if (path === "/mcp" || path === "/v1/mcp" || path === "/v1/mcp/sse") {
      if (method === "GET") {
        return {
          status: 200,
          headers: corsHeaders,
          body: {
            server: "dev-house-mcp",
            version: "2.4.1",
            transport: "streamable-http",
            tools: MCP_TOOLS_CATALOG,
            resources: MCP_RESOURCES_CATALOG,
          },
        };
      }

      if (method === "POST") {
        const rpcMethod = String(jsonBody.method ?? "");
        const rpcId = jsonBody.id ?? 1;
        const rpcParams = (jsonBody.params as Record<string, unknown>) ?? {};

        if (rpcMethod === "initialize") {
          return {
            status: 200,
            headers: corsHeaders,
            body: {
              jsonrpc: "2.0",
              id: rpcId,
              result: {
                protocolVersion: "2024-11-05",
                capabilities: { tools: {}, resources: {} },
                serverInfo: { name: "dev-house-mcp", version: "2.4.1" },
              },
            },
          };
        }

        if (rpcMethod === "tools/list") {
          return {
            status: 200,
            headers: corsHeaders,
            body: { jsonrpc: "2.0", id: rpcId, result: { tools: MCP_TOOLS_CATALOG } },
          };
        }

        if (rpcMethod === "resources/list") {
          return {
            status: 200,
            headers: corsHeaders,
            body: { jsonrpc: "2.0", id: rpcId, result: { resources: MCP_RESOURCES_CATALOG } },
          };
        }

        if (rpcMethod === "resources/read") {
          const res = mcpServer.readResource(String(rpcParams.uri ?? ""));
          return {
            status: 200,
            headers: corsHeaders,
            body: { jsonrpc: "2.0", id: rpcId, result: res },
          };
        }

        if (rpcMethod === "tools/call") {
          try {
            const out = await mcpServer.invokeTool({
              toolName: String(rpcParams.name ?? ""),
              args: (rpcParams.arguments as Record<string, unknown>) ?? {},
              grantedScopes,
              actor,
            });
            return {
              status: 200,
              headers: corsHeaders,
              body: { jsonrpc: "2.0", id: rpcId, result: out },
            };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return {
              status: msg.includes("ForbiddenScopeError") ? 403 : 400,
              headers: corsHeaders,
              body: {
                jsonrpc: "2.0",
                id: rpcId,
                error: { code: -32001, message: msg },
              },
            };
          }
        }

        return {
          status: 400,
          headers: corsHeaders,
          body: {
            jsonrpc: "2.0",
            id: rpcId,
            error: { code: -32601, message: `Unknown JSON-RPC method: ${rpcMethod}` },
          },
        };
      }
    }

    return { status: 404, headers: corsHeaders, body: { error: `Route not found: ${method} ${path}` } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status =
      message.includes("ForbiddenScopeError") || message.includes("KillSwitchActiveError")
        ? 403
        : message.includes("not found") || message.includes("Not found")
        ? 404
        : 400;
    return { status, headers: corsHeaders, body: { error: message } };
  }
}

/**
 * Starts the HTTP + SSE server (supports GET /api/v1/events/stream for Live Map SSE).
 */
export function createDevHouseHttpServer(): http.Server {
  return http.createServer(async (req, res) => {
    const reqUrl = req.url ?? "/";
    const method = req.method ?? "GET";

    // SSE Live Event Bus Endpoint
    if (method === "GET" && (reqUrl.startsWith("/api/v1/events/stream") || reqUrl.startsWith("/v1/events/stream"))) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });

      // Emit initial backlog snapshot (both named event and default message for EventSource.onmessage)
      for (const ev of globalEventBus.getRecentEvents(6).reverse()) {
        const payload = JSON.stringify(ev);
        res.write(`data: ${payload}\n\n`);
      }

      const unsubscribe = globalEventBus.subscribe((ev) => {
        const payload = JSON.stringify(ev);
        res.write(`data: ${payload}\n\n`);
      });

      req.on("close", () => {
        unsubscribe();
      });
      return;
    }

    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", async () => {
      try {
        const bodyText = Buffer.concat(chunks).toString("utf8");
        const response = await handleApiRequest(method, reqUrl, req.headers, bodyText);
        res.writeHead(response.status, {
          "Content-Type": "application/json; charset=utf-8",
          ...(response.headers ?? {}),
        });
        res.end(response.body !== null ? JSON.stringify(response.body) : "");
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      }
    });
  });
}
