"use client";

import React, { useEffect, useMemo, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { Drawer } from "vaul";
import { toast } from "sonner";
import {
  ArrowRight,
  CalendarClock,
  Check,
  ChevronRight,
  Clock,
  DollarSign,
  FileVideo,
  Film,
  Inbox,
  Layers,
  ListChecks,
  Plus,
  RefreshCw,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import {
  useAgentsQuery,
  useApprovalsQuery,
  useContentItemsQuery,
  useDecideApprovalMutation,
  useIngestVideoMutation,
  usePostsQuery,
  useReschedulePostMutation,
  useRunByIdQuery,
  useUpdateVariantCopyMutation,
  useWorkspaceQuery,
} from "@/hooks/useConsoleQueries";
import type { AgentRole, Approval, ContentItem, PlatformId } from "@/lib/api/types";

const PLATFORM_LIMITS: Record<PlatformId, { title: number; body: number; label: string }> = {
  linkedin: { title: 140, body: 1600, label: "LinkedIn" },
  instagram: { title: 55, body: 2200, label: "Instagram Reels" },
  youtube: { title: 62, body: 5000, label: "YouTube" },
};

const DEPARTMENTS: { name: string; roles: AgentRole[] }[] = [
  { name: "01 · Intake & Analysis", roles: ["director", "video_analyst", "strategist"] },
  { name: "02 · Platform Writers", roles: ["linkedin_writer", "instagram_writer", "youtube_writer"] },
  { name: "03 · Quality & Gatekeeping", roles: ["seo_hashtag", "thumbnail_concept", "brand_reviewer"] },
  { name: "04 · Publishing & Growth", roles: ["scheduler", "publisher", "analyst", "engagement_assistant"] },
];

function CharMeter({ value, max }: { value: number; max: number }) {
  const over = value > max;
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 w-16 rounded-full bg-[var(--surface-hover)] overflow-hidden">
        <div
          className={`h-full rounded-full ${over ? "bg-[var(--danger)]" : "bg-[var(--accent)]"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={`font-mono text-[10px] ${over ? "text-[var(--danger)]" : "text-[var(--text-muted)]"}`}
      >
        {value.toLocaleString()} / {max.toLocaleString()}
      </span>
    </div>
  );
}

function KpiTile({
  label,
  value,
  detail,
  icon: Icon,
  progress,
  onClick,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  progress?: number;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 hover:border-[var(--border-strong)] transition-colors"
    >
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
        <Icon size={12} />
        {label}
      </div>
      <div className="mt-2.5 text-[22px] font-medium leading-none">{value}</div>
      <div className="mt-2 text-[11.5px] text-[var(--text-muted)]">{detail}</div>
      {progress !== undefined && (
        <div className="mt-2.5 h-1 w-full rounded-full bg-[var(--surface-hover)] overflow-hidden">
          <div
            className="h-full rounded-full bg-[var(--accent)]"
            style={{ width: `${Math.min(100, Math.round(progress))}%` }}
          />
        </div>
      )}
    </button>
  );
}

function VariantEditor({
  approval,
  platform,
  onInspect,
}: {
  approval: Approval;
  platform: PlatformId;
  onInspect: () => void;
}) {
  const variant = approval.variants[platform];
  const limits = PLATFORM_LIMITS[platform];
  const updateCopy = useUpdateVariantCopyMutation();
  const decide = useDecideApprovalMutation();
  const [body, setBody] = useState(variant?.body ?? "");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setBody(variant?.body ?? "");
    setDirty(false);
  }, [approval.id, platform, variant?.version, variant?.body]);

  if (!variant) return null;

  const save = () => {
    updateCopy.mutate(
      { contentId: approval.contentId, platform, body },
      {
        onSuccess: () => {
          setDirty(false);
          toast.success(`${limits.label} copy saved (v${variant.version + 1})`);
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to save copy"),
      }
    );
  };

  const approve = () => {
    decide.mutate(
      { id: approval.id, decision: "approved" },
      {
        onSuccess: () => toast.success(`Approved ${approval.contentTitle}`),
        onError: (err) => toast.error(err instanceof Error ? err.message : "Approval failed"),
      }
    );
  };

  const schedule = () => {
    decide.mutate(
      { id: approval.id, decision: "scheduled" },
      {
        onSuccess: () => toast.success(`Scheduled ${approval.contentTitle}`),
        onError: (err) => toast.error(err instanceof Error ? err.message : "Schedule failed"),
      }
    );
  };

  return (
    <article className="flex flex-col rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <header className="px-4 pt-3.5 pb-2.5 border-b border-[var(--border)] flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
            {limits.label}
          </div>
          <div className="mt-1 text-[12.5px] font-medium leading-snug line-clamp-2">
            {variant.title}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {platform === "instagram" && (
            <span className="rounded border border-[var(--border)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--text-muted)]">
              9:16
            </span>
          )}
          {platform === "youtube" && (
            <span className="rounded border border-[var(--border)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--text-muted)]">
              16:9
            </span>
          )}
          <button
            type="button"
            onClick={onInspect}
            className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            Telemetry
          </button>
        </div>
      </header>

      <div className="px-4 py-3 space-y-3 flex-1">
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
            {platform === "instagram" ? "First-frame hook" : "Title"}
          </div>
          <div className="rounded border border-[var(--border)] bg-[var(--surface-raised)] px-2.5 py-2 text-[12px]">
            {variant.title}
          </div>
          <div className="mt-1.5">
            <CharMeter value={variant.title.length} max={limits.title} />
          </div>
        </div>

        {platform === "youtube" && variant.chapters && variant.chapters.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {variant.chapters.map((chapter) => (
              <span
                key={chapter.time}
                className="rounded border border-[var(--border)] bg-[var(--surface-raised)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]"
              >
                {chapter.time} {chapter.title}
              </span>
            ))}
          </div>
        )}

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Body</span>
            <CharMeter value={body.length} max={limits.body} />
          </div>
          <textarea
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
              setDirty(true);
            }}
            rows={platform === "instagram" ? 5 : 6}
            aria-label={`${limits.label} body copy`}
            className="w-full resize-y rounded border border-[var(--border)] bg-[var(--surface-raised)] px-2.5 py-2 text-[12px] leading-relaxed outline-none focus:border-[var(--border-strong)]"
          />
        </div>

        {variant.hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {variant.hashtags.map((tag) => (
              <span key={tag} className="text-[10.5px] text-[var(--info)]">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <footer className="px-4 py-3 border-t border-[var(--border)] flex items-center gap-1.5">
        <button
          type="button"
          onClick={approve}
          disabled={decide.isPending}
          className="inline-flex items-center gap-1 rounded bg-[var(--accent)] px-2.5 py-1.5 text-[11.5px] font-medium text-[#0B0A09] hover:opacity-90 disabled:opacity-60"
        >
          <Check size={12} /> Approve & publish
        </button>
        <button
          type="button"
          onClick={schedule}
          disabled={decide.isPending}
          className="inline-flex items-center gap-1 rounded border border-[var(--border)] px-2.5 py-1.5 text-[11.5px] text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-60"
        >
          <CalendarClock size={12} /> Schedule
        </button>
        {dirty && (
          <button
            type="button"
            onClick={save}
            disabled={updateCopy.isPending}
            className="ml-auto inline-flex items-center gap-1 rounded border border-[var(--border-strong)] px-2.5 py-1.5 text-[11.5px] hover:bg-[var(--surface-hover)] disabled:opacity-60"
          >
            <RefreshCw size={12} /> Save copy
          </button>
        )}
      </footer>
    </article>
  );
}

export function CommandCenterNative() {
  const workspaceQuery = useWorkspaceQuery();
  const approvalsQuery = useApprovalsQuery();
  const postsQuery = usePostsQuery();
  const agentsQuery = useAgentsQuery();
  const contentQuery = useContentItemsQuery();
  const ingest = useIngestVideoMutation();
  const reschedule = useReschedulePostMutation();

  const [selectedApprovalId, setSelectedApprovalId] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [ingestTitle, setIngestTitle] = useState("");
  const [ingestSource, setIngestSource] = useState<ContentItem["source"]>("Antigravity");
  const [ingestDuration, setIngestDuration] = useState(220);
  const [tab, setTab] = useState("action-center");

  const workspace = workspaceQuery.data;
  const approvals = approvalsQuery.data ?? [];
  const pendingApprovals = useMemo(
    () => approvals.filter((a) => a.status === "pending"),
    [approvals]
  );
  const posts = postsQuery.data ?? [];
  const agents = agentsQuery.data ?? [];
  const content = contentQuery.data ?? [];

  useEffect(() => {
    if (!selectedApprovalId && pendingApprovals.length > 0) {
      setSelectedApprovalId(pendingApprovals[0]!.id);
    }
  }, [pendingApprovals, selectedApprovalId]);

  const selectedApproval =
    pendingApprovals.find((a) => a.id === selectedApprovalId) ??
    pendingApprovals[0] ??
    null;

  const scheduledPosts = posts.filter((p) => p.status === "scheduled");
  const conflicts = posts.filter((p) => p.status === "conflict");
  const spendPct = workspace && workspace.dailyBudgetUsd > 0
    ? (workspace.spentTodayUsd / workspace.dailyBudgetUsd) * 100
    : 0;

  const selectedRun = useRunByIdQuery(activeRunId ?? "");

  const submitIngest = () => {
    const title = ingestTitle.trim() || "Walkthrough: Lock-Free Ring Buffers in Rust & Node.js";
    ingest.mutate(
      { title, source: ingestSource, durationSec: ingestDuration },
      {
        onSuccess: (item) => {
          setIngestTitle("");
          toast.success(`Ingested ${item.title} — 13-agent DAG started`);
          setTab("action-center");
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Ingest failed"),
      }
    );
  };

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-[1500px] mx-auto">
      {/* Quick ingest action bar */}
      <div className="flex flex-col md:flex-row gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5">
        <div className="flex-1 flex items-center gap-2 px-2">
          <Film size={15} className="text-[var(--text-muted)] shrink-0" />
          <input
            value={ingestTitle}
            onChange={(event) => setIngestTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submitIngest();
            }}
            placeholder="Drop a 4K MP4/MOV or type a content angle…"
            aria-label="Video title or content angle"
            className="w-full bg-transparent py-1.5 text-[13px] outline-none placeholder:text-[var(--text-muted)]"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={ingestSource}
            onChange={(event) => setIngestSource(event.target.value as ContentItem["source"])}
            aria-label="Ingest source"
            className="rounded border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-1.5 text-[11.5px] text-[var(--text-muted)]"
          >
            <option>Antigravity</option>
            <option>MCP (Claude Code)</option>
            <option>MCP (Cursor)</option>
            <option>Manual Drop</option>
          </select>
          <div className="flex items-center gap-1 rounded border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-1.5">
            <Clock size={12} className="text-[var(--text-muted)]" />
            <input
              type="number"
              min={10}
              max={3600}
              value={ingestDuration}
              onChange={(event) => setIngestDuration(Number(event.target.value) || 220)}
              aria-label="Duration in seconds"
              className="w-14 bg-transparent font-mono text-[11.5px] outline-none"
            />
            <span className="text-[10px] text-[var(--text-muted)]">sec</span>
          </div>
          <button
            type="button"
            onClick={submitIngest}
            disabled={ingest.isPending}
            className="inline-flex items-center gap-1.5 rounded bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-[#0B0A09] hover:opacity-90 disabled:opacity-60"
          >
            <Sparkles size={13} />
            {ingest.isPending ? "Generating…" : "Generate"}
          </button>
        </div>
      </div>

      {/* At-a-glance pulse */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiTile
          label="Actions required"
          value={String(pendingApprovals.length)}
          detail={`${pendingApprovals[0]?.brandComplianceScore ?? "—"}/100 brand gate · review queue`}
          icon={Inbox}
          progress={pendingApprovals.length > 0 ? 100 : 0}
          onClick={() => setTab("action-center")}
        />
        <KpiTile
          label="Publishing queue"
          value={String(scheduledPosts.length)}
          detail={`${scheduledPosts[0]?.scheduledAt ?? "No slot assigned"}${conflicts.length > 0 ? ` · ${conflicts.length} conflict` : ""}`}
          icon={CalendarClock}
          progress={scheduledPosts.length > 0 ? 70 : 0}
          onClick={() => setTab("queue")}
        />
        <KpiTile
          label="Daily LLM spend"
          value={`$${(workspace?.spentTodayUsd ?? 0).toFixed(2)} / $${(workspace?.dailyBudgetUsd ?? 0).toFixed(2)}`}
          detail={`${Math.round(spendPct)}% of cap · ${agents.length} agents routed`}
          icon={DollarSign}
          progress={spendPct}
        />
      </div>

      {/* Segmented workspace tabs */}
      <Tabs.Root value={tab} onValueChange={setTab} className="space-y-4">
        <Tabs.List
          aria-label="Workspace sections"
          className="inline-flex flex-wrap items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] p-1"
        >
          {[
            { value: "action-center", label: "✦ Action Center & Previews" },
            { value: "ingest", label: "⚡ Quick Ingest" },
            { value: "queue", label: "📅 Publishing Queue" },
            { value: "fleet", label: "🤖 Agent Fleet" },
          ].map((item) => (
            <Tabs.Trigger
              key={item.value}
              value={item.value}
              className="rounded-full px-3.5 py-1.5 text-[11.5px] text-[var(--text-muted)] transition-colors data-[state=active]:bg-[var(--surface-raised)] data-[state=active]:text-[var(--text)] data-[state=active]:border data-[state=active]:border-[var(--border-strong)]"
            >
              {item.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        {/* 1. Action Center */}
        <Tabs.Content value="action-center" className="space-y-3.5 outline-none">
          {pendingApprovals.length === 0 ? (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-8 text-center text-[12.5px] text-[var(--text-muted)]">
              Nothing is waiting at the Human Approval Gate.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                {pendingApprovals.map((approval) => (
                  <button
                    key={approval.id}
                    type="button"
                    onClick={() => setSelectedApprovalId(approval.id)}
                    aria-pressed={selectedApproval?.id === approval.id}
                    className={`rounded-full border px-2.5 py-1 text-[11px] ${
                      selectedApproval?.id === approval.id
                        ? "border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--text)]"
                        : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"
                    }`}
                  >
                    <span className="font-mono text-[10px] text-[var(--text-muted)]">{approval.id}</span>{" "}
                    {approval.contentTitle.slice(0, 38)}
                    {approval.contentTitle.length > 38 ? "…" : ""}
                  </button>
                ))}
              </div>

              {selectedApproval && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
                  {(["instagram", "youtube", "linkedin"] as PlatformId[]).map((platform) => (
                    <VariantEditor
                      key={`${selectedApproval.id}:${platform}`}
                      approval={selectedApproval}
                      platform={platform}
                      onInspect={() => setActiveRunId(selectedApproval.runId)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </Tabs.Content>

        {/* 2. Quick ingest */}
        <Tabs.Content value="ingest" className="space-y-3.5 outline-none">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            <div className="rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface)] p-6 text-center">
              <Upload size={22} className="mx-auto text-[var(--text-muted)]" />
              <div className="mt-2.5 text-[13px]">Drop a 4K MP4 / MOV master</div>
              <p className="mt-1 text-[11.5px] text-[var(--text-muted)]">
                SHA-256 deduplication, FFmpeg keyframes and Whisper alignment run automatically.
              </p>
              <label className="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded border border-[var(--border)] bg-[var(--surface-raised)] px-2.5 py-1.5 text-[11.5px] hover:border-[var(--border-strong)]">
                <FileVideo size={13} />
                Choose file
                <input
                  type="file"
                  accept="video/mp4,video/quicktime"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    setIngestTitle(file.name.replace(/\.[^.]+$/, ""));
                    setIngestSource("Manual Drop");
                    toast.success(`${file.name} staged — press Generate to start the DAG`);
                  }}
                />
              </label>
            </div>

            <details className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
              <summary className="cursor-pointer text-[12px] text-[var(--text-muted)] hover:text-[var(--text)]">
                Developer webhook &amp; MCP specs
              </summary>
              <pre className="mt-3 overflow-x-auto rounded bg-[var(--surface-raised)] p-3 font-mono text-[10.5px] leading-relaxed text-[var(--text-muted)]">
{`POST /api/v1/ingest
Authorization: Bearer dh_live_…
Content-Type: application/json
X-DevHouse-Signature-256: sha256=<hmac>

{ "title": "Zero-Copy IPC", "source": "Antigravity", "durationSec": 228 }

# MCP
tools/call → trigger_pipeline { contentId }`}
              </pre>
            </details>
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
              Recent intake
            </div>
            <ul className="mt-2 divide-y divide-[var(--border)]">
              {content.slice(0, 6).map((item) => (
                <li key={item.id} className="flex items-center gap-2 py-2 text-[12px]">
                  <Layers size={12} className="text-[var(--text-muted)]" />
                  <span className="truncate">{item.title}</span>
                  <span className="ml-auto font-mono text-[10px] text-[var(--text-muted)]">
                    {item.durationFormatted} · {item.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Tabs.Content>

        {/* 3. Queue */}
        <Tabs.Content value="queue" className="space-y-3.5 outline-none">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-4 py-2.5 border-b border-[var(--border)] text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
              <span>Scheduled post</span>
              <span>Slot</span>
              <span />
            </div>
            <ul className="divide-y divide-[var(--border)]">
              {posts.map((post) => (
                <li key={post.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 px-4 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-[12px]">{post.title}</div>
                    <div className="text-[10.5px] text-[var(--text-muted)]">
                      {PLATFORM_LIMITS[post.platform].label}
                      {post.conflictWarning ? ` · ${post.conflictWarning}` : ""}
                    </div>
                  </div>
                  <span
                    className={`font-mono text-[10.5px] ${
                      post.status === "conflict" ? "text-[var(--danger)]" : "text-[var(--text-muted)]"
                    }`}
                  >
                    {post.scheduledAt}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      reschedule.mutate(
                        { postId: post.id, dayOfMonth: post.dayOfMonth + 1, hour: post.hour },
                        {
                          onSuccess: () => toast.success(`Pushed ${post.id} by one day`),
                          onError: (err) =>
                            toast.error(err instanceof Error ? err.message : "Reschedule failed"),
                        }
                      )
                    }
                    className="rounded border border-[var(--border)] px-2 py-1 text-[10.5px] text-[var(--text-muted)] hover:text-[var(--text)]"
                    aria-label={`Push ${post.title} by one day`}
                  >
                    <Plus size={11} className="inline" /> 1d
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </Tabs.Content>

        {/* 4. Fleet */}
        <Tabs.Content value="fleet" className="space-y-3.5 outline-none">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5">
            {DEPARTMENTS.map((dept) => (
              <section
                key={dept.name}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
              >
                <h3 className="mb-2 text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  {dept.name}
                </h3>
                <ul className="space-y-1.5">
                  {agents
                    .filter((agent) => dept.roles.includes(agent.role))
                    .map((agent) => (
                      <li
                        key={agent.id}
                        className="flex items-center gap-2 rounded border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-1.5"
                      >
                        <span className="flex h-6 w-6 items-center justify-center rounded bg-[var(--surface-hover)] font-mono text-[10px]">
                          {agent.monogram}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-[11.5px]">{agent.name}</div>
                          <div className="truncate font-mono text-[9.5px] text-[var(--text-muted)]">
                            {agent.primaryModelId}
                          </div>
                        </div>
                        <span
                          className={`ml-auto h-1.5 w-1.5 shrink-0 rounded-full ${
                            agent.status === "running"
                              ? "bg-[var(--accent)]"
                              : agent.status === "failed"
                                ? "bg-[var(--danger)]"
                                : "bg-[var(--text-muted)]"
                          }`}
                          aria-label={`Status: ${agent.status}`}
                        />
                      </li>
                    ))}
                </ul>
              </section>
            ))}
          </div>
        </Tabs.Content>
      </Tabs.Root>

      {/* Slide-over telemetry drawer */}
      <Drawer.Root
        open={Boolean(activeRunId)}
        onOpenChange={(open) => {
          if (!open) setActiveRunId(null);
        }}
        direction="right"
      >
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-40 bg-black/50" />
          <Drawer.Content className="fixed right-0 top-0 bottom-0 z-50 w-[min(520px,94vw)] border-l border-[var(--border)] bg-[var(--surface)] flex flex-col">
            <div className="flex items-start gap-2 border-b border-[var(--border)] p-4">
              <div className="min-w-0">
                <Drawer.Title className="text-[13px] font-medium">
                  {selectedRun.data?.contentTitle ?? "Run telemetry"}
                </Drawer.Title>
                <Drawer.Description className="mt-0.5 font-mono text-[10.5px] text-[var(--text-muted)]">
                  {activeRunId} · {selectedRun.data?.totalTokens ?? 0} tok · $
                  {(selectedRun.data?.totalCostUsd ?? 0).toFixed(3)}
                </Drawer.Description>
              </div>
              <Drawer.Close asChild>
                <button
                  type="button"
                  aria-label="Close telemetry drawer"
                  className="ml-auto rounded p-1 text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  <X size={15} />
                </button>
              </Drawer.Close>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {selectedRun.isLoading && (
                <div className="text-[12px] text-[var(--text-muted)]">Loading run steps…</div>
              )}
              {(selectedRun.data?.steps ?? []).map((step) => (
                <div
                  key={step.id}
                  className="rounded border border-[var(--border)] bg-[var(--surface-raised)] p-2.5"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded bg-[var(--surface-hover)] font-mono text-[10px]">
                      {step.agentMonogram}
                    </span>
                    <span className="text-[11.5px]">{step.agentName}</span>
                    <span
                      className={`ml-auto font-mono text-[9.5px] ${
                        step.status === "completed"
                          ? "text-[var(--success)]"
                          : step.status === "failed"
                            ? "text-[var(--danger)]"
                            : "text-[var(--accent)]"
                      }`}
                    >
                      {step.status}
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-[9.5px] text-[var(--text-muted)]">
                    {step.modelUsed} · {step.tokensIn}+{step.tokensOut} tok · ${step.costUsd.toFixed(4)}
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-[11px] leading-relaxed text-[var(--text-muted)]">
                    {step.streamedOutput.slice(0, 320)}
                  </p>
                  {step.toolCalls.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {step.toolCalls.map((tool) => (
                        <span
                          key={tool}
                          className="rounded border border-[var(--border)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--info)]"
                        >
                          {tool}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="border-t border-[var(--border)] p-3">
              <a
                href={activeRunId ? `/runs/${activeRunId}` : "/runs"}
                className="inline-flex items-center gap-1 text-[11.5px] text-[var(--accent)] hover:underline"
              >
                <ListChecks size={12} /> Open full Agent Theater
                <ChevronRight size={12} />
              </a>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      <div className="flex items-center justify-between text-[10.5px] text-[var(--text-muted)]">
        <span>
          {pendingApprovals.length} awaiting approval · {scheduledPosts.length} scheduled
        </span>
        <a href="/approvals" className="inline-flex items-center gap-1 hover:text-[var(--text)]">
          Open approvals inbox <ArrowRight size={11} />
        </a>
      </div>
    </div>
  );
}
