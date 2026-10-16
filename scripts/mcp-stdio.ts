/**
 * DevBoard MCP server over stdio, for clients that launch a local process (Claude Desktop, Gemini CLI, …).
 * It talks to a running DevBoard app over HTTP.
 *
 *   DEVBOARD_URL=http://localhost:3000 npx tsx scripts/mcp-stdio.ts
 *
 * stdout carries the protocol: log only to stderr.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createHttpApi } from "../src/lib/mcp/api";
import { createDevBoardMcpServer } from "../src/lib/mcp/server";

const url = process.env.DEVBOARD_URL ?? "http://localhost:3000";

async function main() {
  const server = createDevBoardMcpServer(createHttpApi(url));
  await server.connect(new StdioServerTransport());
  console.error(`[devboard-mcp] ready on stdio, using DevBoard at ${url}`);
}

main().catch((e) => {
  console.error("[devboard-mcp] failed to start:", e);
  process.exit(1);
});
