"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./client";

export type PushState =
  | { kind: "loading" }
  | { kind: "unsupported" } // browser has no Push API
  | { kind: "no-worker" } // service worker isn't running (it is off in `npm run dev`)
  | { kind: "no-keys" } // server has no VAPID keys
  | { kind: "denied" } // blocked in browser settings
  | { kind: "off" } // can be turned on
  | { kind: "on"; endpoint: string };

const supported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

const registration = () => navigator.serviceWorker.getRegistration("/");

function keyToBytes(base64Url: string) {
  const pad = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob((base64Url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const post = (sub: PushSubscription) =>
  api("/api/push/subscribe", { method: "POST", json: { ...sub.toJSON(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" } });

/** Keeps the server's copy of this device (and its timezone) fresh. Call once when the app loads. */
export async function syncPushSubscription() {
  try {
    if (!supported() || Notification.permission !== "granted") return;
    const reg = await registration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await post(sub);
  } catch { /* best effort */ }
}

async function readState(): Promise<PushState> {
  if (!supported()) return { kind: "unsupported" };
  const reg = await registration();
  if (!reg) return { kind: "no-worker" };
  const { publicKey } = await api<{ publicKey: string | null }>("/api/push/config");
  if (!publicKey) return { kind: "no-keys" };
  if (Notification.permission === "denied") return { kind: "denied" };
  const sub = await reg.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? { kind: "on", endpoint: sub.endpoint } : { kind: "off" };
}

export function usePush() {
  const [state, setState] = useState<PushState>({ kind: "loading" });
  const refresh = useCallback(async () => setState(await readState().catch(() => ({ kind: "unsupported" }) as PushState)), []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refresh(); }, [refresh]);

  const enable = async () => {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") { await refresh(); throw new Error("Permission wasn't granted."); }
    const reg = await registration();
    if (!reg) throw new Error("The service worker isn't running.");
    const { publicKey } = await api<{ publicKey: string | null }>("/api/push/config");
    if (!publicKey) throw new Error("The server has no push keys.");
    const options = { userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) };
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe(options);
    await post(sub);
    await refresh();
  };

  const disable = async () => {
    const sub = await (await registration())?.pushManager.getSubscription();
    if (sub) {
      await api("/api/push/subscribe", { method: "DELETE", json: { endpoint: sub.endpoint } }).catch(() => {});
      await sub.unsubscribe();
    }
    await refresh();
  };

  const sendTest = async () => {
    if (state.kind !== "on") return;
    await api("/api/push/test", { method: "POST", json: { endpoint: state.endpoint } });
  };

  return { state, enable, disable, sendTest };
}
