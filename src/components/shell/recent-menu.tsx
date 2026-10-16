"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns";
import { ChevronRight, Clock, Columns3, Search } from "lucide-react";
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
  project?: ProjectDTO;
}

/** Turns stored entries into display rows; drops anything whose project no longer exists. */
export function useResolvedRecent(projects: ProjectDTO[]): ResolvedRecent[] {
  const entries = useRecent();
  return useMemo(() => {
    const byKey = new Map(projects.map((p) => [p.key, p]));
    const rows: ResolvedRecent[] = [];
    for (const entry of entries) {
      if (entry.kind === "central") { rows.push({ entry, title: "All projects board", subtitle: "Board", href: "/board" }); continue; }
      const project = entry.projectKey ? byKey.get(entry.projectKey) : undefined;
      if (!project) continue;
      if (entry.kind === "board") rows.push({ entry, project, title: `${project.name} board`, subtitle: project.key, href: `/projects/${project.key}/board` });
      else if (entry.kind === "backlog") rows.push({ entry, project, title: `${project.name} backlog`, subtitle: project.key, href: `/projects/${project.key}/backlog` });
      else if (entry.taskKey) rows.push({ entry, project, title: entry.title ?? entry.taskKey, subtitle: entry.taskKey, href: `/projects/${project.key}/board?task=${entry.taskKey}` });
    }
    return rows;
  }, [entries, projects]);
}

const dayLabel = (ts: number) => (isToday(ts) ? "Today" : isYesterday(ts) ? "Yesterday" : "Earlier");

/** Project entries show the project's own tile; only the project-less "All projects board" gets a generic icon. */
function RowIcon({ r }: { r: ResolvedRecent }) {
  if (r.project) return <ProjectTile project={r.project} size="md" />;
  return <span className="grid size-6 shrink-0 place-items-center rounded bg-muted text-muted-foreground"><Columns3 className="size-3.5" /></span>;
}

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
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search recent items" className="h-8 pl-8" autoFocus />
        </div>
        <div className="scroll-thin -mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {groups.length === 0 ? (
            <p className="px-1 py-6 text-center text-sm text-muted-foreground">{rows.length === 0 ? "Boards, backlogs and tasks you open will show up here." : "No matches."}</p>
          ) : (
            groups.map((g) => (
              <div key={g.label} className="mb-2">
                <h3 className="px-1.5 py-1 text-xs font-medium text-muted-foreground">{g.label}</h3>
                <ul>
                  {g.items.map((r) => (
                    <li key={r.entry.id}>
                      <button type="button" onClick={() => go(r.href)} className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left hover:bg-muted">
                        <RowIcon r={r} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{r.title}</span>
                          <span className="block truncate text-xs text-muted-foreground" title={format(r.entry.ts, "PPpp")}>
                            {r.entry.kind === "task" ? `${r.subtitle} · ` : ""}{formatDistanceToNow(r.entry.ts, { addSuffix: true })}
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
