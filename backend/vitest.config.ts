import { defineConfig } from "vitest/config";
import path from "node:path";

const packageEntry = (name: string): string =>
  path.resolve(__dirname, "packages", name, "src", "index.ts");

export default defineConfig({
  resolve: {
    alias: {
      "@devhouse/core": packageEntry("core"),
      "@devhouse/db": packageEntry("db"),
      "@devhouse/providers": packageEntry("providers"),
      "@devhouse/media": packageEntry("media"),
      "@devhouse/agents": packageEntry("agents"),
      "@devhouse/connectors": packageEntry("connectors"),
      "@devhouse/mcp": packageEntry("mcp"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
