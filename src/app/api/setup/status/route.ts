import { NextResponse } from "next/server";
import { getSetupStatus } from "@/lib/setup";

export const dynamic = "force-dynamic";

/** Database, `.env` and MCP configuration state. Drives the first-run setup dialog and the MCP access dialog. */
export async function GET() {
  return NextResponse.json(await getSetupStatus());
}
