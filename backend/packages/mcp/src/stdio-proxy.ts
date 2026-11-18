#!/usr/bin/env node
import readline from "node:readline";
import type { TokenScope } from "@devhouse/core";
import { dbStore } from "@devhouse/db";
import { mcpServer, MCP_TOOLS_CATALOG, MCP_RESOURCES_CATALOG } from "./index.js";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

function resolveStdioAuth(): { grantedScopes: TokenScope[]; actor: string } {
  const envToken = process.env.DEVHOUSE_API_TOKEN?.trim();
  if (envToken) {
    const verified = dbStore.verifyBearerToken(envToken);
    if (!verified.valid) {
      throw new Error("Invalid or expired DEVHOUSE_API_TOKEN");
    }
    return { grantedScopes: verified.scopes, actor: verified.actor };
  }
  return {
    grantedScopes: ["read", "write", "ingest", "publish", "admin"],
    actor: "stdio-mcp-client",
  };
}

rl.on("line", async (line) => {
  if (!line.trim()) return;
  let reqId: string | number | null = null;
  try {
    const req = JSON.parse(line) as {
      jsonrpc: string;
      id?: string | number | null;
      method: string;
      params?: Record<string, unknown>;
    };
    reqId = req.id ?? null;

    if (req.method === "initialize") {
      process.stdout.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: reqId,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {}, resources: {} },
            serverInfo: { name: "dev-house-mcp", version: "2.4.1" },
          },
        }) + "\n"
      );
      return;
    }

    if (req.method === "notifications/initialized") {
      return;
    }

    if (req.method === "tools/list") {
      process.stdout.write(
        JSON.stringify({ jsonrpc: "2.0", id: reqId, result: { tools: MCP_TOOLS_CATALOG } }) + "\n"
      );
      return;
    }

    if (req.method === "resources/list") {
      process.stdout.write(
        JSON.stringify({ jsonrpc: "2.0", id: reqId, result: { resources: MCP_RESOURCES_CATALOG } }) + "\n"
      );
      return;
    }

    if (req.method === "resources/read") {
      const { grantedScopes } = resolveStdioAuth();
      if (!grantedScopes.includes("read") && !grantedScopes.includes("admin")) {
        throw new Error("ForbiddenScopeError: Reading MCP resources requires 'read' scope");
      }
      const resource = mcpServer.readResource(String(req.params?.uri ?? ""));
      process.stdout.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: reqId,
          result: {
            contents: [
              {
                uri: resource.uri,
                mimeType: resource.mimeType,
                text:
                  typeof resource.content === "string"
                    ? resource.content
                    : JSON.stringify(resource.content, null, 2),
              },
            ],
          },
        }) + "\n"
      );
      return;
    }

    if (req.method === "tools/call") {
      const { grantedScopes, actor } = resolveStdioAuth();
      const toolName = String(req.params?.name ?? "");
      const args = (req.params?.arguments as Record<string, unknown>) ?? {};
      const out = await mcpServer.invokeTool({
        toolName,
        args,
        grantedScopes,
        actor,
      });
      process.stdout.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: reqId,
          result: { content: [{ type: "text", text: JSON.stringify(out, null, 2) }], data: out },
        }) + "\n"
      );
      return;
    }

    process.stdout.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: reqId,
        error: { code: -32601, message: `Method not found: ${req.method}` },
      }) + "\n"
    );
  } catch (err) {
    process.stdout.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: reqId,
        error: { code: -32603, message: err instanceof Error ? err.message : String(err) },
      }) + "\n"
    );
  }
});
