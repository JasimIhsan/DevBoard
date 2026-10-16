import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { envFileWritable, upsertEnv } from "@/lib/env-file";
import { isSameOrigin } from "@/lib/setup";

export const dynamic = "force-dynamic";

/**
 * Generate (or rotate) the MCP API key and store it in `.env` as MCP_API_KEY.
 * The key is returned once; DevBoard never shows it again. Same-origin only, like the other settings endpoints.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Cross-origin request refused." }, { status: 403 });
  if (!envFileWritable()) return NextResponse.json({ error: "This deployment can't write .env. Set MCP_API_KEY in your hosting provider's environment settings instead." }, { status: 501 });
  const key = randomBytes(32).toString("hex");
  try {
    upsertEnv({ MCP_API_KEY: key });
  } catch (e) {
    return NextResponse.json({ error: `Couldn't write .env: ${(e as Error).message}` }, { status: 500 });
  }
  return NextResponse.json({ key });
}
