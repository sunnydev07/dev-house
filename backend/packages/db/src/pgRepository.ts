import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import type { ApiToken, AuditEvent, Provider, Workspace } from "@devhouse/core";
import * as schema from "./schema.js";
import { auditLogs, apiTokens, brandVectorMemory, providers, publishLedger } from "./schema.js";

export type DevHousePgDatabase = NodePgDatabase<typeof schema>;

export interface PgClient {
  pool: Pool;
  db: DevHousePgDatabase;
}

export interface PublishLedgerWriteRecord {
  idempotencyKey: string;
  contentId: string;
  platform: string;
  version: number;
  state: string;
  platformPostId: string;
  publishedUrl: string;
  updatedAt: string;
}

export interface BrandMemoryMatch {
  id: string;
  category: string;
  content: string;
  distance: number;
}

const DEFAULT_DATABASE_URL = "postgresql://devhouse:devhouse_secret_pw@localhost:5432/devhouse";

export function resolveDatabaseUrl(explicit?: string): string | null {
  const raw = (explicit ?? process.env.DATABASE_URL ?? "").trim();
  return raw.length > 0 ? raw : null;
}

/**
 * Creates a pg.Pool + Drizzle client. Returns null when no DATABASE_URL is configured so
 * unit tests and offline development keep using the in-memory DevHouseRepository.
 */
export function createPgClient(connectionString?: string): PgClient | null {
  const url = resolveDatabaseUrl(connectionString);
  if (!url) return null;
  const pool = new Pool({
    connectionString: url,
    max: 10,
    connectionTimeoutMillis: 3_000,
    idleTimeoutMillis: 30_000,
  });
  // Never let an idle backend connection crash the API process.
  pool.on("error", (err) => {
    if (process.env.DEBUG_DB_WRITE_THROUGH) {
      console.warn("[Dev House DB] idle pool error:", err.message);
    }
  });
  return { pool, db: drizzle(pool, { schema }) };
}

export async function connectPgClient(connectionString?: string): Promise<PgClient | null> {
  const client = createPgClient(connectionString);
  if (!client) return null;
  try {
    await client.pool.query("SELECT 1");
    return client;
  } catch {
    await client.pool.end().catch(() => undefined);
    return null;
  }
}

/**
 * Write-through bridge between the synchronous in-memory DevHouseRepository and PostgreSQL.
 *
 * Every mutation is queued onto a single promise chain so ordering is preserved, and every
 * failure is swallowed (logged only under DEBUG_DB_WRITE_THROUGH) so an unreachable database
 * can never break the in-memory API contract.
 */
export class PgWriteThroughBridge {
  private readonly connectionString: string | null;
  private client: PgClient | null = null;
  private ready: boolean | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(connectionString?: string) {
    this.connectionString = resolveDatabaseUrl(connectionString);
  }

  get configured(): boolean {
    return this.connectionString !== null;
  }

  get isReady(): boolean {
    return this.ready === true;
  }

  private async ensureClient(): Promise<DevHousePgDatabase | null> {
    if (!this.connectionString) return null;
    if (this.ready === false) return null;
    if (this.client) return this.client.db;

    try {
      const pool = new Pool({
        connectionString: this.connectionString,
        max: 4,
        connectionTimeoutMillis: 3_000,
        idleTimeoutMillis: 30_000,
      });
      pool.on("error", () => undefined);
      await pool.query("SELECT 1");
      this.client = { pool, db: drizzle(pool, { schema }) };
      this.ready = true;
      return this.client.db;
    } catch (err) {
      this.ready = false;
      if (process.env.DEBUG_DB_WRITE_THROUGH) {
        console.warn(
          "[Dev House DB] Write-through disabled (database unreachable):",
          err instanceof Error ? err.message : String(err)
        );
      }
      return null;
    }
  }

  private enqueue(label: string, task: (db: DevHousePgDatabase) => Promise<unknown>): Promise<void> {
    this.queue = this.queue.then(async () => {
      const db = await this.ensureClient();
      if (!db) return;
      try {
        await task(db);
      } catch (err) {
        if (process.env.DEBUG_DB_WRITE_THROUGH) {
          console.warn(
            `[Dev House DB] ${label} write failed:`,
            err instanceof Error ? err.message : String(err)
          );
        }
      }
    });
    return this.queue;
  }

  /** Durable audit-trail append (mirrors `dbStore.recordAudit`). */
  persistAuditLog(event: AuditEvent, workspaceId: string): Promise<void> {
    return this.enqueue("audit_logs", (db) =>
      db
        .insert(auditLogs)
        .values({
          id: event.id,
          workspaceId,
          timestamp: event.timestamp,
          actor: event.actor,
          category: event.category,
          action: event.action,
          target: event.target,
          latencyMs: event.latencyMs ?? null,
          status: event.status,
          meta: event.meta ?? null,
        })
        .onConflictDoNothing()
    );
  }

  /** Upserts a provider row plus its newest AES-256-GCM key envelope. */
  persistProvider(provider: Provider, encryptedKeyEnvelope: string, workspaceId: string): Promise<void> {
    return this.enqueue("providers", (db) =>
      db
        .insert(providers)
        .values({
          id: provider.id,
          workspaceId,
          name: provider.name,
          monogram: provider.monogram,
          status: provider.status,
          maskedKey: provider.maskedKey,
          encryptedKeyEnvelope,
          baseUrl: provider.baseUrl ?? null,
          latencyMs: provider.latencyMs,
          requestsToday: provider.requestsToday,
          spendTodayUsd: provider.spendTodayUsd,
          budgetLimitUsd: provider.budgetLimitUsd,
          fallbackOrder: provider.fallbackOrder,
        })
        .onConflictDoUpdate({
          target: providers.id,
          set: {
            status: provider.status,
            maskedKey: provider.maskedKey,
            encryptedKeyEnvelope,
            baseUrl: provider.baseUrl ?? null,
            fallbackOrder: provider.fallbackOrder,
          },
        })
    );
  }

  persistWorkspace(workspace: Workspace): Promise<void> {
    return this.enqueue("workspaces", (db) =>
      db
        .insert(schema.workspaces)
        .values({
          id: workspace.id,
          name: workspace.name,
          slug: workspace.slug,
          timezone: workspace.timezone,
          autonomyMode: workspace.autonomyMode,
          publishingPaused: workspace.publishingPaused,
          dailyBudgetUsd: workspace.dailyBudgetUsd,
          spentTodayUsd: workspace.spentTodayUsd,
        })
        .onConflictDoUpdate({
          target: schema.workspaces.id,
          set: {
            autonomyMode: workspace.autonomyMode,
            publishingPaused: workspace.publishingPaused,
            dailyBudgetUsd: workspace.dailyBudgetUsd,
            spentTodayUsd: workspace.spentTodayUsd,
            updatedAt: new Date(),
          },
        })
    );
  }

  persistApiToken(token: ApiToken & { tokenHash: string; revoked?: boolean }, workspaceId: string): Promise<void> {
    return this.enqueue("api_tokens", (db) =>
      db
        .insert(apiTokens)
        .values({
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
        })
        .onConflictDoNothing()
    );
  }

  persistApiTokenRevocation(tokenId: string): Promise<void> {
    return this.enqueue("api_tokens", (db) =>
      db.update(apiTokens).set({ revoked: true }).where(eq(apiTokens.id, tokenId))
    );
  }

  /** Idempotent ledger write from the publish state machine. */
  persistPublishLedger(record: PublishLedgerWriteRecord, workspaceId: string): Promise<void> {
    return this.enqueue("publish_ledger", (db) =>
      db
        .insert(publishLedger)
        .values({
          id: record.idempotencyKey,
          workspaceId,
          contentId: record.contentId,
          platform: record.platform,
          version: record.version,
          state: record.state,
          platformPostId: record.platformPostId || null,
          publishedUrl: record.publishedUrl || null,
          updatedAt: new Date(record.updatedAt),
        })
        .onConflictDoUpdate({
          target: publishLedger.id,
          set: {
            state: record.state,
            platformPostId: record.platformPostId || null,
            publishedUrl: record.publishedUrl || null,
            updatedAt: new Date(record.updatedAt),
          },
        })
    );
  }

  /** pgvector cosine-distance recall over the brand memory table. */
  async queryBrandMemoryVectors(embedding: number[], topK = 3): Promise<BrandMemoryMatch[]> {
    const db = await this.ensureClient();
    const pool = this.client?.pool;
    if (!db || !pool) return [];
    try {
      const result = await pool.query<{
        id: string;
        category: string;
        content: string;
        distance: string;
      }>(
        `SELECT id, category, content, embedding <=> $1::vector AS distance
           FROM brand_vector_memory
          ORDER BY embedding <=> $1::vector
          LIMIT $2`,
        [`[${embedding.join(",")}]`, Math.max(1, Math.min(topK, 50))]
      );
      return result.rows.map((row) => ({
        id: row.id,
        category: row.category,
        content: row.content,
        distance: Number(row.distance),
      }));
    } catch (err) {
      if (process.env.DEBUG_DB_WRITE_THROUGH) {
        console.warn(
          "[Dev House DB] vector recall failed:",
          err instanceof Error ? err.message : String(err)
        );
      }
      return [];
    }
  }

  async upsertBrandMemoryVector(params: {
    id: string;
    workspaceId: string;
    category: string;
    content: string;
    embedding: number[];
  }): Promise<void> {
    await this.enqueue("brand_vector_memory", (db) =>
      db
        .insert(brandVectorMemory)
        .values({
          id: params.id,
          workspaceId: params.workspaceId,
          category: params.category,
          content: params.content,
          embedding: params.embedding,
        })
        .onConflictDoNothing()
    );
  }

  /** Flushes the queued write chain (used by scripts and graceful shutdown). */
  async flush(): Promise<void> {
    await this.queue;
  }

  async close(): Promise<void> {
    await this.flush();
    const pool = this.client?.pool;
    this.client = null;
    this.ready = null;
    if (pool) await pool.end().catch(() => undefined);
  }
}

export const pgBridge = new PgWriteThroughBridge();
export { DEFAULT_DATABASE_URL };
