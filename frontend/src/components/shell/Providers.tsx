"use client";

import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";

/**
 * Client-only provider boundary: TanStack Query cache + sonner toast stack.
 * Mounted once from the root layout so every native screen shares one cache.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster
        theme="dark"
        position="bottom-right"
        closeButton
        toastOptions={{
          style: {
            background: "var(--surface-raised)",
            color: "var(--text)",
            border: "1px solid var(--border)",
          },
        }}
      />
    </QueryClientProvider>
  );
}
