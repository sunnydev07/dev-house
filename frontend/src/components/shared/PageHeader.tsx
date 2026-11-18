import React from "react";

export interface PageHeaderProps {
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="font-serif text-2xl sm:text-3xl text-[var(--text)]">{title}</h1>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">{subtitle}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
