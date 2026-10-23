"use client";

import { Suspense, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { ChevronRight, Download, ArrowLeft, Bell, ListChecks, Menu, Moon, Plus, RefreshCw, Search, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { ProjectDTO } from "@/lib/types";
import { UiProvider, useUi } from "@/components/ui-state";
import { CreateTaskDialog } from "@/components/task/create-task-dialog";
import { ConnectAiDialog } from "@/components/mcp/connect-ai-dialog";
import { NotificationsDialog } from "@/components/notifications/notifications-dialog";
import { syncPushSubscription, usePush } from "@/lib/push-client";
import { toast } from "sonner";
import { TodoSheet } from "@/components/todos/todo-sheet";
import { useOpenTodoCount } from "@/lib/todos";
import { TaskDetailSheet } from "@/components/task/task-detail-sheet";
import { Sidebar } from "./sidebar";
import { CommandPalette } from "./command-palette";
import { CreateProjectDialog } from "./create-project-dialog";
import { InstallDialog } from "@/components/pwa/install-dialog";
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
  const { openCreateTask, setPaletteOpen, setTodoOpen } = useUi();
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
      if (e.metaKey || e.ctrlKey || e.altKey || (e.key !== "c" && e.key !== "t")) return;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.closest("[role=dialog]"))) return;
      e.preventDefault();
      if (e.key === "t") setTodoOpen(true);
      else openCreateTask({ projectKey: /^\/projects\/([^/]+)/.exec(pathname)?.[1] });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openCreateTask, setTodoOpen, pathname]);

  const projectKey = /^\/projects\/([^/]+)/.exec(pathname)?.[1];

  // If this device already allowed notifications, keep the server's record of it (and the timezone) current.
  useEffect(() => { void syncPushSubscription(); }, []);

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
            <NotificationsButton />
            <TodoButton />
            <RefreshButton />
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
      <ConnectAiDialog />
      <NotificationsDialog />
      <NotificationsNudge />
      <TodoSheet />
      <TodoFab />
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
  const todos = pathname === "/todos";
  const docs = pathname === "/docs" || pathname.startsWith("/docs/");
  const crumbs: { label: string; href?: string }[] = [{ label: "Dashboard", href: m || central || manage || docs || todos ? "/" : undefined }];
  if (central) crumbs.push({ label: "All projects board" });
  if (manage) crumbs.push({ label: "Projects" });
  if (todos) crumbs.push({ label: "To-dos" });
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

const NUDGE_KEY = "devboard:notifications-nudged";

/** Bell in the top bar. Until notifications are on it also shows on phones and carries a dot, so it is hard to miss. */
function NotificationsButton() {
  const { setNotificationsOpen } = useUi();
  const { state } = usePush();
  const off = state.kind === "off";
  return (
    <Button variant="ghost" size="icon" className={off ? "relative" : "max-sm:hidden"} aria-label={off ? "Turn on notifications" : "Notifications"} title="Notifications" onClick={() => setNotificationsOpen(true)}>
      <Bell />
      {off && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary ring-2 ring-background" />}
    </Button>
  );
}

/**
 * Browsers only show the permission prompt in response to a tap, so we can't ask on load. Instead, once per device,
 * offer a toast whose button opens the dialog (where the next tap triggers the real prompt).
 */
function NotificationsNudge() {
  const { setNotificationsOpen } = useUi();
  const { state } = usePush();
  const offered = useRef(false);
  useEffect(() => {
    if (state.kind !== "off" || offered.current) return;
    offered.current = true;
    try { if (localStorage.getItem(NUDGE_KEY)) return; localStorage.setItem(NUDGE_KEY, "1"); } catch { return; }
    const t = setTimeout(() => toast("Get reminders for due and urgent work", { description: "Turn on notifications on this device.", duration: 12000, action: { label: "Turn on", onClick: () => setNotificationsOpen(true) } }), 2500);
    return () => clearTimeout(t);
  }, [state.kind, setNotificationsOpen]);
  return null;
}

/** Opens the to-do drawer; shows how many are still open. */
function TodoButton() {
  const { setTodoOpen } = useUi();
  const count = useOpenTodoCount();
  return (
    <Button variant="ghost" size="icon" className="relative max-sm:hidden" aria-label={`To-dos${count ? `, ${count} open` : ""}`} title="To-dos (T)" onClick={() => setTodoOpen(true)}>
      <ListChecks />
      {count > 0 && <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] leading-4 font-medium text-primary-foreground">{count > 99 ? "99+" : count}</span>}
    </Button>
  );
}

const LAST_PAGE_KEY = "devboard:page-before-todos";

/**
 * Phones: a big button on every page. On a normal page it opens the full To-dos page; on the To-dos page the same
 * spot becomes a "back" button that returns to where you were. Bottom-left; the board's "New task" button owns bottom-right.
 */
function TodoFab() {
  const router = useRouter();
  const pathname = usePathname();
  const count = useOpenTodoCount();
  const onTodos = pathname === "/todos";

  // Remember the last page that wasn't the to-do list (kept in sessionStorage so a reload on /todos still goes back).
  useEffect(() => {
    if (onTodos) return;
    try { sessionStorage.setItem(LAST_PAGE_KEY, pathname + window.location.search); } catch {}
  }, [pathname, onTodos]);

  const back = () => {
    let to = "/";
    try { to = sessionStorage.getItem(LAST_PAGE_KEY) || "/"; } catch {}
    router.push(to);
  };

  return (
    <Button
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-30 size-14 rounded-full shadow-lg sm:hidden"
      aria-label={onTodos ? "Back to previous page" : `To-dos${count ? `, ${count} open` : ""}`}
      onClick={onTodos ? back : () => router.push("/todos")}
    >
      {onTodos ? <ArrowLeft className="size-6" /> : <ListChecks className="size-6" />}
      {!onTodos && count > 0 && <span className="absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-full border-2 border-background bg-foreground px-1 text-[11px] leading-4 font-semibold text-background">{count > 99 ? "99+" : count}</span>}
    </Button>
  );
}

/** Refetches everything on the page: client queries (board, backlog, tasks) and server-rendered data (dashboard, project list). */
function RefreshButton() {
  const qc = useQueryClient();
  const router = useRouter();
  const [pending, start] = useTransition();
  const refresh = () => start(async () => {
    router.refresh();
    await qc.invalidateQueries();
  });
  return (
    <Button variant="ghost" size="icon" aria-label="Refresh data" title="Refresh data" disabled={pending} onClick={refresh}>
      <RefreshCw className={pending ? "animate-spin" : undefined} />
    </Button>
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
