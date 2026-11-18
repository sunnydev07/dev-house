import React from "react";

interface DevHouseLogoProps {
  collapsed?: boolean;
  className?: string;
}

export function DevHouseLogo({ collapsed = false, className = "" }: DevHouseLogoProps) {
  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      <svg
        width="28"
        height="28"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Dev House emblem: minimal roofline with a single lit ember window"
        className="shrink-0"
      >
        <rect
          x="1"
          y="1"
          width="30"
          height="30"
          rx="6"
          fill="var(--surface-raised)"
          stroke="var(--border)"
          strokeWidth="1"
        />
        <path
          d="M6.5 16.5L16 8.5L25.5 16.5"
          stroke="var(--text)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M9.5 15V24H22.5V15"
          stroke="var(--text-muted)"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect
          x="14.5"
          y="16.2"
          width="4.6"
          height="4.6"
          rx="0.7"
          fill="var(--accent)"
        />
      </svg>
      {!collapsed && (
        <div className="flex flex-col leading-none">
          <span className="font-serif text-[17px] tracking-tight text-[var(--text)]">
            Dev House
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-muted)] mt-0.5">
            Console
          </span>
        </div>
      )}
    </div>
  );
}
