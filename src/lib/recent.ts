"use client";

import { useSyncExternalStore } from "react";
import type { TaskType } from "./types";

/**
 * Things you opened or worked on, newest first (like Jira's "Recent").
 *
 * Stored on the server so it follows you between devices (there are no accounts: it is one list shared by every
 * device that opens this app). localStorage keeps an instant cache and holds writes that haven't reached the server yet,
 * so the list renders immediately, works offline, and a closed tab never loses a visit.
 */
export type RecentKind = "board" | "backlog" | "central" | "task";

export interface RecentEntry {
  id: string; // dedupe key, e.g. "board:CORE", "task:CORE-12"
  kind: RecentKind;
  projectKey?: string;
  taskKey?: string;
  title?: string; // task title
  taskType?: TaskType;
  ts: number;
}

const K_ENTRIES = "devboard:recent:v1";
const K_PENDING = "devboard:recent:pending:v1";
const K_CLEARED = "devboard:recent:cleared:v1";
const K_CLEAR_PENDING = "devboard:recent:clear-pending:v1";
const K_SYNCED = "devboard:recent:synced:v1";
const MAX = 60;
const FLUSH_DELAY_MS = 400;
const REFRESH_THROTTLE_MS = 10_000;
const MAX_BACKOFF_MS = 60_000;
const EMPTY: RecentEntry[] = [];

let entries: RecentEntry[] = EMPTY;
let pending = new Map<string, RecentEntry>(); // visits the server hasn't acknowledged
let clearedAt = 0; // visits at or before this were cleared
let started = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
let failures = 0; // consecutive failed flushes; drives the retry backoff
let lastRefresh = 0;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const useRecent = () => useSyncExternalStore(subscribe, () => entries, () => EMPTY);

const read = <T,>(key: string, fallback: T): T => {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
};
const write = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };

const valid = (e: unknown): e is RecentEntry => !!e && typeof (e as RecentEntry).id === "string" && typeof (e as RecentEntry).ts === "number";

/** Union by id (newest visit wins), drop anything cleared, newest first, capped. Never "replaces", so local writes survive a fetch. */
function merge(...lists: RecentEntry[][]): RecentEntry[] {
  const byId = new Map<string, RecentEntry>();
  for (const list of lists) {
    for (const e of list) {
      const cur = byId.get(e.id);
      if (!cur || e.ts >= cur.ts) byId.set(e.id, { ...cur, ...e, title: e.title ?? cur?.title, taskType: e.taskType ?? cur?.taskType });
    }
  }
  return [...byId.values()].filter((e) => e.ts > clearedAt).sort((a, b) => b.ts - a.ts).slice(0, MAX);
}

function persist() {
  write(K_ENTRIES, entries);
  write(K_PENDING, [...pending.values()]);
  write(K_CLEARED, clearedAt);
}

function loadFromStorage() {
  clearedAt = read<number>(K_CLEARED, 0);
  entries = merge(read<unknown[]>(K_ENTRIES, []).filter(valid));
  pending = new Map(read<unknown[]>(K_PENDING, []).filter(valid).map((e) => [e.id, e]));
}

/** Call once on the client. Reads the cache, then syncs with the server and keeps syncing on focus / reconnect. */
export function initRecent() {
  if (started) return;
  started = true;
  loadFromStorage();
  // First run on a device that predates server sync: upload everything it already has.
  if (!read<boolean>(K_SYNCED, false)) for (const e of entries) pending.set(e.id, e);
  emit();

  window.addEventListener("storage", (e) => {
    if (e.key === K_ENTRIES || e.key === K_PENDING || e.key === K_CLEARED) { loadFromStorage(); emit(); }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flush(true);
    else void refresh();
  });
  window.addEventListener("focus", () => void refresh());
  window.addEventListener("online", () => { failures = 0; void flush(); void refresh(true); });

  void flush().then(() => refresh(true));
}

/** Pull the shared list. Throttled: focus and visibility events can fire in bursts. */
async function refresh(force = false) {
  if (!force && Date.now() - lastRefresh < REFRESH_THROTTLE_MS) return;
  lastRefresh = Date.now();
  try {
    const res = await fetch("/api/recent", { cache: "no-store" });
    if (!res.ok) return;
    apply(await res.json());
  } catch {
    /* offline: keep what we have */
  }
}

function apply(server: { entries: RecentEntry[]; clearedAt: number }) {
  clearedAt = Math.max(clearedAt, server.clearedAt ?? 0);
  for (const [id, e] of pending) if (e.ts <= clearedAt) pending.delete(id);
  entries = merge(server.entries, entries, [...pending.values()]);
  persist();
  emit();
}

function scheduleFlush(delay = FLUSH_DELAY_MS) {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => void flush(), delay);
}

/** Send unacknowledged visits (and a pending "clear") to the server. Failures simply stay queued for the next flush. */
async function flush(keepalive = false) {
  if (flushing) return;
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  flushing = true;
  try {
    if (read<boolean>(K_CLEAR_PENDING, false)) {
      const r = await fetch("/api/recent", { method: "DELETE", keepalive });
      if (!r.ok) { failures++; return; }
      try { localStorage.removeItem(K_CLEAR_PENDING); } catch {}
    }
    if (pending.size === 0) { write(K_SYNCED, true); return; }
    const sent = [...pending.values()];
    const res = await fetch("/api/recent", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sent), keepalive });
    if (!res.ok) { failures++; return; }
    failures = 0;
    // Acknowledge only what we sent: a visit re-recorded while the request was in flight stays queued.
    for (const e of sent) if (pending.get(e.id)?.ts === e.ts) pending.delete(e.id);
    write(K_SYNCED, true);
    apply(await res.json());
  } catch {
    failures++; // offline or server down
  } finally {
    flushing = false;
    // Retry with exponential backoff (0.8s, 1.6s, 3.2s … up to a minute); a new visit or the 'online' event also triggers a flush.
    if (pending.size > 0 && !keepalive && navigator.onLine) scheduleFlush(Math.min(FLUSH_DELAY_MS * 2 ** failures, MAX_BACKOFF_MS));
  }
}

export function recordRecent(entry: Omit<RecentEntry, "ts">) {
  const prev = entries.find((e) => e.id === entry.id);
  // Skip a rewrite when it is already the newest and nothing changed (e.g. a re-render of the same page).
  if (prev && entries[0] === prev && prev.title === entry.title && Date.now() - prev.ts < 30_000) return;
  const next: RecentEntry = { ...entry, ts: Date.now() };
  entries = merge([next], entries);
  pending.set(next.id, next);
  persist();
  emit();
  scheduleFlush();
}

/** Working on a project's tasks (moving, editing) counts as activity in it, even if you never opened its page this session. */
export function touchRecentProject(projectKey: string) {
  const key = projectKey.toUpperCase();
  const latest = entries.find((e) => e.projectKey === key && (e.kind === "board" || e.kind === "backlog"));
  recordRecent(latest ? { id: latest.id, kind: latest.kind, projectKey: key } : { id: `board:${key}`, kind: "board", projectKey: key });
}

export function clearRecent() {
  clearedAt = Date.now();
  entries = EMPTY;
  pending.clear();
  write(K_CLEAR_PENDING, true);
  persist();
  emit();
  void flush();
}
