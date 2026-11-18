import { useEffect, useRef, useState, useCallback } from "react";
import type { LiveBusEvent, WorkflowNode, WorkflowEdge } from "@/lib/api/types";

export interface LiveSimulationState {
  isPlaying: boolean;
  speed: 1 | 2 | 4;
  tickIndex: number;
  maxTicks: number;
  activeNodeId: string;
  activeEdgeId: string;
  fallbackActive: boolean;
  events: LiveBusEvent[];
}

const SIMULATION_BEATS: {
  nodeId: string;
  edgeId: string;
  agentId: string;
  type: LiveBusEvent["type"];
  summary: string;
}[] = [
  { nodeId: "src_antigravity", edgeId: "e_ag_ingest", agentId: "agt_director", type: "run.status", summary: "Antigravity pushed video chunk ag-stream-904.mp4 (48.2 MB, 4K60)" },
  { nodeId: "gw_ingest", edgeId: "e_ingest_redis", agentId: "agt_director", type: "edge.packet", summary: "Ingest Edge API verified HMAC signature and queued job #9042 in Redis Streams" },
  { nodeId: "med_ffmpeg", edgeId: "e_ffmpeg_dir", agentId: "agt_video_analyst", type: "node.status", summary: "FFmpeg scene detector extracted 18 keyframes + 9:16 vertical crop" },
  { nodeId: "med_whisper", edgeId: "e_whisper_dir", agentId: "agt_video_analyst", type: "node.status", summary: "Whisper transcription aligned 1,420 words with millisecond timestamps" },
  { nodeId: "agt_video_analyst", edgeId: "e_dir_va", agentId: "agt_video_analyst", type: "agent.token", summary: "Video Analyst extracted 01:42 flamegraph hook: 14.2ms -> 0.38ms p99 latency" },
  { nodeId: "agt_director", edgeId: "e_dir_lw", agentId: "agt_director", type: "edge.packet", summary: "Director locked thesis and fanned out briefs to LinkedIn, Instagram, and YouTube Writers" },
  { nodeId: "prv_cf_gw", edgeId: "e_gw_nvidia", agentId: "agt_linkedin_writer", type: "provider.fallback", summary: "Gemini 2.5 Pro returned HTTP 429 burst limit -> AI Gateway auto-fell back to NVIDIA NIM Llama 3.3 70B" },
  { nodeId: "agt_linkedin_writer", edgeId: "e_lw_br", agentId: "agt_linkedin_writer", type: "agent.token", summary: "LinkedIn Writer streamed 1,240 chars via NVIDIA NIM at 124 tok/s ($0.034)" },
  { nodeId: "agt_instagram_writer", edgeId: "e_iw_br", agentId: "agt_instagram_writer", type: "agent.token", summary: "Instagram Writer completed 9:16 Reel overlay hook + builder caption via xAI Grok-3" },
  { nodeId: "agt_youtube_writer", edgeId: "e_yw_br", agentId: "agt_youtube_writer", type: "agent.token", summary: "YouTube Writer finalized 4 timestamped chapters and wireframe thumbnail prompt" },
  { nodeId: "agt_brand_reviewer", edgeId: "e_br_gate", agentId: "agt_brand_reviewer", type: "tool.call", summary: "Brand Reviewer ran scan_banned_words — 0 violations, compliance score 96/100" },
  { nodeId: "gate_approval", edgeId: "e_gate_li", agentId: "agt_publisher", type: "run.status", summary: "Variants staged at Human Approval Gate (Autonomy: Approve-before-publish)" },
];

export function useLiveEvents(initialNodes: WorkflowNode[], initialEdges: WorkflowEdge[]) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState<1 | 2 | 4>(1);
  const [tickIndex, setTickIndex] = useState(0);
  const [events, setEvents] = useState<LiveBusEvent[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentBeat = SIMULATION_BEATS[tickIndex % SIMULATION_BEATS.length] ?? SIMULATION_BEATS[0]!;

  const stepSimulation = useCallback(() => {
    setTickIndex((prev) => {
      const next = (prev + 1) % SIMULATION_BEATS.length;
      const beat = SIMULATION_BEATS[next]!;
      const ev: LiveBusEvent = {
        id: `ev_${Date.now()}_${next}`,
        timestamp: new Date().toTimeString().slice(0, 8) + " IST",
        type: beat.type,
        nodeId: beat.nodeId,
        edgeId: beat.edgeId,
        agentId: beat.agentId,
        runId: "run_9042_live",
        summary: beat.summary,
        status: beat.nodeId === "gate_approval" ? "waiting" : "running",
      };
      setEvents((old) => [ev, ...old].slice(0, 40));
      return next;
    });
  }, []);

  // Connect to live backend SSE stream when NEXT_PUBLIC_API_MODE === "live"
  useEffect(() => {
    const mode = process.env.NEXT_PUBLIC_API_MODE ?? "mock";
    if (mode !== "live" || typeof window === "undefined" || typeof EventSource === "undefined") {
      return;
    }
    const baseUrl = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1").replace(/\/+$/, "");
    let es: EventSource | null = null;
    try {
      es = new EventSource(`${baseUrl}/events/stream`);
      es.onmessage = (msg) => {
        try {
          const parsed = JSON.parse(msg.data as string) as LiveBusEvent;
          setEvents((prev) => [parsed, ...prev.filter((e) => e.id !== parsed.id)].slice(0, 40));
        } catch {
          // Ignore malformed keepalive frames
        }
      };
    } catch {
      // Fallback gracefully to local simulation interval
    }
    return () => {
      es?.close();
    };
  }, []);

  useEffect(() => {
    if (!isPlaying) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    const intervalMs = Math.round(1800 / speed);
    timerRef.current = setInterval(stepSimulation, intervalMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, speed, stepSimulation]);

  return {
    isPlaying,
    setIsPlaying,
    speed,
    setSpeed,
    tickIndex,
    maxTicks: SIMULATION_BEATS.length,
    activeNodeId: currentBeat.nodeId,
    activeEdgeId: currentBeat.edgeId,
    fallbackActive: tickIndex >= 5 && tickIndex <= 8,
    setTickIndex,
    events,
    setEvents,
    nodes: initialNodes,
    edges: initialEdges,
  };
}
