import { NextResponse } from "next/server";
import { pushConfigured, vapidPublicKey } from "@/lib/push";

export const dynamic = "force-dynamic";

/** The public VAPID key the browser needs to subscribe. `null` means the server has no keys configured. */
export function GET() {
  return NextResponse.json({ publicKey: pushConfigured() ? vapidPublicKey() : null });
}
