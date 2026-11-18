import React from "react";

export function JsonViewer({ label, data }: { label?: string; data: unknown }) {
  return (
    <div className="rounded bg-[#080706] border border-[var(--border)] p-3 overflow-x-auto">
      {label && <div className="font-mono text-[10px] uppercase text-[var(--text-muted)] mb-1">{label}</div>}
      <pre className="font-mono text-[11px] text-[var(--text)] leading-relaxed">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
