import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runNotifications } from "@/lib/notifications";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Sends every reminder that is due (due today, overdue, urgent, quiet projects).
 * Safe to call at any frequency: what was already sent is remembered. Vercel Cron calls it with
 * `Authorization: Bearer $CRON_SECRET`; any other scheduler can do the same.
 * With the secret you also get details and `?dry=1` (preview, sends nothing) / `?force=1` (ignore quiet hours and history).
 */
export async function GET(req: NextRequest) {
  const trusted = authorised(req);
  if (process.env.CRON_SECRET && !trusted) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = req.nextUrl.searchParams;
  const res = await runNotifications({ force: trusted && q.get("force") === "1", dry: trusted && q.get("dry") === "1" });
  return NextResponse.json(trusted ? res : { sent: res.sent.length });
}
