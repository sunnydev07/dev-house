"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useHotkeys } from "react-hotkeys-hook";
import { Command as CommandPrimitive } from "cmdk";
import * as Dialog from "@radix-ui/react-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Activity,
  BarChart3,
  Bot,
  CalendarDays,
  ChevronDown,
  Inbox,
  LayoutDashboard,
  Library,
  Link2,
  Moon,
  Network,
  Palette,
  PanelLeft,
  PanelLeftClose,
  Plug,
  Power,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  Sun,
  Workflow,
} from "lucide-react";
import { DevHouseLogo } from "@/components/brand/DevHouseLogo";
import { useUiStore } from "@/store/uiStore";
import {
  useAgentsQuery,
  useKillSwitchMutation,
  useRunsQuery,
  useSetAutonomyMutation,
  useWorkspaceQuery,
} from "@/hooks/useConsoleQueries";
import type { AutonomyMode } from "@/lib/api/types";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Command Center", icon: LayoutDashboard },
  { href: "/approvals", label: "Approvals", icon: Inbox },
  { href: "/runs", label: "Runs & Theater", icon: Activity },
  { href: "/map", label: "Live Map", icon: Network },
  { href: "/library", label: "Library", icon: Library },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/agents", label: "Agent Crew", icon: Bot },
  { href: "/workflows", label: "Workflows", icon: Workflow },
  { href: "/providers", label: "Providers", icon: Plug },
  { href: "/channels", label: "Channels", icon: Link2 },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/brand", label: "Brand Kit", icon: Palette },
  { href: "/connect", label: "Connect", icon: Sparkles },
  { href: "/system", label: "System", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/onboarding", label: "Onboarding", icon: Sparkles },
];

const AUTONOMY_ORDER: AutonomyMode[] = ["manual", "approve_before_publish", "auto"];
const AUTONOMY_LABEL: Record<AutonomyMode, string> = {
  manual: "Manual",
  approve_before_publish: "Approve-before-publish",
  auto: "Autonomous",
};

export function AppShell({
  activeRoute,
  children,
}: {
  activeRoute: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const commandPaletteOpen = useUiStore((s) => s.commandPaletteOpen);
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen);

  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [killSwitchOpen, setKillSwitchOpen] = useState(false);

  const workspaceQuery = useWorkspaceQuery();
  const agentsQuery = useAgentsQuery();
  const runsQuery = useRunsQuery();
  const setAutonomy = useSetAutonomyMutation();
  const killSwitch = useKillSwitchMutation();

  const workspace = workspaceQuery.data;
  const agentsOnline = agentsQuery.data?.length ?? 0;
  const activeRuns = (runsQuery.data ?? []).filter((r) => r.status === "running").length;
  const publishingPaused = workspace?.publishingPaused ?? false;

  useHotkeys("meta+k, ctrl+k", (event) => {
    event.preventDefault();
    setCommandPaletteOpen(!commandPaletteOpen);
  });

  useEffect(() => {
    if (theme && typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", theme);
    }
  }, [theme]);

  const cycleAutonomy = () => {
    const current = workspace?.autonomyMode ?? "approve_before_publish";
    const next = AUTONOMY_ORDER[(AUTONOMY_ORDER.indexOf(current) + 1) % AUTONOMY_ORDER.length]!;
    setAutonomy.mutate(next, {
      onSuccess: () => toast.success(`Autonomy mode set to ${AUTONOMY_LABEL[next]}`),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to change autonomy mode"),
    });
  };

  const confirmKillSwitch = () => {
    const next = !publishingPaused;
    killSwitch.mutate(next, {
      onSuccess: () => {
        toast[next ? "warning" : "success"](
          next ? "Emergency kill switch engaged. Publishing halted." : "Publishing resumed."
        );
        setKillSwitchOpen(false);
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : "Kill switch update failed"),
    });
  };

  const navigate = (href: string) => {
    setCommandPaletteOpen(false);
    router.push(href);
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] flex">
      {/* Left collapsible sidebar */}
      <aside
        className={`shrink-0 border-r border-[var(--border)] bg-[var(--surface)] flex flex-col transition-[width] duration-200 ${
          sidebarCollapsed ? "w-[64px]" : "w-[232px]"
        }`}
      >
        <div className="h-14 flex items-center gap-2 px-3 border-b border-[var(--border)]">
          <Link href="/" aria-label="Dev House home" className="truncate">
            <DevHouseLogo collapsed={sidebarCollapsed} />
          </Link>
          {!sidebarCollapsed && (
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label="Collapse sidebar"
              className="ml-auto p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]"
            >
              <PanelLeftClose size={15} />
            </button>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5" aria-label="Primary">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = item.href === activeRoute;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[12.5px] transition-colors ${
                  active
                    ? "bg-[var(--surface-raised)] text-[var(--text)] border border-[var(--border-strong)]"
                    : "text-[var(--text-muted)] border border-transparent hover:text-[var(--text)] hover:bg-[var(--surface-hover)]"
                }`}
              >
                <Icon size={15} className={active ? "text-[var(--accent)]" : ""} />
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {sidebarCollapsed && (
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label="Expand sidebar"
            className="m-2 p-2 rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]"
          >
            <PanelLeft size={15} />
          </button>
        )}
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top header bar */}
        <header className="h-14 shrink-0 border-b border-[var(--border)] bg-[var(--surface)] flex items-center gap-3 px-4">
          <div className="relative">
            <button
              type="button"
              onClick={() => setWorkspaceMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={workspaceMenuOpen}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-raised)] text-[12.5px] hover:border-[var(--border-strong)]"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
              <span className="font-medium truncate max-w-[150px]">
                {workspace?.name ?? "Dev House Core"}
              </span>
              <ChevronDown size={13} className="text-[var(--text-muted)]" />
            </button>
            {workspaceMenuOpen && (
              <div
                role="menu"
                className="absolute z-30 mt-1.5 w-56 rounded-md border border-[var(--border)] bg-[var(--surface-raised)] p-1 shadow-xl"
              >
                <div className="px-2.5 py-2 text-[11px] uppercase tracking-widest text-[var(--text-muted)]">
                  Workspaces
                </div>
                <div className="px-2.5 py-2 rounded bg-[var(--surface-hover)] text-[12.5px] flex items-center justify-between">
                  <span>{workspace?.name ?? "Dev House Core"}</span>
                  <span className="font-mono text-[10px] text-[var(--text-muted)]">{workspace?.timezone}</span>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => router.push("/map")}
            className="hidden sm:flex items-center gap-2 px-2.5 py-1.5 rounded-full border border-[var(--success)]/30 bg-[var(--success)]/10 text-[11.5px] text-[var(--success)] hover:bg-[var(--success)]/15"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" />
            {agentsOnline} Agents Online
            {activeRuns > 0 && (
              <span className="text-[var(--text-muted)]">· {activeRuns} Active Run</span>
            )}
          </button>

          <button
            type="button"
            onClick={cycleAutonomy}
            disabled={setAutonomy.isPending}
            className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-raised)] text-[11.5px] text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-60"
            title="Cycle autonomy mode"
          >
            <span className="uppercase tracking-wider text-[10px]">Autonomy</span>
            <span className="text-[var(--text)]">
              {AUTONOMY_LABEL[workspace?.autonomyMode ?? "approve_before_publish"]}
            </span>
          </button>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCommandPaletteOpen(true)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-raised)] text-[11.5px] text-[var(--text-muted)] hover:border-[var(--border-strong)]"
              aria-label="Open command palette"
            >
              <Search size={13} />
              <span className="hidden sm:inline">Search</span>
              <kbd className="hidden sm:inline font-mono text-[10px] px-1 py-0.5 rounded border border-[var(--border)]">
                ⌘K
              </kbd>
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="p-2 rounded-md border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            </button>

            <button
              type="button"
              onClick={() => setKillSwitchOpen(true)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-[11.5px] ${
                publishingPaused
                  ? "border-[var(--danger)]/50 bg-[var(--danger)]/15 text-[var(--danger)]"
                  : "border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-muted)] hover:text-[var(--danger)]"
              }`}
            >
              <Power size={13} />
              {publishingPaused ? "Paused" : "Kill Switch"}
            </button>
          </div>
        </header>

        {publishingPaused && (
          <div className="px-4 py-2 text-[11.5px] bg-[var(--danger)]/10 border-b border-[var(--danger)]/30 text-[var(--danger)] flex items-center gap-2">
            <ShieldAlert size={14} />
            Publishing is halted by the workspace kill switch. Connector dispatches are blocked.
          </div>
        )}

        <main className="flex-1 min-w-0">{children}</main>
      </div>

      {/* Cmd+K Command Palette */}
      {commandPaletteOpen && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close command palette"
            onClick={() => setCommandPaletteOpen(false)}
            className="absolute inset-0 bg-black/50"
          />
          <CommandPrimitive
            label="Command palette"
            className="relative mx-auto mt-[14vh] w-[min(560px,92vw)] rounded-lg border border-[var(--border-strong)] bg-[var(--surface-raised)] shadow-2xl overflow-hidden"
          >
            <div className="flex items-center gap-2 border-b border-[var(--border)] px-3">
              <Search size={14} className="text-[var(--text-muted)]" />
              <CommandPrimitive.Input
                autoFocus
                placeholder="Jump to a screen or run an action…"
                className="w-full bg-transparent py-3 text-[13px] outline-none placeholder:text-[var(--text-muted)]"
              />
              <kbd className="font-mono text-[10px] text-[var(--text-muted)]">ESC</kbd>
            </div>
            <CommandPrimitive.List className="max-h-[320px] overflow-y-auto p-1.5">
              <CommandPrimitive.Empty className="px-3 py-6 text-center text-[12px] text-[var(--text-muted)]">
                No matches.
              </CommandPrimitive.Empty>
              <CommandPrimitive.Group
                heading="Navigate"
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-[var(--text-muted)]"
              >
                {NAV_ITEMS.map((item) => (
                  <CommandPrimitive.Item
                    key={item.href}
                    value={item.label}
                    onSelect={() => navigate(item.href)}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded text-[12.5px] text-[var(--text-muted)] data-[selected=true]:bg-[var(--surface-hover)] data-[selected=true]:text-[var(--text)] cursor-pointer"
                  >
                    <item.icon size={14} />
                    {item.label}
                  </CommandPrimitive.Item>
                ))}
              </CommandPrimitive.Group>
              <CommandPrimitive.Group
                heading="Actions"
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-[var(--text-muted)]"
              >
                <CommandPrimitive.Item
                  value="Cycle autonomy mode"
                  onSelect={() => {
                    setCommandPaletteOpen(false);
                    cycleAutonomy();
                  }}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded text-[12.5px] text-[var(--text-muted)] data-[selected=true]:bg-[var(--surface-hover)] data-[selected=true]:text-[var(--text)] cursor-pointer"
                >
                  <ShieldAlert size={14} />
                  Cycle autonomy mode
                </CommandPrimitive.Item>
                <CommandPrimitive.Item
                  value="Toggle emergency kill switch"
                  onSelect={() => {
                    setCommandPaletteOpen(false);
                    setKillSwitchOpen(true);
                  }}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded text-[12.5px] text-[var(--text-muted)] data-[selected=true]:bg-[var(--surface-hover)] data-[selected=true]:text-[var(--text)] cursor-pointer"
                >
                  <Power size={14} />
                  Toggle emergency kill switch
                </CommandPrimitive.Item>
                <CommandPrimitive.Item
                  value="Refresh workspace data"
                  onSelect={() => {
                    setCommandPaletteOpen(false);
                    void queryClient.invalidateQueries();
                    toast.success("Workspace data refreshed");
                  }}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded text-[12.5px] text-[var(--text-muted)] data-[selected=true]:bg-[var(--surface-hover)] data-[selected=true]:text-[var(--text)] cursor-pointer"
                >
                  <Activity size={14} />
                  Refresh workspace data
                </CommandPrimitive.Item>
              </CommandPrimitive.Group>
            </CommandPrimitive.List>
          </CommandPrimitive>
        </div>
      )}

      {/* Emergency Kill Switch confirmation */}
      <Dialog.Root open={killSwitchOpen} onOpenChange={setKillSwitchOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
          <Dialog.Content className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(420px,92vw)] rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] p-5 shadow-2xl">
            <Dialog.Title className="text-[15px] font-medium flex items-center gap-2">
              <Power size={16} className={publishingPaused ? "text-[var(--success)]" : "text-[var(--danger)]"} />
              {publishingPaused ? "Resume publishing?" : "Engage emergency kill switch?"}
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-[12.5px] text-[var(--text-muted)] leading-relaxed">
              {publishingPaused
                ? "Connector dispatches and scheduled posts will resume on the next tick."
                : "Every outbound connector dispatch (YouTube, LinkedIn, Instagram) is blocked immediately. Scheduled posts stay queued."}
            </Dialog.Description>
            <div className="mt-5 flex justify-end gap-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-md border border-[var(--border)] text-[12px] text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={confirmKillSwitch}
                disabled={killSwitch.isPending}
                className={`px-3 py-1.5 rounded-md text-[12px] font-medium disabled:opacity-60 ${
                  publishingPaused
                    ? "bg-[var(--success)] text-[#0B0A09]"
                    : "bg-[var(--danger)] text-white"
                }`}
              >
                {killSwitch.isPending ? "Applying…" : publishingPaused ? "Resume publishing" : "Halt all publishing"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
