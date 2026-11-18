import crypto from "node:crypto";
import { dbStore } from "./store.js";
import { runMigrations } from "./migrate.js";
import { connectPgClient, DEFAULT_DATABASE_URL } from "./pgRepository.js";
import {
  agents,
  apiTokens,
  contentItems,
  platformLimitsConfig,
  providers,
  runSteps,
  runs,
  workspaces,
} from "./schema.js";

export async function runSeed(): Promise<{
  workspace: string;
  contentCount: number;
  runsCount: number;
  agentsCount: number;
  providersCount: number;
  approvalsCount: number;
  postsCount: number;
  tokensCount: number;
  mode: "postgres" | "in-memory";
}> {
  const workspaceId = dbStore.workspace.id;

  const summary = {
    workspace: dbStore.workspace.name,
    contentCount: dbStore.contentItems.length,
    runsCount: dbStore.runs.length,
    agentsCount: dbStore.agents.length,
    providersCount: dbStore.providers.length,
    approvalsCount: dbStore.approvals.length,
    postsCount: dbStore.posts.length,
    tokensCount: dbStore.apiTokens.length,
  };

  const migration = await runMigrations();
  const client = await connectPgClient(process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL);

  if (!client) {
    console.log(
      "[Dev House DB Seed] PostgreSQL unavailable — in-memory DevHouseRepository remains the source of truth:",
      JSON.stringify(summary, null, 2)
    );
    return { ...summary, mode: "in-memory" };
  }

  const { db, pool } = client;
  try {
    // 1. Workspace
    await db
      .insert(workspaces)
      .values({
        id: dbStore.workspace.id,
        name: dbStore.workspace.name,
        slug: dbStore.workspace.slug,
        timezone: dbStore.workspace.timezone,
        autonomyMode: dbStore.workspace.autonomyMode,
        publishingPaused: dbStore.workspace.publishingPaused,
        dailyBudgetUsd: dbStore.workspace.dailyBudgetUsd,
        spentTodayUsd: dbStore.workspace.spentTodayUsd,
      })
      .onConflictDoNothing();

    // 2. Platform limits (config-driven, never hardcoded in the worker)
    await db
      .insert(platformLimitsConfig)
      .values(
        Object.values(dbStore.platformLimits).map((limit) => ({
          platform: limit.platform,
          maxTitleChars: limit.maxTitleChars,
          maxBodyChars: limit.maxBodyChars,
          maxHashtags: limit.maxHashtags,
          aspectRatio: limit.aspectRatio,
          maxDurationSec: limit.maxDurationSec,
          maxFileSizeMb: limit.maxFileSizeMb,
        }))
      )
      .onConflictDoNothing();

    // 3. BYOK providers with their encrypted AES-256-GCM key envelope
    await db
      .insert(providers)
      .values(dbStore.providers.map((provider) => ({
        id: provider.id,
        workspaceId,
        name: provider.name,
        monogram: provider.monogram,
        status: provider.status,
        maskedKey: provider.maskedKey,
        encryptedKeyEnvelope: dbStore.encryptedProviderKeys.get(provider.id)?.[0] ?? "",
        baseUrl: provider.baseUrl ?? null,
        latencyMs: provider.latencyMs,
        requestsToday: provider.requestsToday,
        spendTodayUsd: provider.spendTodayUsd,
        budgetLimitUsd: provider.budgetLimitUsd,
        fallbackOrder: provider.fallbackOrder,
      })))
      .onConflictDoNothing();

    // 4. The 13-agent crew
    await db
      .insert(agents)
      .values(dbStore.agents.map((agent) => ({
        id: agent.id,
        workspaceId,
        role: agent.role,
        name: agent.name,
        monogram: agent.monogram,
        description: agent.description,
        primaryModelId: agent.primaryModelId,
        fallbackModelId: agent.fallbackModelId,
        temperature: agent.temperature,
        successRate: agent.successRate,
        avgCostUsd: agent.avgCostUsd,
        avgDurationSec: agent.avgDurationSec,
        status: agent.status,
        currentTask: agent.currentTask,
        systemPrompt: agent.systemPrompt,
        outputSchema: agent.outputSchema,
        tools: agent.tools,
        guardrails: agent.guardrails,
        versions: agent.versions,
      })))
      .onConflictDoNothing();

    // 5. 30 content items (SHA-256 dedup hash mirrors the ingest pipeline)
    await db
      .insert(contentItems)
      .values(dbStore.contentItems.map((item) => ({
        id: item.id,
        workspaceId,
        sha256Hash: crypto.createHash("sha256").update(`${item.id}:${item.title}`).digest("hex"),
        title: item.title,
        source: item.source,
        durationSec: item.durationSec,
        durationFormatted: item.durationFormatted,
        status: item.status,
        platforms: item.platforms,
        createdAt: item.createdAt,
        scheduledFor: item.scheduledFor ?? null,
        runId: item.runId,
        costUsd: item.costUsd,
        transcript: item.transcript,
        variants: item.variants,
        metadata: item.metadata,
      })))
      .onConflictDoNothing();

    // 6. Runs + their steps
    await db
      .insert(runs)
      .values(dbStore.runs.map((run) => ({
        id: run.id,
        workspaceId,
        contentId: run.contentId,
        contentTitle: run.contentTitle,
        source: run.source,
        status: run.status,
        startedAt: run.startedAt,
        durationSec: run.durationSec,
        totalTokens: run.totalTokens,
        totalCostUsd: run.totalCostUsd,
        activeAgentId: run.activeAgentId ?? null,
      })))
      .onConflictDoNothing();

    await db
      .insert(runSteps)
      .values(
        dbStore.runs.flatMap((run) =>
          run.steps.map((step) => ({
          id: step.id,
          runId: run.id,
          agentId: step.agentId,
          agentName: step.agentName,
          agentMonogram: step.agentMonogram,
          modelUsed: step.modelUsed,
          providerId: step.providerId,
          status: step.status,
          startedAt: step.startedAt,
          durationSec: step.durationSec,
          tokensIn: step.tokensIn,
          tokensOut: step.tokensOut,
          costUsd: step.costUsd,
          toolCalls: step.toolCalls,
          streamedOutput: step.streamedOutput,
          inputJson: step.inputJson,
          outputJson: step.outputJson,
          criticalPath: step.criticalPath,
            startOffsetSec: step.startOffsetSec,
          }))
        )
      )
      .onConflictDoNothing();

    // 7. Pre-authorized MCP bearer tokens (hashed, never plaintext)
    await db
      .insert(apiTokens)
      .values(dbStore.apiTokens.map((token) => ({
        id: token.id,
        workspaceId,
        name: token.name,
        prefix: token.prefix,
        tokenHash: token.tokenHash,
        scopes: token.scopes,
        clientAgent: token.clientAgent,
        createdAt: token.createdAt,
        expiresAt: token.expiresAt,
        lastUsedAt: token.lastUsedAt,
        revoked: token.revoked ?? false,
      })))
      .onConflictDoNothing();

    console.log("[Dev House DB Seed] Upserted (ON CONFLICT DO NOTHING):", JSON.stringify(summary, null, 2));
    return { ...summary, mode: "postgres" };
  } catch (err) {
    console.warn(
      `[Dev House DB Seed] PostgreSQL seed failed, keeping in-memory fallback: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return { ...summary, mode: migration.mode };
  } finally {
    await pool.end().catch(() => undefined);
  }
}

const isMainEntry =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  Boolean(process.argv[1] && /seed\.(ts|js)$/.test(process.argv[1]));

if (isMainEntry) {
  void runSeed();
}
