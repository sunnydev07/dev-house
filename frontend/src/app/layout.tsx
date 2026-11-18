import React from "react";
import type { Metadata } from "next";
import { Instrument_Serif, Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/shell/Providers";
import "./globals.css";

const instrumentSerif = Instrument_Serif({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-instrument-serif",
});

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "Dev House Console — Agent Orchestration & Publishing",
  description: "A lit window in a quiet house at night. Multi-agent video-to-social orchestration and MCP gateway.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${instrumentSerif.variable} ${geistSans.variable} ${geistMono.variable}`}
    >
      <body className="min-h-screen antialiased selection:bg-[var(--accent)] selection:text-[#0B0A09]">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
