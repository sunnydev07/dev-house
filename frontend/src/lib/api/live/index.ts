import type { DevHouseApiClient } from "../client";
import type { Run } from "../types";

const BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1").replace(/\/+$/, "");

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Dev House API Error [${res.status}] on ${path}${errText ? `: ${errText}` : ""}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Complete 25-method live REST client bound to NEXT_PUBLIC_API_URL (`/api/v1/*`).
 */
export const liveApiClient: DevHouseApiClient = {
  getWorkspace: () => apiFetch("/workspace"),

  setAutonomyMode: (mode) =>
    apiFetch("/workspace/autonomy", {
      method: "PATCH",
      body: JSON.stringify({ mode }),
    }),

  togglePublishingKillSwitch: (paused) =>
    apiFetch("/workspace/kill-switch", {
      method: "POST",
      body: JSON.stringify({ paused }),
    }),

  getContentItems: () => apiFetch("/content"),

  ingestVideo: (payload) =>
    apiFetch("/ingest", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getRuns: () => apiFetch("/runs"),

  getRunById: async (id) => {
    try {
      return await apiFetch<Run>(`/runs/${encodeURIComponent(id)}`);
    } catch {
      return undefined;
    }
  },

  retryRunStep: (runId, stepId) =>
    apiFetch(`/runs/${encodeURIComponent(runId)}/steps/${encodeURIComponent(stepId)}/retry`, {
      method: "POST",
      body: JSON.stringify({}),
    }),

  getApprovals: () => apiFetch("/approvals"),

  decideApproval: (id, decision, feedback) =>
    apiFetch(`/approvals/${encodeURIComponent(id)}/decide`, {
      method: "POST",
      body: JSON.stringify({ decision, feedback }),
    }),

  updateVariantCopy: (contentId, platform, body) =>
    apiFetch(`/content/${encodeURIComponent(contentId)}/variants/${encodeURIComponent(platform)}`, {
      method: "PATCH",
      body: JSON.stringify({ body }),
    }),

  getPosts: () => apiFetch("/posts"),

  reschedulePost: (postId, dayOfMonth, hour) =>
    apiFetch(`/posts/${encodeURIComponent(postId)}/schedule`, {
      method: "PATCH",
      body: JSON.stringify({ dayOfMonth, hour }),
    }),

  getAgents: () => apiFetch("/agents"),

  updateAgent: (agentId, patch) =>
    apiFetch(`/agents/${encodeURIComponent(agentId)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  getWorkflow: () => apiFetch("/workflows/default"),

  getProviders: () => apiFetch("/providers"),

  addProviderKey: (providerId, rawKey, baseUrl) =>
    apiFetch(`/providers/${encodeURIComponent(providerId)}/keys`, {
      method: "POST",
      body: JSON.stringify({ rawKey, baseUrl }),
    }),

  reorderProviderFallback: (orderedIds) =>
    apiFetch("/providers/fallback-order", {
      method: "PUT",
      body: JSON.stringify({ orderedIds }),
    }),

  getModels: () => apiFetch("/models"),

  getChannels: () => apiFetch("/channels"),

  toggleChannelConnection: (channelId) =>
    apiFetch(`/channels/${encodeURIComponent(channelId)}/toggle`, {
      method: "POST",
      body: JSON.stringify({}),
    }),

  getAnalytics: () => apiFetch("/analytics"),

  getUsageHistory: () => apiFetch("/usage"),

  getBrandKit: () => apiFetch("/brand-kit"),

  updateBrandKit: (patch) =>
    apiFetch("/brand-kit", {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  getApiTokens: () => apiFetch("/tokens"),

  createApiToken: (name, scopes, expiresAt) =>
    apiFetch("/tokens", {
      method: "POST",
      body: JSON.stringify({ name, scopes, expiresAt }),
    }),

  getAuditEvents: () => apiFetch("/audit"),

  getSystemHealth: () => apiFetch("/system/health"),

  retryDlqJob: (jobId) =>
    apiFetch(`/system/dlq/${encodeURIComponent(jobId)}/retry`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
};
