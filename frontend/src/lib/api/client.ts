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
  AutonomyMode,
  PlatformId,
} from "./types";
import { mockApiClient } from "./mock";
import { liveApiClient } from "./live";

export interface DevHouseApiClient {
  getWorkspace(): Promise<Workspace>;
  setAutonomyMode(mode: AutonomyMode): Promise<Workspace>;
  togglePublishingKillSwitch(paused: boolean): Promise<Workspace>;
  getContentItems(): Promise<ContentItem[]>;
  ingestVideo(payload: { title: string; source: ContentItem["source"]; durationSec: number }): Promise<ContentItem>;
  getRuns(): Promise<Run[]>;
  getRunById(id: string): Promise<Run | undefined>;
  retryRunStep(runId: string, stepId: string): Promise<Run>;
  getApprovals(): Promise<Approval[]>;
  decideApproval(id: string, decision: "approved" | "rejected" | "scheduled", feedback?: string): Promise<Approval>;
  updateVariantCopy(contentId: string, platform: PlatformId, body: string): Promise<ContentItem>;
  getPosts(): Promise<Post[]>;
  reschedulePost(postId: string, dayOfMonth: number, hour: number): Promise<Post>;
  getAgents(): Promise<Agent[]>;
  updateAgent(agentId: string, patch: Partial<Agent>): Promise<Agent>;
  getWorkflow(): Promise<Workflow>;
  getProviders(): Promise<Provider[]>;
  addProviderKey(providerId: Provider["id"], rawKey: string, baseUrl?: string): Promise<Provider>;
  reorderProviderFallback(orderedIds: Provider["id"][]): Promise<Provider[]>;
  getModels(): Promise<Model[]>;
  getChannels(): Promise<Channel[]>;
  toggleChannelConnection(channelId: PlatformId): Promise<Channel>;
  getAnalytics(): Promise<AnalyticsSnapshot>;
  getUsageHistory(): Promise<UsageRecord[]>;
  getBrandKit(): Promise<BrandKit>;
  updateBrandKit(patch: Partial<BrandKit>): Promise<BrandKit>;
  getApiTokens(): Promise<ApiToken[]>;
  createApiToken(name: string, scopes: ApiToken["scopes"], expiresAt: string): Promise<{ token: ApiToken; plainSecret: string }>;
  getAuditEvents(): Promise<AuditEvent[]>;
  getSystemHealth(): Promise<{ services: SystemService[]; dlq: DlqJob[] }>;
  retryDlqJob(jobId: string): Promise<DlqJob[]>;
}

const mode = process.env.NEXT_PUBLIC_API_MODE ?? "mock";
export const apiClient: DevHouseApiClient = mode === "live" ? liveApiClient : mockApiClient;
