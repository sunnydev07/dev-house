import { createDevHouseHttpServer } from "./app.js";

const PORT = Number(process.env.PORT ?? 4000);
const server = createDevHouseHttpServer();

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[Dev House API & MCP Server] Listening on http://0.0.0.0:${PORT} (API: /api/v1, SSE: /api/v1/events/stream, MCP: /mcp)`);
});
