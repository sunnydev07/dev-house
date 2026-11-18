import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { globalEventBus } from "@devhouse/core";
import { dbStore } from "@devhouse/db";
import { agentDagOrchestrator } from "@devhouse/agents";
import { mediaPipeline } from "@devhouse/media";
import { socialConnectors } from "@devhouse/connectors";

export const QUEUE_NAMES = [
  "ingest.media",
  "agent.dag",
  "publish.channel",
  "analytics.pull",
  "dlq.failed",
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

const MAX_ATTEMPTS = 3;
const SUPERVISOR_INTERVAL_MS = 15_000;

/**
 * Worker Crash-Recovery Supervisor:
 * Scans for any Run left in `status = 'running'` after an unexpected worker restart or SIGKILL
 * and resumes execution from the first incomplete RunStep without duplicating completed steps.
 */
export async function recoverInterruptedRuns(): Promise<string[]> {
  const recoveredIds: string[] = [];
  for (const run of dbStore.runs) {
    if (run.status === "running" && run.steps.some((s) => s.status !== "completed")) {
      await agentDagOrchestrator.executeOrResumeRun(run.id);
      recoveredIds.push(run.id);
    }
  }
  return recoveredIds;
}

/** Non-blocking Redis probe: returns null when REDIS_URL is unset or unreachable. */
export async function connectRedis(): Promise<IORedis | null> {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;
  const connection = new IORedis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
    retryStrategy: () => null,
    connectTimeout: 3_000,
  });
  connection.on("error", () => undefined);
  try {
    await connection.connect();
    await connection.ping();
    return connection;
  } catch {
    await connection.quit().catch(() => undefined);
    return null;
  }
}

function payloadSummary(data: unknown): string {
  try {
    return JSON.stringify(data).slice(0, 220);
  } catch {
    return "[unserializable payload]";
  }
}

type QueueProcessor = (job: Job) => Promise<unknown>;

function buildProcessors(): Record<Exclude<QueueName, "dlq.failed">, QueueProcessor> {
  return {
    "ingest.media": async (job) => {
      const data = job.data as {
        contentId: string;
        runId: string;
        title: string;
        durationSec?: number;
        sourceUrl?: string;
        filePath?: string;
      };
      globalEventBus.emitEvent({
        type: "node.status",
        runId: data.runId,
        nodeId: "med_ffmpeg",
        status: "running",
        summary: `BullMQ ingest.media started for ${data.contentId}`,
      });
      return mediaPipeline.processIngestedMedia(data.contentId, data.runId, {
        title: data.title,
        durationSec: data.durationSec,
        sourceUrl: data.sourceUrl,
        filePath: data.filePath,
      });
    },
    "agent.dag": async (job) => {
      const data = job.data as { runId: string; simulateGemini429?: boolean };
      return agentDagOrchestrator.executeOrResumeRun(data.runId, {
        simulateGemini429: Boolean(data.simulateGemini429),
      });
    },
    "publish.channel": async (job) => {
      const data = job.data as {
        runId: string;
        contentId: string;
        platform: "linkedin" | "instagram" | "youtube";
        version?: number;
      };
      const content = dbStore.contentItems.find((item) => item.id === data.contentId);
      const variant = content?.variants[data.platform];
      if (!variant) {
        throw new Error(`PublishJobError: variant ${data.platform} not found for ${data.contentId}`);
      }
      return socialConnectors.publishVariantIdempotent({
        runId: data.runId,
        contentId: data.contentId,
        platform: data.platform,
        variant,
      });
    },
    "analytics.pull": async () => dbStore.analytics,
  };
}

export interface WorkerRuntime {
  queues: Record<QueueName, Queue>;
  workers: Worker[];
  redis: IORedis;
  supervisor: ReturnType<typeof setInterval>;
  stop: () => Promise<void>;
}

let activeRuntime: WorkerRuntime | null = null;

/**
 * Boots the 4 BullMQ queues + workers when Redis is reachable, wires exhausted jobs
 * (attempts >= 3) into `dbStore.dlqJobs` (`dlq.failed`) and starts the 15s supervisor.
 */
export async function startBullMqWorkers(): Promise<WorkerRuntime | null> {
  const redis = await connectRedis();
  if (!redis) {
    console.warn(
      "[Dev House Worker] REDIS_URL unreachable — BullMQ queues disabled, continuing with in-process DAG execution."
    );
    return null;
  }

  const queues = Object.fromEntries(
    QUEUE_NAMES.map((name) => [
      name,
      new Queue(name, {
        connection: redis,
        defaultJobOptions: {
          attempts: MAX_ATTEMPTS,
          backoff: { type: "exponential", delay: 2_000 },
          removeOnComplete: 500,
          removeOnFail: 1_000,
        },
      }),
    ])
  ) as Record<QueueName, Queue>;

  const processors = buildProcessors();
  const workers: Worker[] = [];

  for (const name of QUEUE_NAMES) {
    if (name === "dlq.failed") continue;
    const worker = new Worker(name, processors[name], {
      connection: redis,
      concurrency: name === "ingest.media" ? 2 : 4,
    });

    worker.on("failed", (job, err) => {
      if (!job) return;
      if (job.attemptsMade < MAX_ATTEMPTS) return;

      const entry = {
        id: `dlq_${job.id}`,
        queue: name,
        payloadSummary: payloadSummary(job.data),
        errorReason: err.message,
        failedAt: new Date().toLocaleTimeString("en-GB", {
          timeZone: dbStore.workspace.timezone,
          hour12: false,
        }) + " IST",
        attempts: job.attemptsMade,
      };
      dbStore.dlqJobs.unshift(entry);
      dbStore.recordAudit({
        actor: "BullMQ Worker",
        category: "security",
        action: "queue.dlq.enqueue",
        target: `${name}#${job.id}`,
        status: "error",
        meta: err.message,
      });
      globalEventBus.emitEvent({
        type: "node.status",
        runId: String((job.data as { runId?: string }).runId ?? "run_worker"),
        nodeId: "core_redis",
        status: "failed",
        summary: `Job ${job.id} on ${name} exhausted ${MAX_ATTEMPTS} attempts → dlq.failed`,
      });
      void queues["dlq.failed"]
        .add("dead-letter", entry, { attempts: 1, removeOnComplete: false })
        .catch(() => undefined);
    });

    workers.push(worker);
  }

  const supervisor = setInterval(() => {
    void recoverInterruptedRuns().catch((err) => {
      console.warn(
        "[Dev House Worker] supervisor recovery failed:",
        err instanceof Error ? err.message : String(err)
      );
    });
  }, SUPERVISOR_INTERVAL_MS);

  activeRuntime = {
    queues,
    workers,
    redis,
    supervisor,
    stop: async () => {
      clearInterval(supervisor);
      await Promise.all(workers.map((worker) => worker.close().catch(() => undefined)));
      await Promise.all(Object.values(queues).map((queue) => queue.close().catch(() => undefined)));
      await redis.quit().catch(() => undefined);
      activeRuntime = null;
    },
  };

  console.log(
    `[Dev House Worker] BullMQ online: ${QUEUE_NAMES.filter((n) => n !== "dlq.failed").join(", ")} (DLQ: dlq.failed)`
  );
  return activeRuntime;
}

export async function stopWorkerRuntime(): Promise<void> {
  await activeRuntime?.stop();
}

const isMainEntry =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  Boolean(process.argv[1] && /worker\.(ts|js)$/.test(process.argv[1]));

if (isMainEntry) {
  console.log(
    "[Dev House Worker] Starting BullMQ queues (ingest.media, agent.dag, publish.channel, analytics.pull) + Crash-Recovery Supervisor..."
  );

  const runtime = await startBullMqWorkers();

  // Even without Redis, keep the 15s recovery supervisor alive.
  const supervisor =
    runtime?.supervisor ??
    setInterval(() => {
      void recoverInterruptedRuns().catch(() => undefined);
    }, SUPERVISOR_INTERVAL_MS);

  void recoverInterruptedRuns().then((ids) => {
    console.log(`[Dev House Worker] Recovered ${ids.length} interrupted run(s):`, ids);
  });

  const shutdown = async () => {
    clearInterval(supervisor);
    await stopWorkerRuntime();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());
}
