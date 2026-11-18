import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type {
  AutonomyMode,
  PlatformId,
  Provider,
  ApiToken,
  ContentItem,
  Agent,
  BrandKit,
} from "@/lib/api/types";

export function useWorkspaceQuery() {
  return useQuery({
    queryKey: ["workspace"],
    queryFn: () => apiClient.getWorkspace(),
  });
}

export function useSetAutonomyMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mode: AutonomyMode) => apiClient.setAutonomyMode(mode),
    onSuccess: (data) => qc.setQueryData(["workspace"], data),
  });
}

export function useKillSwitchMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paused: boolean) => apiClient.togglePublishingKillSwitch(paused),
    onSuccess: (data) => qc.setQueryData(["workspace"], data),
  });
}

export function useContentItemsQuery() {
  return useQuery({
    queryKey: ["content"],
    queryFn: () => apiClient.getContentItems(),
  });
}

export function useIngestVideoMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { title: string; source: ContentItem["source"]; durationSec: number }) =>
      apiClient.ingestVideo(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["content"] });
      void qc.invalidateQueries({ queryKey: ["runs"] });
      void qc.invalidateQueries({ queryKey: ["approvals"] });
    },
  });
}

export function useRunsQuery() {
  return useQuery({
    queryKey: ["runs"],
    queryFn: () => apiClient.getRuns(),
  });
}

export function useRunByIdQuery(runId: string) {
  return useQuery({
    queryKey: ["runs", runId],
    queryFn: () => apiClient.getRunById(runId),
    enabled: Boolean(runId),
  });
}

export function useRetryRunStepMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { runId: string; stepId: string }) =>
      apiClient.retryRunStep(payload.runId, payload.stepId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["runs"] }),
  });
}

export function useApprovalsQuery() {
  return useQuery({
    queryKey: ["approvals"],
    queryFn: () => apiClient.getApprovals(),
  });
}

export function useDecideApprovalMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id: string; decision: "approved" | "rejected" | "scheduled"; feedback?: string }) =>
      apiClient.decideApproval(payload.id, payload.decision, payload.feedback),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["approvals"] });
      void qc.invalidateQueries({ queryKey: ["content"] });
      void qc.invalidateQueries({ queryKey: ["runs"] });
    },
  });
}

export function useUpdateVariantCopyMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { contentId: string; platform: PlatformId; body: string }) =>
      apiClient.updateVariantCopy(payload.contentId, payload.platform, payload.body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["content"] });
      void qc.invalidateQueries({ queryKey: ["approvals"] });
    },
  });
}

export function usePostsQuery() {
  return useQuery({
    queryKey: ["posts"],
    queryFn: () => apiClient.getPosts(),
  });
}

export function useReschedulePostMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { postId: string; dayOfMonth: number; hour: number }) =>
      apiClient.reschedulePost(payload.postId, payload.dayOfMonth, payload.hour),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["posts"] }),
  });
}

export function useAgentsQuery() {
  return useQuery({
    queryKey: ["agents"],
    queryFn: () => apiClient.getAgents(),
  });
}

export function useUpdateAgentMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { agentId: string; patch: Partial<Agent> }) =>
      apiClient.updateAgent(payload.agentId, payload.patch),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["agents"] }),
  });
}

export function useWorkflowQuery() {
  return useQuery({
    queryKey: ["workflow"],
    queryFn: () => apiClient.getWorkflow(),
  });
}

export function useProvidersQuery() {
  return useQuery({
    queryKey: ["providers"],
    queryFn: () => apiClient.getProviders(),
  });
}

export function useAddProviderKeyMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { providerId: Provider["id"]; rawKey: string; baseUrl?: string }) =>
      apiClient.addProviderKey(payload.providerId, payload.rawKey, payload.baseUrl),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["providers"] }),
  });
}

export function useReorderProviderFallbackMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds: Provider["id"][]) => apiClient.reorderProviderFallback(orderedIds),
    onSuccess: (data) => qc.setQueryData(["providers"], data),
  });
}

export function useModelsQuery() {
  return useQuery({
    queryKey: ["models"],
    queryFn: () => apiClient.getModels(),
  });
}

export function useChannelsQuery() {
  return useQuery({
    queryKey: ["channels"],
    queryFn: () => apiClient.getChannels(),
  });
}

export function useToggleChannelMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (channelId: PlatformId) => apiClient.toggleChannelConnection(channelId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["channels"] }),
  });
}

export function useAnalyticsQuery() {
  return useQuery({
    queryKey: ["analytics"],
    queryFn: () => apiClient.getAnalytics(),
  });
}

export function useUsageHistoryQuery() {
  return useQuery({
    queryKey: ["usage"],
    queryFn: () => apiClient.getUsageHistory(),
  });
}

export function useBrandKitQuery() {
  return useQuery({
    queryKey: ["brand-kit"],
    queryFn: () => apiClient.getBrandKit(),
  });
}

export function useUpdateBrandKitMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<BrandKit>) => apiClient.updateBrandKit(patch),
    onSuccess: (data) => qc.setQueryData(["brand-kit"], data),
  });
}

export function useApiTokensQuery() {
  return useQuery({
    queryKey: ["tokens"],
    queryFn: () => apiClient.getApiTokens(),
  });
}

export function useCreateMcpTokenMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name: string; scopes: ApiToken["scopes"]; expiresAt: string }) =>
      apiClient.createApiToken(payload.name, payload.scopes, payload.expiresAt),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["tokens"] }),
  });
}

export function useAuditEventsQuery() {
  return useQuery({
    queryKey: ["audit"],
    queryFn: () => apiClient.getAuditEvents(),
  });
}

export function useSystemHealthQuery() {
  return useQuery({
    queryKey: ["system-health"],
    queryFn: () => apiClient.getSystemHealth(),
  });
}

export function useRetryDlqJobMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => apiClient.retryDlqJob(jobId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["system-health"] }),
  });
}
