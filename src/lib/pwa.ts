"use client";

import { useSyncExternalStore } from "react";

export type Platform = "ios" | "android" | "macos" | "windows" | "other";
export type Browser = "safari" | "chrome" | "edge" | "firefox" | "samsung" | "other";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface PwaState {
  /** Client environment has been read (false on the server and during hydration). */
  ready: boolean;
  /** The browser offered a one-click install (Chrome/Edge on Windows, macOS, Android). */
  canPrompt: boolean;
  /** Already running as an installed app. */
  installed: boolean;
  /** Install needs HTTPS (or localhost). */
  secure: boolean;
  platform: Platform;
  browser: Browser;
}

const SERVER: PwaState = { ready: false, canPrompt: false, installed: false, secure: true, platform: "other", browser: "other" };
let state: PwaState = SERVER;
let deferred: BeforeInstallPromptEvent | null = null;
let started = false;
const listeners = new Set<() => void>();

const set = (patch: Partial<PwaState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export const usePwa = () => useSyncExternalStore(subscribe, () => state, () => SERVER);

function detect(): Pick<PwaState, "platform" | "browser"> {
  const ua = navigator.userAgent;
  // iPadOS 13+ reports itself as a Mac; touch points give it away.
  const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  // Android first: its UA never says iPhone/iPad, but a desktop with touch emulation would otherwise look like an iPad.
  const platform: Platform = /Android/.test(ua) ? "android" : /iPhone|iPad|iPod/.test(ua) || iPadOS ? "ios" : /Mac/.test(ua) ? "macos" : /Win/.test(ua) ? "windows" : "other";
  const browser: Browser = /Edg\//.test(ua) ? "edge" : /SamsungBrowser/.test(ua) ? "samsung" : /Firefox|FxiOS/.test(ua) ? "firefox" : /Chrome|CriOS/.test(ua) ? "chrome" : /Safari/.test(ua) ? "safari" : "other";
  return { platform, browser };
}

const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Call once on the client: reads the environment, captures the install prompt and registers the service worker. */
export function initPwa() {
  if (started) return;
  started = true;

  set({ ready: true, installed: isStandalone(), secure: window.isSecureContext, ...detect() });

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // keep the event so our own Install button can trigger it
    deferred = e as BeforeInstallPromptEvent;
    set({ canPrompt: true });
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    set({ canPrompt: false, installed: true });
  });
  window.matchMedia("(display-mode: standalone)").addEventListener("change", () => set({ installed: isStandalone() }));

  if ("serviceWorker" in navigator) {
    if (process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    } else {
      // A worker left over from a production run on this origin would serve stale assets over the dev server.
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
    }
  }
}

/** Shows the browser's native install dialog (only possible when `canPrompt`). */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferred) return "unavailable";
  const evt = deferred;
  deferred = null; // a prompt event can only be used once
  set({ canPrompt: false });
  await evt.prompt();
  return (await evt.userChoice).outcome;
}
