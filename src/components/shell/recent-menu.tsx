"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns";
import { ChevronRight, Clock, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { clearRecent, useRecent, type RecentEntry } from "@/lib/recent";
import type { ProjectDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ProjectTile } from "./project-tile";

export interface ResolvedRecent {
  entry: RecentEntry;
  title: string;
  subtitle: string;
  href: string;
  project: ProjectDTO;
}

/**
 * One row per project, newest first. Any visit counts (its board, backlog or one of its tasks), and the row opens
 * the board or backlog you were last on. Projects that no longer exist or are archived are dropped.
 */
export function useResolvedRecent(projects: ProjectDTO[]): ResolvedRecent[] {
  const entries = useRecent();
  return useMemo(() => {
    const byKey = new Map(projects.map((p) => [p.key, p]));
    const latest = new Map<string, RecentEntry>();
    for (const entry of entries) {
      if (!entry.projectKey || !byKey.has(entry.projectKey)) continue;
      const seen = latest.get(entry.projectKey);
      if (!seen || entry.ts > seen.ts) latest.set(entry.projectKey, entry);
    }
    return [...latest.entries()]
      .map(([key, entry]): ResolvedRecent => {
        const project = byKey.get(key)!;
        return { entry, project, title: project.name, subtitle: project.key, href: `/projects/${project.key}/${entry.kind === "backlog" ? "backlog" : "board"}` };
      })
      .sort((a, b) => b.entry.ts - a.entry.ts);
  }, [entries, projects]);
}

const dayLabel = (ts: number) => (isToday(ts) ? "Today" : isYesterday(ts) ? "Yesterday" : "Earlier");

/** Jira-style "Recent" row that opens a searchable flyout, grouped Today / Yesterday / Earlier. */
export function RecentMenu({ projects, collapsed, onNavigate }: { projects: ProjectDTO[]; collapsed: boolean; onNavigate?: () => void }) {
  const router = useRouter();
  const rows = useResolvedRecent(projects);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const needle = q.trim().toLowerCase();
  const filtered = needle ? rows.filter((r) => `${r.title} ${r.subtitle}`.toLowerCase().includes(needle)) : rows;
  const groups = ["Today", "Yesterday", "Earlier"].map((label) => ({ label, items: filtered.filter((r) => dayLabel(r.entry.ts) === label) })).filter((g) => g.items.length);

  const go = (href: string) => { setOpen(false); onNavigate?.(); router.push(href); };

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setQ(""); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Recent"
          className={cn("flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm transition-colors hover:bg-sidebar-accent", open ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground", collapsed && "justify-center px-0")}
        >
          <Clock className="size-4" />
          {!collapsed && <><span className="truncate">Recent</span><ChevronRight className="ml-auto size-3.5" /></>}
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" sideOffset={8} collisionPadding={12} className="flex max-h-[min(34rem,var(--radix-popover-content-available-height))] w-80 flex-col gap-2 p-3">
        <div className="flex items-center">
          <h2 className="text-sm font-semibold">Recent</h2>
          {rows.length > 0 && <button type="button" className="ml-auto text-xs text-muted-foreground hover:text-foreground" onClick={clearRecent}>Clear</button>}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search recent projects" className="h-8 pl-8" autoFocus />
        </div>
        <div className="scroll-thin -mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {groups.length === 0 ? (
            <p className="px-1 py-6 text-center text-sm text-muted-foreground">{rows.length === 0 ? "Projects you open will show up here." : "No matches."}</p>
          ) : (
            groups.map((g) => (
              <div key={g.label} className="mb-2">
                <h3 className="px-1.5 py-1 text-xs font-medium text-muted-foreground">{g.label}</h3>
                <ul>
                  {g.items.map((r) => (
                    <li key={r.entry.id}>
                      <button type="button" onClick={() => go(r.href)} className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left hover:bg-muted">
                        <ProjectTile project={r.project} size="md" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{r.title}</span>
                          <span className="block truncate text-xs text-muted-foreground" title={format(r.entry.ts, "PPpp")}>
                            {r.subtitle} · {formatDistanceToNow(r.entry.ts, { addSuffix: true })}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
