import React from "react";

export function CostBadge({ costUsd, tokens }: { costUsd: number; tokens?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[var(--bg)] border border-[var(--border)] font-mono text-[11px] text-[var(--accent)]">
      <span>${costUsd.toFixed(3)}</span>
      {tokens !== undefined && <span className="text-[var(--text-muted)]">· {tokens.toLocaleString()} tok</span>}
    </span>
  );
}
