"use client";

import React, { useCallback, useEffect, useRef } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { CommandCenterNative } from "@/components/dashboard/CommandCenterNative";
import { LiveMapCanvas } from "@/components/live/LiveMapCanvas";

interface ConsoleIframeWindow extends Window {
  navigateTo?: (route: string) => void;
}

/**
 * Native screens are rendered as real React 19 components inside <AppShell>.
 * Every route that has not been extracted yet falls back to the standalone
 * `/dev-house-console.html` runtime, which remains fully functional on its own.
 */
const NATIVE_SCREENS: Record<string, React.ComponentType> = {
  "/": CommandCenterNative,
  "/map": LiveMapCanvas,
};

function StaticConsoleFallback({ initialRoute }: { initialRoute: string }) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const apiMode = process.env.NEXT_PUBLIC_API_MODE ?? "live";
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

  const syncRouteToIframe = useCallback(
    (route: string) => {
      try {
        const contentWin = iframeRef.current?.contentWindow as ConsoleIframeWindow | null;
        if (contentWin && typeof contentWin.navigateTo === "function") {
          contentWin.navigateTo(route);
        } else if (contentWin) {
          contentWin.postMessage({ type: "DEVHOUSE_NAVIGATE", route, apiMode, apiUrl }, "*");
        }
      } catch {
        // Ignore cross-origin frame access errors if any
      }
    },
    [apiMode, apiUrl]
  );

  useEffect(() => {
    syncRouteToIframe(initialRoute);
  }, [initialRoute, syncRouteToIframe]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; route?: string } | null;
      if (data && data.type === "DEVHOUSE_ROUTE_CHANGED" && typeof data.route === "string") {
        if (typeof window !== "undefined" && window.location.pathname !== data.route) {
          window.history.replaceState(null, "", data.route);
        }
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const iframeSrc = `/dev-house-console.html?route=${encodeURIComponent(initialRoute)}&apiMode=${encodeURIComponent(
    apiMode
  )}&apiUrl=${encodeURIComponent(apiUrl)}`;

  return (
    <iframe
      ref={iframeRef}
      src={iframeSrc}
      onLoad={() => syncRouteToIframe(initialRoute)}
      title="Dev House Console Interactive Runtime"
      className="w-full h-screen border-0"
    />
  );
}

export function ConsoleWorkspace({ initialRoute = "/" }: { initialRoute?: string }) {
  const NativeScreen = NATIVE_SCREENS[initialRoute];

  if (!NativeScreen) {
    return <StaticConsoleFallback initialRoute={initialRoute} />;
  }

  return (
    <AppShell activeRoute={initialRoute}>
      <NativeScreen />
    </AppShell>
  );
}
