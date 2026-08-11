/**
 * MCP Server entry point for Report Flow.
 *
 * Parses command-line arguments for --api-key or uses REPORTFLOW_API_KEY env var.
 * Connects to StdioServerTransport and starts listening for MCP requests.
 *
 * Usage:
 *   npx tsx src/server/mcp-start.ts --api-key=rf_xxxxx
 *   REPORTFLOW_API_KEY=rf_xxxxx npx tsx src/server/mcp-start.ts
 */

import { createMcpServer } from "./mcp-server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// ── Parse CLI args ───────────────────────────────────────────────────────────

function parseArgs(): void {
  const args = process.argv.slice(2);
  for (const arg of args) {
    if (arg.startsWith("--api-key=")) {
      const key = arg.slice("--api-key=".length);
      if (key) {
        process.env["REPORTFLOW_API_KEY"] = key;
      }
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  parseArgs();

  const apiKey = process.env["REPORTFLOW_API_KEY"];
  if (!apiKey) {
    console.error(
      "Error: REPORTFLOW_API_KEY environment variable or --api-key flag required.\n" +
        "Usage: npx tsx src/server/mcp-start.ts --api-key=rf_xxxxx",
    );
    process.exit(1);
  }

  const server = createMcpServer();
  const transport = new StdioServerTransport();

  // Graceful shutdown
  const shutdown = async (): Promise<void> => {
    console.error("[MCP] Shutting down...");
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });

  // Handle uncaught errors to prevent silent crashes
  process.on("uncaughtException", (err) => {
    console.error("[MCP] Uncaught exception:", err);
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    console.error("[MCP] Unhandled rejection:", reason);
    process.exit(1);
  });

  await server.connect(transport);
  console.error("[MCP] Report Flow MCP server started on stdio");
}

main().catch((err) => {
  console.error("[MCP] Fatal error:", err);
  process.exit(1);
});
