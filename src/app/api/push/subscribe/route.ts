import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { badRequest } from "@/lib/api-utils";
import { pushSubscribeSchema, pushUnsubscribeSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

/** Registers (or refreshes) this device. Idempotent: the endpoint URL identifies the device. */
export async function POST(req: NextRequest) {
  const parsed = pushSubscribeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const { endpoint, keys, timezone } = parsed.data;
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }); } catch { return NextResponse.json({ error: "Unknown timezone" }, { status: 400 }); }
  const userAgent = req.headers.get("user-agent")?.slice(0, 300) ?? null;
  await db.pushSubscription.upsert({
    where: { endpoint },
    create: { endpoint, p256dh: keys.p256dh, auth: keys.auth, timezone, userAgent },
    update: { p256dh: keys.p256dh, auth: keys.auth, timezone, userAgent, lastSeenAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const parsed = pushUnsubscribeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  await db.pushSubscription.deleteMany({ where: { endpoint: parsed.data.endpoint } });
  return NextResponse.json({ ok: true });
}
