import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { badRequest } from "@/lib/api-utils";
import { pushConfigured, sendPush } from "@/lib/push";
import { pushUnsubscribeSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

/** Sends a canned notification to one registered device, so you can confirm the whole chain works. */
export async function POST(req: NextRequest) {
  const parsed = pushUnsubscribeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  if (!pushConfigured()) return NextResponse.json({ error: "Push is not configured on the server (missing VAPID keys)." }, { status: 503 });
  const sub = await db.pushSubscription.findUnique({ where: { endpoint: parsed.data.endpoint } });
  if (!sub) return NextResponse.json({ error: "This device isn't registered. Turn notifications off and on again." }, { status: 404 });
  const ok = await sendPush(sub, { title: "DevBoard notifications are on", body: "You'll get reminders for due, overdue and urgent work.", url: "/", tag: "test" });
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "The push service rejected the message. Try turning notifications off and on again." }, { status: 502 });
}
