"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { usePwa } from "@/lib/pwa";
import { BookOpen, Columns3, ListChecks, Download, Settings2, FolderKanban, LayoutDashboard, ListTodo, Plus, FolderPlus } from "lucide-react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { api } from "@/lib/client";
import type { ProjectDTO, TaskDTO } from "@/lib/types";
import { useUi } from "@/components/ui-state";
import { DOC_LINKS } from "@/lib/docs-shared";
import { PriorityBadge, StatusDot, TypeIcon } from "@/components/task/badges";

export function CommandPalette({ projects }: { projects: ProjectDTO[] }) {
  const { paletteOpen, setPaletteOpen: setOpen, openCreateTask, setCreateProjectOpen, setInstallOpen, setTodoOpen } = useUi();
  const pwa = usePwa();
  const router = useRouter();
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");

  const setPaletteOpen = useCallback((v: boolean) => {
    setOpen(v);
    if (!v) { setInput(""); setQ(""); }
  }, [setOpen]);

  // ⌘K / Ctrl+K toggles the palette from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(!paletteOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen, setPaletteOpen]);

  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 150);
    return () => clearTimeout(t);
  }, [input]);


  const { data: tasks = [], isFetching } = useQuery({
    queryKey: ["palette-tasks", q],
    queryFn: () => api<TaskDTO[]>(`/api/tasks?limit=8&sort=recent${q ? `&q=${encodeURIComponent(q)}` : ""}`),
    enabled: paletteOpen,
    placeholderData: (prev) => prev,
  });

  const run = (fn: () => void) => { setPaletteOpen(false); fn(); };
  const needle = input.trim().toLowerCase();
  const match = (s: string) => !needle || s.toLowerCase().includes(needle);

  return (
    <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen} title="Command palette" description="Jump to projects or search tasks by key or title" className="sm:max-w-xl">
      {/* Filtering for static items is done by hand so server-side task results are never hidden by cmdk. */}
      <CommandInputWrapper input={input} setInput={setInput} loading={isFetching}>
        <CommandList className="max-h-[60dvh]">
          <CommandEmpty>No results.</CommandEmpty>

          {(match("create new task") || match("create new project") || match("dashboard home") || match("manage projects settings edit delete") || match("central board all projects tasks") || match("help docs documentation guide") || match("todo to-do checklist reminder") || (!pwa.installed && match("install app pwa download"))) && <CommandGroup heading="Actions">
            {match("create new task") && <CommandItem value="action-new-task" onSelect={() => run(() => openCreateTask())}><Plus />Create task<CommandShortcut>C</CommandShortcut></CommandItem>}
            {match("todo to-do checklist reminder add") && <CommandItem value="action-todos" onSelect={() => run(() => setTodoOpen(true))}><ListChecks />Open to-dos<CommandShortcut>T</CommandShortcut></CommandItem>}
            {match("create new project") && <CommandItem value="action-new-project" onSelect={() => run(() => setCreateProjectOpen(true))}><FolderPlus />Create project</CommandItem>}
            {!pwa.installed && match("install app pwa download") && <CommandItem value="action-install" onSelect={() => run(() => setInstallOpen(true))}><Download />Install DevBoard as an app</CommandItem>}
            {match("manage projects settings edit delete") && <CommandItem value="nav-projects" onSelect={() => run(() => router.push("/projects"))}><Settings2 />Manage projects</CommandItem>}
            {match("central board all projects tasks") && <CommandItem value="nav-central" onSelect={() => run(() => router.push("/board"))}><Columns3 />Go to all projects board</CommandItem>}
            {match("help docs documentation guide") && <CommandItem value="nav-docs" onSelect={() => run(() => router.push("/docs"))}><BookOpen />Help &amp; documentation</CommandItem>}
            {match("dashboard home") && <CommandItem value="nav-dashboard" onSelect={() => run(() => router.push("/"))}><LayoutDashboard />Go to dashboard</CommandItem>}
          </CommandGroup>}

          {needle && DOC_LINKS.some((d) => d.search.includes(needle)) && <CommandGroup heading="Documentation">
            {DOC_LINKS.filter((d) => d.search.includes(needle)).slice(0, 5).map((d) => (
              <CommandItem key={d.slug} value={`doc-${d.slug}`} onSelect={() => run(() => router.push(`/docs/${d.slug}`))}><BookOpen />{d.title}</CommandItem>
            ))}
          </CommandGroup>}

          {projects.some((p) => match(`${p.key} ${p.name}`)) && <CommandGroup heading="Projects">
            {projects.flatMap((p) => [
              match(`${p.key} ${p.name} board`) && (
                <CommandItem key={`${p.id}-b`} value={`${p.id}-board`} onSelect={() => run(() => router.push(`/projects/${p.key}/board`))}>
                  <FolderKanban style={{ color: p.color }} /><span className="font-mono text-xs text-muted-foreground">{p.key}</span>{p.name} · Board
                </CommandItem>
              ),
              match(`${p.key} ${p.name} backlog`) && (
                <CommandItem key={`${p.id}-l`} value={`${p.id}-backlog`} onSelect={() => run(() => router.push(`/projects/${p.key}/backlog`))}>
                  <ListTodo style={{ color: p.color }} /><span className="font-mono text-xs text-muted-foreground">{p.key}</span>{p.name} · Backlog
                </CommandItem>
              ),
            ])}
          </CommandGroup>}

          {tasks.length > 0 && (
            <>
              <CommandGroup heading={q ? "Tasks" : "Recent tasks"}>
                {tasks.map((t) => (
                  <CommandItem key={t.id} value={`task-${t.id}`} onSelect={() => run(() => { router.push(`/projects/${t.projectKey}/${t.status === "BACKLOG" ? "backlog" : "board"}?task=${t.key}`); })}>
                    <TypeIcon type={t.type} />
                    <span className="font-mono text-xs text-muted-foreground">{t.key}</span>
                    <span className="truncate">{t.title}</span>
                    <span className="ml-auto flex items-center gap-2"><PriorityBadge priority={t.priority} /><StatusDot status={t.status} /></span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandInputWrapper>
    </CommandDialog>
  );
}

import { Command } from "@/components/ui/command";

function CommandInputWrapper({ input, setInput, loading, children }: { input: string; setInput: (v: string) => void; loading: boolean; children: React.ReactNode }) {
  return (
    <Command shouldFilter={false} loop>
      <CommandInput value={input} onValueChange={setInput} placeholder={loading ? "Searching…" : "Search tasks by key or title, jump to a project…"} autoFocus />
      {children}
    </Command>
  );
}
