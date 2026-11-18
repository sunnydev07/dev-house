"use client";

import React from "react";
import { useParams } from "next/navigation";
import { ConsoleWorkspace } from "@/components/shell/ConsoleWorkspace";

export default function AgentStudioView() {
  const params = useParams<{ id?: string }>();
  const agentId = params?.id && params.id !== "[id]" ? params.id : "agt_director";
  return <ConsoleWorkspace initialRoute={`/agents/${agentId}`} />;
}
