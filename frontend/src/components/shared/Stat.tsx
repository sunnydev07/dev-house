import React from "react";

export interface StatProps {
  label: string;
  value: string | number;
  sublabel?: string;
  accent?: boolean;
}

export function Stat({ label, value, sublabel, accent = false }: StatProps) {
  return (
    <div className="p-4 rounded-md bg-[var(--surface)] border border-[var(--border)]">
      <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{label}</div>
      <div className={`font-serif text-3xl mt-1 ${accent ? "text-[var(--accent)]" : "text-[var(--text)]"}`}>{value}</div>
      {sublabel && <div className="font-mono text-[11px] text-[var(--text-muted)] mt-0.5">{sublabel}</div>}
    </div>
  );
}
