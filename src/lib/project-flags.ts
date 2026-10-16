"use client";

import { useSyncExternalStore } from "react";
import type { ProjectDTO } from "./types";

/**
 * Optimistic star/archive state. Starring or archiving shows up in the sidebar instantly instead of waiting for the
 * PATCH and the server re-render; an override is dropped as soon as the server's data agrees with it (or the PATCH fails).
 */
export interface ProjectFlags {
  starred?: boolean;
  archived?: boolean;
  starredAt?: string | null;
}

const EMPTY: ReadonlyMap<string, ProjectFlags> = new Map();
let overrides: ReadonlyMap<string, ProjectFlags> = EMPTY;
const listeners = new Set<() => void>();
const set = (next: Map<string, ProjectFlags>) => { overrides = next; listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export const useProjectFlags = () => useSyncExternalStore(subscribe, () => overrides, () => EMPTY);

export function setProjectFlags(key: string, patch: ProjectFlags) {
  const next = new Map(overrides);
  next.set(key, { ...next.get(key), ...patch });
  set(next);
}

export function clearProjectFlags(key: string) {
  if (!overrides.has(key)) return;
  const next = new Map(overrides);
  next.delete(key);
  set(next);
}

/** Drop overrides the server data has caught up with. */
export function reconcileProjectFlags(projects: ProjectDTO[]) {
  if (overrides.size === 0) return;
  const next = new Map(overrides);
  for (const [key, o] of overrides) {
    const p = projects.find((x) => x.key === key);
    if (!p || ((o.starred === undefined || o.starred === p.starred) && (o.archived === undefined || o.archived === p.archived))) next.delete(key);
  }
  if (next.size !== overrides.size) set(next);
}

/** Server projects with the optimistic overrides applied, in sidebar order (starred first by star time, the rest as given). */
export function applyProjectFlags(projects: ProjectDTO[], flags: ReadonlyMap<string, ProjectFlags>): ProjectDTO[] {
  if (flags.size === 0) return projects;
  const merged = projects.map((p) => {
    const o = flags.get(p.key);
    if (!o) return p;
    const archived = o.archived ?? p.archived;
    const starred = archived ? false : o.starred ?? p.starred;
    return { ...p, archived, starred, starredAt: starred ? o.starredAt ?? p.starredAt ?? new Date().toISOString() : null };
  });
  const starred = merged.filter((p) => p.starred).sort((a, b) => (a.starredAt ?? "").localeCompare(b.starredAt ?? ""));
  return [...starred, ...merged.filter((p) => !p.starred)];
}
