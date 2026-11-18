import React from "react";
import type { PlatformId } from "@/lib/api/types";

export function PlatformChip({ platform }: { platform: PlatformId }) {
  const meta: Record<PlatformId, { label: string; monogram: string; style: string }> = {
    linkedin: {
      label: "LinkedIn",
      monogram: "IN",
      style: "text-[var(--platform-linkedin)] border-[var(--platform-linkedin)]/30 bg-[var(--platform-linkedin)]/10",
    },
    instagram: {
      label: "Instagram",
      monogram: "IG",
      style: "text-[var(--platform-instagram)] border-[var(--platform-instagram)]/30 bg-[var(--platform-instagram)]/10",
    },
    youtube: {
      label: "YouTube",
      monogram: "YT",
      style: "text-[var(--platform-youtube)] border-[var(--platform-youtube)]/30 bg-[var(--platform-youtube)]/10",
    },
  };
  const cfg = meta[platform];
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border ${cfg.style}`}>
      <span className="font-semibold">{cfg.monogram}</span>
      <span>{cfg.label}</span>
    </span>
  );
}
