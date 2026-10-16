"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { ChevronRight, Download, Menu, Moon, Plus, Search, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { ProjectDTO } from "@/lib/types";
import { UiProvider, useUi } from "@/components/ui-state";
import { CreateTaskDialog } from "@/components/task/create-task-dialog";
import { TaskDetailSheet } from "@/components/task/task-detail-sheet";
import { Sidebar } from "./sidebar";
import { CommandPalette } from "./command-palette";
import { CreateProjectDialog } from "./create-project-dialog";
import { InstallDialog } from "@/components/pwa/install-dialog";
import { McpAccessDialog } from "@/components/mcp/mcp-access-dialog";
import { usePwa } from "@/lib/pwa";
import { initRecent, recordRecent } from "@/lib/recent";
import { applyProjectFlags, reconcileProjectFlags, useProjectFlags } from "@/lib/project-flags";

export function AppShell({ projects, children }: { projects: ProjectDTO[]; children: React.ReactNode }) {
  return (
    <Suspense>
      <UiProvider>
        <Shell projects={projects}>{children}</Shell>
      </UiProvider>
    </Suspense>
  );
}

function Shell({ projects: serverProjects, children }: { projects: ProjectDTO[]; children: React.ReactNode }) {
  // Star/archive show instantly (optimistic) and settle once the server data agrees.
  const flags = useProjectFlags();
  const projects = useMemo(() => applyProjectFlags(serverProjects, flags), [serverProjects, flags]);
  const active = useMemo(() => projects.filter((p) => !p.archived), [projects]); // archived projects are hidden from navigation
  useEffect(() => reconcileProjectFlags(serverProjects), [serverProjects]);
  const { openCreateTask, setPaletteOpen } = useUi();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    // Read after mount so server and first client render agree.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { setCollapsed(localStorage.getItem("sidebar-collapsed") === "1"); } catch {}
  }, []);
  const toggle = () => setCollapsed((c) => {
    try { localStorage.setItem("sidebar-collapsed", c ? "0" : "1"); } catch {}
    return !c;
  });

  // "c" opens the create-task dialog (when not typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || e.key !== "c") return;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.closest("[role=dialog]"))) return;
      e.preventDefault();
      openCreateTask({ projectKey: /^\/projects\/([^/]+)/.exec(pathname)?.[1] });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openCreateTask, pathname]);

  const projectKey = /^\/projects\/([^/]+)/.exec(pathname)?.[1];

  // Remember which boards/backlogs you open (powers the Recent flyout).
  useEffect(() => initRecent(), []);
  useEffect(() => {
    const m = /^\/projects\/([^/]+)\/(board|backlog)$/.exec(pathname);
    if (m) recordRecent({ id: `${m[2]}:${m[1].toUpperCase()}`, kind: m[2] as "board" | "backlog", projectKey: m[1].toUpperCase() });
    else if (pathname === "/board") recordRecent({ id: "central", kind: "central" });
  }, [pathname]);

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <aside className={`hidden shrink-0 border-r transition-[width] duration-150 lg:block ${collapsed ? "w-14" : "w-60"}`}>
        <Sidebar projects={active} collapsed={collapsed} onToggle={toggle} />
      </aside>

      <Sheet open={mobileNav} onOpenChange={setMobileNav}>
        <SheetContent side="left" className="w-64 p-0" showCloseButton={false}>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Projects and navigation</SheetDescription>
          <Sidebar projects={active} collapsed={false} onNavigate={() => setMobileNav(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu /></Button>
          <Breadcrumbs pathname={pathname} projects={projects} />
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" className="hidden w-56 justify-start text-muted-foreground sm:flex" onClick={() => setPaletteOpen(true)}>
              <Search /> Search…<kbd className="ml-auto rounded border bg-muted px-1 font-mono text-[10px]">⌘K</kbd>
            </Button>
            <Button variant="ghost" size="icon" className="sm:hidden" aria-label="Search" onClick={() => setPaletteOpen(true)}><Search /></Button>
            <InstallButton />
            <ThemeToggle />
            <Button size="sm" onClick={() => openCreateTask({ projectKey })} className="max-sm:hidden"><Plus />New task</Button>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>

      <CommandPalette projects={active} />
      <CreateTaskDialog projects={active} />
      <CreateProjectDialog />
      <InstallDialog />
      <McpAccessDialog />
      <TaskDetailSheet />
    </div>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  return (
    <Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
      {mounted && resolvedTheme === "light" ? <Moon /> : <Sun />}
    </Button>
  );
}

function Breadcrumbs({ pathname, projects }: { pathname: string; projects: ProjectDTO[] }) {
  const m = /^\/projects\/([^/]+)(?:\/(board|backlog))?/.exec(pathname);
  const central = pathname === "/board";
  const manage = pathname === "/projects";
  const docs = pathname === "/docs" || pathname.startsWith("/docs/");
  const crumbs: { label: string; href?: string }[] = [{ label: "Dashboard", href: m || central || manage || docs ? "/" : undefined }];
  if (central) crumbs.push({ label: "All projects board" });
  if (manage) crumbs.push({ label: "Projects" });
  if (docs) crumbs.push({ label: "Help & docs" });
  if (m) {
    const project = projects.find((p) => p.key === m[1].toUpperCase());
    crumbs.push({ label: project ? `${project.key} · ${project.name}` : m[1], href: `/projects/${m[1]}/board` });
    if (m[2]) crumbs.push({ label: m[2] === "board" ? "Board" : "Backlog" });
  }
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-sm">
      {crumbs.map((c, i) => (
        <span key={i} className="flex min-w-0 items-center gap-1">
          {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />}
          {c.href && i < crumbs.length - 1 ? (
            <Link href={c.href} className="truncate text-muted-foreground hover:text-foreground">{c.label}</Link>
          ) : (
            <span className="truncate font-medium">{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

/** Hidden once the app is installed; opens the platform-aware install guide otherwise. */
function InstallButton() {
  const { setInstallOpen } = useUi();
  const { ready, installed } = usePwa();
  if (!ready || installed) return null;
  return (
    <Button variant="ghost" size="icon" aria-label="Install app" title="Install DevBoard as an app" onClick={() => setInstallOpen(true)}>
      <Download />
    </Button>
  );
}
