import { z } from "zod";
import {
  globalEventBus,
  outboundNotifier,
  isolateUntrustedContent,
  type Run,
  type RunStep,
  type ContentItem,
  type Approval,
} from "@devhouse/core";
import { dbStore } from "@devhouse/db";
import { llmGateway } from "@devhouse/providers";
import { socialConnectors } from "@devhouse/connectors";

const BrandReviewSchema = z.object({
  passed: z.boolean(),
  score: z.number(),
  violations: z.array(z.string()),
  suggestedEdits: z.string(),
});

export class AgentDagOrchestrator {
  /**
   * Starts or resumes a durable DAG run for a ContentItem.
   * Survives worker crashes mid-run: any step already marked `completed` is skipped on recovery.
   */
  async executeOrResumeRun(
    runId: string,
    options: { simulateGemini429?: boolean; stopAfterStepIndex?: number } = {}
  ): Promise<Run> {
    const run = dbStore.runs.find((r) => r.id === runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    const content = dbStore.contentItems.find((c) => c.id === run.contentId);
    if (!content) {
      throw new Error(`ContentItem not found: ${run.contentId}`);
    }

    run.status = "running";

    // Define canonical 6-step DAG pipeline (Video Analyst -> Director -> 3 Parallel Writers -> Brand Reviewer)
    const dagPlan: {
      stepId: string;
      agentId: string;
      criticalPath: boolean;
      offsetSec: number;
    }[] = [
      { stepId: `${run.id}_stp_1`, agentId: "agt_video_analyst", criticalPath: true, offsetSec: 0 },
      { stepId: `${run.id}_stp_2`, agentId: "agt_director", criticalPath: true, offsetSec: 4.2 },
      { stepId: `${run.id}_stp_3`, agentId: "agt_linkedin_writer", criticalPath: true, offsetSec: 8.0 },
      { stepId: `${run.id}_stp_4`, agentId: "agt_instagram_writer", criticalPath: false, offsetSec: 8.0 },
      { stepId: `${run.id}_stp_5`, agentId: "agt_youtube_writer", criticalPath: true, offsetSec: 8.0 },
      { stepId: `${run.id}_stp_6`, agentId: "agt_brand_reviewer", criticalPath: true, offsetSec: 16.5 },
    ];

    // Ensure steps exist on Run record (preserving completed steps on crash-resume)
    for (const spec of dagPlan) {
      const existingStep = run.steps.find((s) => s.id === spec.stepId || s.agentId === spec.agentId);
      if (!existingStep) {
        const ag = dbStore.agents.find((a) => a.id === spec.agentId)!;
        const mod = dbStore.models.find((m) => m.id === ag.primaryModelId) ?? dbStore.models[0]!;
        run.steps.push({
          id: spec.stepId,
          agentId: ag.id,
          agentName: ag.name,
          agentMonogram: ag.monogram,
          modelUsed: mod.id,
          providerId: mod.providerId,
          status: "queued",
          startedAt: new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour12: false }),
          durationSec: 0,
          tokensIn: 0,
          tokensOut: 0,
          costUsd: 0,
          toolCalls: [...ag.tools],
          streamedOutput: "",
          inputJson: { contentId: content.id, title: content.title },
          outputJson: {},
          criticalPath: spec.criticalPath,
          startOffsetSec: spec.offsetSec,
        });
      }
    }

    // Sanitize untrusted transcript before passing to any LLM agent
    const rawTranscriptText = content.transcript.map((t) => `[${t.timestamp}] ${t.text}`).join("\n");
    const safeTranscriptEnvelope = isolateUntrustedContent(rawTranscriptText, "UNTRUSTED_TRANSCRIPT");

    let brandScore = 96;
    let brandPassed = true;

    for (let i = 0; i < run.steps.length; i++) {
      const step = run.steps[i]!;
      if (step.status === "completed") {
        // Crash recovery: skip already completed steps, but read brand reviewer score if present
        if (step.agentId === "agt_brand_reviewer" && typeof step.outputJson.score === "number") {
          brandScore = Number(step.outputJson.score);
          brandPassed = step.outputJson.passed !== false;
        }
        continue;
      }

      if (options.stopAfterStepIndex !== undefined && i > options.stopAfterStepIndex) {
        // Simulated mid-run worker kill point for testing crash-resume durability
        return run;
      }

      const stepOut = await this.executeSingleStep(
        run,
        content,
        step,
        safeTranscriptEnvelope,
        options.simulateGemini429
      );

      if (step.agentId === "agt_brand_reviewer") {
        if (typeof stepOut.score === "number") brandScore = Number(stepOut.score);
        if (typeof stepOut.passed === "boolean") brandPassed = stepOut.passed;
      }
    }

    run.activeAgentId = undefined;

    // Check workspace autonomy mode AND Brand Reviewer guardrail at the Human Approval Gate
    const canAutoPublish =
      dbStore.workspace.autonomyMode === "auto" &&
      !dbStore.workspace.publishingPaused &&
      brandPassed &&
      brandScore >= 88;

    if (canAutoPublish) {
      for (const platform of content.platforms) {
        const variant = content.variants[platform];
        if (variant) {
          await socialConnectors.publishVariantIdempotent({
            runId: run.id,
            contentId: content.id,
            platform,
            variant,
          });
          variant.status = "published";
        }
      }
      content.status = "published";
      run.status = "completed";
    } else {
      content.status = "awaiting_approval";
      run.status = "awaiting_approval";

      for (const platform of content.platforms) {
        if (content.variants[platform]) {
          content.variants[platform].status = "awaiting_approval";
          content.variants[platform].score = brandScore;
        }
      }

      // Stage or update approval record
      const existingApproval = dbStore.approvals.find((a) => a.runId === run.id);
      if (existingApproval) {
        existingApproval.brandComplianceScore = brandScore;
        existingApproval.variants = content.variants;
      } else {
        const newApproval: Approval = {
          id: `apr_${String(dbStore.approvals.length + 1).padStart(2, "0")}`,
          contentId: content.id,
          contentTitle: content.title,
          runId: run.id,
          submittedAt: "Just now",
          authorAgent: `Director + 3 Writers (Brand Gate ${brandScore}/100)`,
          brandComplianceScore: brandScore,
          status: "pending",
          variants: content.variants,
        };
        dbStore.approvals.unshift(newApproval);
        void outboundNotifier.notifyApprovalStaged(newApproval);
      }

      globalEventBus.emitEvent({
        type: "run.status",
        runId: run.id,
        nodeId: "gate_approval",
        edgeId: "e_br_gate",
        status: "waiting",
        summary: `Run ${run.id} reached Human Approval Gate (${dbStore.workspace.autonomyMode})`,
      });
    }

    return run;
  }

  private async executeSingleStep(
    run: Run,
    content: ContentItem,
    step: RunStep,
    safeTranscriptEnvelope: string,
    simulateGemini429?: boolean
  ): Promise<Record<string, unknown>> {
    const agent = dbStore.agents.find((a) => a.id === step.agentId)!;
    step.status = "running";
    run.activeAgentId = agent.id;

    globalEventBus.emitEvent({
      type: "node.status",
      runId: run.id,
      nodeId: agent.id,
      agentId: agent.id,
      status: "running",
      summary: `${agent.name} executing on ${content.title}`,
    });

    for (const toolName of agent.tools.slice(0, 2)) {
      globalEventBus.emitEvent({
        type: "tool.call",
        runId: run.id,
        nodeId: agent.id,
        agentId: agent.id,
        status: "running",
        summary: `${agent.name} invoked tool ${toolName}()`,
      });
    }

    const isBackupTestTarget = simulateGemini429 && agent.id === "agt_linkedin_writer";
    const completion = await llmGateway.complete({
      runId: run.id,
      agentId: agent.id,
      primaryModelId: agent.primaryModelId,
      fallbackModelId: agent.fallbackModelId,
      systemPrompt: agent.systemPrompt,
      userPrompt: `Title: ${content.title}\n${safeTranscriptEnvelope}`,
      temperature: agent.temperature,
      responseSchema: agent.id === "agt_brand_reviewer" ? BrandReviewSchema : undefined,
      tools: agent.tools,
      simulatePrimary429: isBackupTestTarget,
    });

    const parsedOut = JSON.parse(completion.text) as Record<string, unknown>;

    step.modelUsed = completion.fallbackUsed ? `${completion.modelId} (Fallback)` : completion.modelId;
    step.providerId = completion.providerId;
    step.tokensIn = completion.tokensIn;
    step.tokensOut = completion.tokensOut;
    step.costUsd = completion.costUsd;
    step.durationSec = +(completion.latencyMs / 100).toFixed(1);
    step.streamedOutput = completion.text;
    step.outputJson = parsedOut;
    step.status = "completed";

    // Propagate writer outputs into ContentItem variants
    if (agent.id === "agt_linkedin_writer") {
      const v = content.variants.linkedin;
      if (v) {
        v.previousBody = v.body;
        if (typeof parsedOut.headline === "string") v.title = parsedOut.headline;
        if (typeof parsedOut.body === "string") v.body = parsedOut.body;
        if (typeof parsedOut.cta === "string") v.cta = parsedOut.cta;
        if (Array.isArray(parsedOut.hashtags)) v.hashtags = parsedOut.hashtags.map(String);
      }
    } else if (agent.id === "agt_instagram_writer") {
      const v = content.variants.instagram;
      if (v) {
        v.previousBody = v.body;
        if (typeof parsedOut.frameHook === "string") v.title = parsedOut.frameHook.slice(0, 55);
        if (typeof parsedOut.caption === "string") {
          v.body = `Frame [00:00]: "${v.title}"\n\n${parsedOut.caption}`;
        }
        if (Array.isArray(parsedOut.hashtags)) v.hashtags = parsedOut.hashtags.map(String);
      }
    } else if (agent.id === "agt_youtube_writer") {
      const v = content.variants.youtube;
      if (v) {
        v.previousBody = v.body;
        if (typeof parsedOut.title === "string") v.title = parsedOut.title.slice(0, 62);
        if (typeof parsedOut.description === "string") v.body = parsedOut.description;
        if (Array.isArray(parsedOut.chapters)) {
          v.chapters = parsedOut.chapters as { time: string; title: string }[];
        }
        if (Array.isArray(parsedOut.tags)) v.hashtags = parsedOut.tags.map(String);
      }
    }

    run.totalTokens += completion.tokensIn + completion.tokensOut;
    run.totalCostUsd = +(run.totalCostUsd + completion.costUsd).toFixed(4);
    run.durationSec = +(run.durationSec + step.durationSec).toFixed(1);
    content.costUsd = run.totalCostUsd;

    globalEventBus.emitEvent({
      type: "agent.token",
      runId: run.id,
      nodeId: agent.id,
      agentId: agent.id,
      deltaTokens: completion.tokensIn + completion.tokensOut,
      deltaCostUsd: completion.costUsd,
      status: "idle",
      summary: `${agent.name} completed step (${completion.tokensOut} tok via ${completion.modelId})`,
    });

    return parsedOut;
  }

  /**
   * Resets all steps from `stepId` onward to `queued` and re-executes the DAG from that step.
   */
  async retryFromStep(runId: string, stepId: string): Promise<Run> {
    const run = dbStore.runs.find((r) => r.id === runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    const idx = run.steps.findIndex((s) => s.id === stepId);
    if (idx === -1) throw new Error(`Step ${stepId} not found on run ${runId}`);
    for (let i = idx; i < run.steps.length; i++) {
      run.steps[i]!.status = "queued";
    }
    return this.executeOrResumeRun(runId);
  }
}

export const agentDagOrchestrator = new AgentDagOrchestrator();
