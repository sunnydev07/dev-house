import React from "react";

export interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="p-12 rounded-md bg-[var(--surface)] border border-[var(--border)] text-center space-y-3">
      <h3 className="font-serif text-2xl text-[var(--text)]">{title}</h3>
      <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="px-3.5 py-1.5 rounded bg-[var(--surface-raised)] border border-[var(--border)] text-xs font-mono text-[var(--text)] hover:border-[var(--text-muted)]"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
