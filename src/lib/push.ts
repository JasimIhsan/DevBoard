import webpush from "web-push";
import { db } from "./db";

export interface PushPayload {
  title: string;
  body: string;
  /** Where a click should take you (path inside the app). */
  url: string;
  /** Notifications with the same tag replace each other instead of stacking. */
  tag?: string;
  urgent?: boolean;
}

let configured: boolean | null = null;

/** True when VAPID keys are present. Web Push can't work without them. */
export function pushConfigured(): boolean {
  if (configured !== null) return configured;
  const { VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: priv, VAPID_SUBJECT: subject } = process.env;
  if (!pub || !priv) return (configured = false);
  webpush.setVapidDetails(subject || "https://github.com/JasimIhsan/DevBoard", pub, priv);
  return (configured = true);
}

export const vapidPublicKey = () => process.env.VAPID_PUBLIC_KEY ?? null;

type Sub = { id: string; endpoint: string; p256dh: string; auth: string };

/** Sends one notification. Returns true when the push service accepted it; drops subscriptions that no longer exist. */
export async function sendPush(sub: Sub, payload: PushPayload): Promise<boolean> {
  if (!pushConfigured()) return false;
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), {
      TTL: 60 * 60 * 12,
      urgency: payload.urgent ? "high" : "normal",
    });
    return true;
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) await db.pushSubscription.deleteMany({ where: { id: sub.id } }); // unsubscribed or expired
    return false;
  }
}
