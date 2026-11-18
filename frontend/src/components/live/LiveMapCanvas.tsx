"use client";

import React, { useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { List, Network, Play, Pause, Table2 } from "lucide-react";
import { useLiveEvents } from "@/hooks/useLiveEvents";
import { useWorkflowQuery } from "@/hooks/useConsoleQueries";

interface WorkflowNodeData extends Record<string, unknown> {
  label: string;
  sublabel: string;
  status: string;
  monogram: string;
}

const STATUS_COLOR: Record<string, string> = {
  running: "var(--accent)",
  waiting: "var(--warning)",
  degraded: "var(--warning)",
  failed: "var(--danger)",
  idle: "var(--text-muted)",
};

const LANE_LABELS = [
  "Sources",
  "Gateways",
  "Core & Queue",
  "Media",
  "Agents",
  "Providers",
  "Approval Gate",
  "Publishers",
];

function LaneNode({ data }: NodeProps<Node<WorkflowNodeData>>) {
  const color = STATUS_COLOR[data.status] ?? STATUS_COLOR.idle!;
  return (
    <div className="w-[196px] rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 py-2 shadow-lg">
      <div className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
        <span className="truncate text-[11px] font-medium text-[var(--text)]">{data.label}</span>
        <span className="ml-auto font-mono text-[8.5px] text-[var(--text-muted)]">{data.monogram}</span>
      </div>
      <div className="mt-0.5 truncate text-[9.5px] text-[var(--text-muted)]">{data.sublabel}</div>
    </div>
  );
}

const nodeTypes = { lane: LaneNode };

export function LiveMapCanvas() {
  const workflowQuery = useWorkflowQuery();
  const workflow = workflowQuery.data;
  const [showTable, setShowTable] = useState(false);
  const live = useLiveEvents(workflow?.nodes ?? [], workflow?.edges ?? []);

  const flowNodes = useMemo<Node<WorkflowNodeData>[]>(
    () =>
      (workflow?.nodes ?? []).map((node) => ({
        id: node.id,
        type: "lane",
        position: { x: node.lane * 248, y: node.row * 92 },
        data: {
          label: node.label,
          sublabel: node.sublabel,
          status: node.status,
          monogram: node.type.slice(0, 2).toUpperCase(),
        },
      })),
    [workflow]
  );

  const flowEdges = useMemo<Edge[]>(
    () =>
      (workflow?.edges ?? []).map((edge) => {
        const isActiveEdge = edge.id === live.activeEdgeId;
        const isFallback = edge.status === "fallback";
        const isFailed = edge.status === "failed";
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          animated: isActiveEdge || edge.status === "active",
          label: edge.label,
          style: {
            stroke: isFailed
              ? "var(--danger)"
              : isFallback
                ? "var(--warning)"
                : isActiveEdge
                  ? "var(--accent)"
                  : "var(--border-strong)",
            strokeWidth: isActiveEdge ? 2 : 1.2,
            strokeDasharray: isFailed ? "4 4" : undefined,
          },
          labelStyle: { fill: "var(--text-muted)", fontSize: 9 },
          labelBgStyle: { fill: "var(--surface)" },
        };
      }),
    [workflow, live.activeEdgeId]
  );

  if (workflowQuery.isLoading) {
    return (
      <div className="p-6 text-[12.5px] text-[var(--text-muted)]">Loading live topology…</div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 text-[13px] font-medium">
          <Network size={15} className="text-[var(--accent)]" />
          {workflow?.name ?? "Live System Topology"}
        </div>
        <span className="rounded border border-[var(--border)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
          {flowNodes.length} nodes · {flowEdges.length} edges
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => live.setIsPlaying(!live.isPlaying)}
            className="inline-flex items-center gap-1 rounded border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text)]"
            aria-pressed={live.isPlaying}
          >
            {live.isPlaying ? <Pause size={12} /> : <Play size={12} />}
            {live.isPlaying ? "Pause stream" : "Resume stream"}
          </button>
          <div
            role="group"
            aria-label="Playback speed"
            className="inline-flex rounded border border-[var(--border)] bg-[var(--surface)] p-0.5"
          >
            {([1, 2, 4] as const).map((rate) => (
              <button
                key={rate}
                type="button"
                onClick={() => live.setSpeed(rate)}
                aria-pressed={live.speed === rate}
                className={`rounded px-2 py-1 font-mono text-[10px] ${
                  live.speed === rate
                    ? "bg-[var(--surface-raised)] text-[var(--text)]"
                    : "text-[var(--text-muted)]"
                }`}
              >
                {rate}x
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowTable((prev) => !prev)}
            aria-pressed={showTable}
            className="inline-flex items-center gap-1 rounded border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            {showTable ? <List size={12} /> : <Table2 size={12} />}
            {showTable ? "Canvas view" : "Table view"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {LANE_LABELS.map((label, lane) => (
          <span
            key={label}
            className="rounded-full border border-[var(--border)] px-2 py-0.5 font-mono text-[9.5px] text-[var(--text-muted)]"
          >
            {lane} · {label}
          </span>
        ))}
      </div>

      {showTable ? (
        <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)]">
          <table className="w-full text-left text-[11.5px]">
            <caption className="sr-only">Accessible topology node table</caption>
            <thead className="border-b border-[var(--border)] text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
              <tr>
                <th scope="col" className="px-3 py-2">Node</th>
                <th scope="col" className="px-3 py-2">Layer</th>
                <th scope="col" className="px-3 py-2">Status</th>
                <th scope="col" className="px-3 py-2">Current task</th>
                <th scope="col" className="px-3 py-2 text-right">Latency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {(workflow?.nodes ?? []).map((node) => (
                <tr key={node.id} className="hover:bg-[var(--surface-hover)]">
                  <td className="px-3 py-2">{node.label}</td>
                  <td className="px-3 py-2 font-mono text-[10px] text-[var(--text-muted)]">{node.layer}</td>
                  <td className="px-3 py-2" style={{ color: STATUS_COLOR[node.status] }}>
                    {node.status}
                  </td>
                  <td className="px-3 py-2 text-[var(--text-muted)]">{node.currentTask}</td>
                  <td className="px-3 py-2 text-right font-mono text-[10px]">{node.latencyMs}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
          <div style={{ height: 620 }}>
            <ReactFlow
              nodes={flowNodes}
              edges={flowEdges}
              nodeTypes={nodeTypes}
              fitView
              minZoom={0.25}
              maxZoom={1.4}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable
              aria-label="Live agent orchestration topology"
            >
              <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="var(--border-strong)" />
              <Controls showInteractive={false} />
              <MiniMap
                pannable
                zoomable
                style={{ background: "var(--surface-raised)" }}
                nodeColor={(node) =>
                  STATUS_COLOR[String((node.data as WorkflowNodeData).status)] ?? "var(--text-muted)"
                }
              />
            </ReactFlow>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
        <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] ember-breathing" />
          Live event bus
        </div>
        <ul className="space-y-1">
          {live.events.length === 0 && (
            <li className="text-[11.5px] text-[var(--text-muted)]">
              Waiting for the next SSE frame…
            </li>
          )}
          {live.events.slice(0, 8).map((event) => (
            <li key={event.id} className="flex items-start gap-2 text-[11px]">
              <span className="mt-0.5 shrink-0 font-mono text-[9.5px] text-[var(--text-muted)]">
                {event.timestamp}
              </span>
              <span className="rounded border border-[var(--border)] px-1 py-0.5 font-mono text-[9px] text-[var(--info)]">
                {event.type}
              </span>
              <span className="text-[var(--text-muted)]">{event.summary}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
