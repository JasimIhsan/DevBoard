"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { ChevronsLeft, ChevronsRight, Columns3, FolderKanban, LayoutDashboard, Bell, LifeBuoy, ListChecks, ListTodo, Plus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ProjectDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useUi } from "@/components/ui-state";
import { useOpenTodoCount } from "@/lib/todos";
import { ProjectTile } from "./project-tile";
import { StarButton } from "./star-button";
import { RecentMenu, useResolvedRecent } from "./recent-menu";

export function Sidebar({ projects, collapsed, onToggle, onNavigate }: { projects: ProjectDTO[]; collapsed: boolean; onToggle?: () => void; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { setCreateProjectOpen, setNotificationsOpen } = useUi();
  const todoCount = useOpenTodoCount();
  const currentKey = /^\/projects\/([^/]+)/.exec(pathname)?.[1]?.toUpperCase();
  // The few projects you touched most recently, each linking to where you last were in it.
  const recentRows = useResolvedRecent(projects);
  const recentProjects = useMemo(() => {
    const seen = new Set<string>();
    return recentRows.filter((r) => r.project && !seen.has(r.project.key) && seen.add(r.project.key)).slice(0, 3);
  }, [recentRows]);

  const item = (href: string, label: string, icon: React.ReactNode, active: boolean, extra?: React.ReactNode) => {
    const link = (
      <Link href={href} onClick={onNavigate} className={cn("flex h-8 items-center gap-2 rounded-md px-2 text-sm transition-colors hover:bg-sidebar-accent", active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground", collapsed && "justify-center px-0")}>
        {icon}
        {!collapsed && <span className="truncate">{label}</span>}
        {!collapsed && extra}
      </Link>
    );
    if (!collapsed) return link;
    return (
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    );
  };

  // Starred projects are pinned in their own group; the rest follow in creation order. (Props arrive already sorted.)
  const starred = projects.filter((p) => p.starred);
  const others = projects.filter((p) => !p.starred);

  const row = (p: ProjectDTO) => {
    const active = currentKey === p.key;
    return (
      <div key={p.id} className="group/row relative">
        {item(`/projects/${p.key}/board`, `${p.key} · ${p.name}`, <ProjectTile project={p} />, active && !collapsed ? false : active, <span className="ml-auto w-5 shrink-0" />)}
        {!collapsed && (
          <StarButton
            project={p}
            className={cn("absolute top-1 right-1", p.starred ? "opacity-100" : "opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100 max-lg:opacity-60")}
          />
        )}
        {active && !collapsed && (
          <div className="ml-4 mt-0.5 space-y-0.5 border-l pl-2">
            {item(`/projects/${p.key}/board`, "Board", <FolderKanban className="size-3.5" />, pathname.endsWith("/board"))}
            {item(`/projects/${p.key}/backlog`, "Backlog", <ListTodo className="size-3.5" />, pathname.endsWith("/backlog"))}
          </div>
        )}
      </div>
    );
  };

  return (
    <nav aria-label="Primary" className="flex h-full flex-col gap-1 bg-sidebar p-2 text-sidebar-foreground">
      <Link href="/" onClick={onNavigate} className={cn("mb-2 flex h-10 items-center gap-2 px-2 font-semibold tracking-tight", collapsed && "justify-center px-0")}>
        <span className="grid size-6 place-items-center rounded-md bg-primary text-primary-foreground"><FolderKanban className="size-3.5" /></span>
        {!collapsed && "DevBoard"}
      </Link>

      {item("/", "Dashboard", <LayoutDashboard className="size-4" />, pathname === "/")}
      {item("/board", "All projects board", <Columns3 className="size-4" />, pathname === "/board")}
      {item("/todos", "To-dos", <ListChecks className="size-4" />, pathname === "/todos", todoCount > 0 && <span className="ml-auto rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground">{todoCount}</span>)}
      <RecentMenu projects={projects} collapsed={collapsed} onNavigate={onNavigate} />

      {!collapsed && recentProjects.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Recent</div>
          {recentProjects.map((r) => (
            <Link key={r.project!.id} href={r.href} onClick={onNavigate} className="flex h-8 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent">
              <ProjectTile project={r.project!} />
              <span className="truncate">{r.project!.name}</span>
            </Link>
          ))}
        </div>
      )}

      {!collapsed && starred.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Starred</div>
          <div className="space-y-0.5">{starred.map(row)}</div>
        </div>
      )}

      <div className={cn("mt-4 mb-1 flex items-center px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground", collapsed && "justify-center px-0")}>
        {collapsed ? "Proj" : <Link href="/projects" onClick={onNavigate} className={cn("hover:text-foreground", pathname === "/projects" && "text-foreground")}>Projects</Link>}
        {!collapsed && (
          <>
            <Button asChild variant="ghost" size="icon-xs" className="ml-auto" aria-label="Manage projects" title="Manage projects"><Link href="/projects" onClick={onNavigate}><Settings2 /></Link></Button>
            <Button variant="ghost" size="icon-xs" aria-label="New project" onClick={() => setCreateProjectOpen(true)}><Plus /></Button>
          </>
        )}
      </div>

      <div className="scroll-thin flex-1 space-y-0.5 overflow-y-auto">
        {collapsed && starred.length > 0 && (
          <>
            {starred.map(row)}
            {others.length > 0 && <div className="mx-2 my-1 border-t" />}
          </>
        )}
        {others.map(row)}
        {collapsed && (
          <Button asChild variant="ghost" size="icon" className="mx-auto flex" aria-label="Manage projects"><Link href="/projects"><Settings2 /></Link></Button>
        )}
        {collapsed && (
          <Button variant="ghost" size="icon" className="mx-auto flex" aria-label="New project" onClick={() => setCreateProjectOpen(true)}><Plus /></Button>
        )}
      </div>

      <div className="mt-auto space-y-1">
        {(() => {
          const btn = (
            <button type="button" onClick={() => { setNotificationsOpen(true); onNavigate?.(); }} className={cn("flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent", collapsed && "justify-center px-0")}>
              <Bell className="size-4" />{!collapsed && <span className="truncate">Notifications</span>}
            </button>
          );
          return collapsed ? <Tooltip><TooltipTrigger asChild>{btn}</TooltipTrigger><TooltipContent side="right">Notifications</TooltipContent></Tooltip> : btn;
        })()}
        {item("/docs", "Help & docs", <LifeBuoy className="size-4" />, pathname.startsWith("/docs"))}
      </div>

      {onToggle && (
        <Button variant="ghost" size="sm" className={cn("justify-start justify-start text-muted-foreground", collapsed && "justify-center")} onClick={onToggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {collapsed ? <ChevronsRight /> : <><ChevronsLeft />Collapse</>}
        </Button>
      )}
    </nav>
  );
}
