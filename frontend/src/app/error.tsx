"use client";

import React from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const requestId = error.digest ?? "req_01JDEVHOUSE9942A";

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] text-[var(--text)] p-6">
      <div className="max-w-md w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono uppercase tracking-widest text-[var(--danger)]">
            Runtime Fault Boundary
          </span>
          <span className="text-xs font-mono text-[var(--text-muted)]">{requestId}</span>
        </div>
        <h2 className="font-serif text-2xl">Sub-tree failed to render cleanly.</h2>
        <p className="text-sm text-[var(--text-muted)] leading-relaxed">
          {error.message || "An unexpected state transition occurred inside the console view."}
        </p>
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => reset()}
            className="px-3.5 py-2 text-xs font-medium bg-[var(--accent)] text-[#0B0A09] rounded hover:opacity-90 transition"
          >
            Retry boundary
          </button>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(requestId)}
            className="px-3.5 py-2 text-xs font-mono border border-[var(--border)] rounded text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            Copy ID: {requestId}
          </button>
        </div>
      </div>
    </div>
  );
}
