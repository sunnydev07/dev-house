"use client";

import React from "react";
import { useParams } from "next/navigation";
import { ConsoleWorkspace } from "@/components/shell/ConsoleWorkspace";

export default function RunDetailTheaterView() {
  const params = useParams<{ id?: string }>();
  const runId = params?.id && params.id !== "[id]" ? params.id : "run_9042_live";
  return <ConsoleWorkspace initialRoute={`/runs/${runId}`} />;
}
