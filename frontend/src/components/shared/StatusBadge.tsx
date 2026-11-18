import React from "react";

export interface StatusBadgeProps {
  status: string;
}

const STATUS_STYLES: Record<string, { label: string; dot: string; text: string; border: string }> = {
  running: { label: "Running", dot: "bg-[var(--accent)] ember-breathing", text: "text-[var(--accent)]", border: "border-[var(--accent)]/40 bg-[var(--accent)]/10" },
  writing: { label: "Writing", dot: "bg-[var(--accent)] ember-breathing", text: "text-[var(--accent)]", border: "border-[var(--accent)]/40 bg-[var(--accent)]/10" },
  analysing: { label: "Analysing", dot: "bg-[var(--info)]", text: "text-[var(--info)]", border: "border-[var(--info)]/40 bg-[var(--info)]/10" },
  ingested: { label: "Ingested", dot: "bg-[var(--text-muted)]", text: "text-[var(--text-muted)]", border: "border-[var(--border)] bg-[var(--surface-raised)]" },
  awaiting_approval: { label: "Awaiting approval", dot: "bg-[var(--warning)]", text: "text-[var(--warning)]", border: "border-[var(--warning)]/40 bg-[var(--warning)]/10" },
  waiting: { label: "Waiting", dot: "bg-[var(--warning)]", text: "text-[var(--warning)]", border: "border-[var(--warning)]/40 bg-[var(--warning)]/10" },
  pending: { label: "Pending review", dot: "bg-[var(--warning)]", text: "text-[var(--warning)]", border: "border-[var(--warning)]/40 bg-[var(--warning)]/10" },
  scheduled: { label: "Scheduled", dot: "bg-[var(--info)]", text: "text-[var(--info)]", border: "border-[var(--info)]/40 bg-[var(--info)]/10" },
  published: { label: "Published", dot: "bg-[var(--success)]", text: "text-[var(--success)]", border: "border-[var(--success)]/40 bg-[var(--success)]/10" },
  completed: { label: "Completed", dot: "bg-[var(--success)]", text: "text-[var(--success)]", border: "border-[var(--success)]/40 bg-[var(--success)]/10" },
  approved: { label: "Approved", dot: "bg-[var(--success)]", text: "text-[var(--success)]", border: "border-[var(--success)]/40 bg-[var(--success)]/10" },
  healthy: { label: "Healthy", dot: "bg-[var(--success)]", text: "text-[var(--success)]", border: "border-[var(--success)]/40 bg-[var(--success)]/10" },
  connected: { label: "Connected", dot: "bg-[var(--success)]", text: "text-[var(--success)]", border: "border-[var(--success)]/40 bg-[var(--success)]/10" },
  degraded: { label: "Degraded", dot: "bg-[var(--warning)]", text: "text-[var(--warning)]", border: "border-[var(--warning)]/40 bg-[var(--warning)]/10" },
  failed: { label: "Failed", dot: "bg-[var(--danger)]", text: "text-[var(--danger)]", border: "border-[var(--danger)]/40 bg-[var(--danger)]/10" },
  rejected: { label: "Rejected", dot: "bg-[var(--danger)]", text: "text-[var(--danger)]", border: "border-[var(--danger)]/40 bg-[var(--danger)]/10" },
  idle: { label: "Idle", dot: "bg-[var(--text-muted)]", text: "text-[var(--text-muted)]", border: "border-[var(--border)] bg-[var(--surface-raised)]" },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const cfg = STATUS_STYLES[status] ?? STATUS_STYLES.idle!;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono border ${cfg.border} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      <span>{cfg.label}</span>
    </span>
  );
}
