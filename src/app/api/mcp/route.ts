import { timingSafeEqual } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { getEnv } from "@/lib/env-file";
import { createHttpApi } from "@/lib/mcp/api";
import { createDevBoardMcpServer } from "@/lib/mcp/server";

export const dynamic = "force-dynamic";

/**
 * DevBoard MCP server over Streamable HTTP (stateless): POST /api/mcp with JSON-RPC.
 *
 * Security (the rest of DevBoard has no accounts, so this endpoint is the one door worth guarding):
 *  - MCP_API_KEY (required): every request must carry `Authorization: Bearer <key>` (or `x-api-key`). Until a key
 *    exists the endpoint answers 503; generate one from the sidebar (MCP access) or set it in `.env`.
 *  - Browser requests are refused unless same-origin or listed in MCP_ALLOWED_ORIGINS, which blocks a malicious web page
 *    from driving your board through your browser (DNS rebinding / CSRF). Native MCP clients send no Origin header.
 */

const jsonRpcError = (status: number, code: number, message: string, headers?: HeadersInit) =>
  Response.json({ jsonrpc: "2.0", error: { code, message }, id: null }, { status, headers });

function checkAuth(req: Request): Response | null {
  // Read live (process env, then .env on disk) so a key generated in the UI works without a restart.
  const key = getEnv("MCP_API_KEY");
  if (!key) return jsonRpcError(503, -32003, "MCP authentication is not configured: open DevBoard → MCP access to generate a key, or set MCP_API_KEY.");
  const header = req.headers.get("authorization") ?? "";
  const given = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : (req.headers.get("x-api-key") ?? "");
  const a = Buffer.from(given);
  const b = Buffer.from(key);
  const good = a.length === b.length && timingSafeEqual(a, b);
  return good ? null : jsonRpcError(401, -32001, "Unauthorized: send 'Authorization: Bearer <MCP_API_KEY>'.", { "WWW-Authenticate": 'Bearer realm="devboard-mcp"' });
}

function checkOrigin(req: Request): Response | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  const allowed = (process.env.MCP_ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  try {
    if (new URL(origin).host === req.headers.get("host") || allowed.includes(origin)) return null;
  } catch { /* malformed Origin → refuse */ }
  return jsonRpcError(403, -32002, "Origin not allowed. Add it to MCP_ALLOWED_ORIGINS if this is intentional.");
}

export async function POST(req: Request) {
  const denied = checkOrigin(req) ?? checkAuth(req);
  if (denied) return denied;

  // The tools call DevBoard's own REST API; by default that is this same server.
  const baseUrl = process.env.DEVBOARD_INTERNAL_URL ?? new URL(req.url).origin;
  const server = createDevBoardMcpServer(createHttpApi(baseUrl));
  // Stateless: a fresh server per request, JSON responses (no SSE stream to keep alive).
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    void server.close().catch(() => {});
  }
}

const methodNotAllowed = () => jsonRpcError(405, -32000, "This MCP endpoint is stateless: use POST with a JSON-RPC body.", { Allow: "POST" });
export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
