"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { Archive, ArchiveRestore, ArrowRight, ChevronDown, ChevronRight, FileUp, Flag, LayoutGrid, MoreHorizontal, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { api, qk, useBoard, useTaskActions } from "@/lib/client";
import { CATEGORY_META, PRIORITIES, PRIORITY_META } from "@/lib/constants";
import type { ColumnDTO, ProjectBoardDTO, TaskDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useUi } from "@/components/ui-state";
import { DueChip, LabelChip, PriorityBadge, TypeIcon } from "@/components/task/badges";
import { BoardToolbar, applyFilters, emptyFilters } from "@/components/board/board-toolbar";
import { ArchivedBanner } from "@/components/projects/archived-banner";
import { useConfirm } from "@/components/confirm-dialog";
import { ImportCsvDialog } from "./import-csv-dialog";

/** Where "Move to board" sends a task: the first To Do column (or the first column if none is marked To Do). */
const defaultColumn = (columns: ColumnDTO[]) => columns.find((c) => c.category === "TODO") ?? columns[0];

export function BacklogView({ projectKey, initialData }: { projectKey: string; initialData: ProjectBoardDTO }) {
  const { data } = useBoard(projectKey, initialData);
  const board = data ?? initialData;
  const canAdd = !board.project.archived; // archived project: viewable and movable, but no new tasks or imports
  const { update } = useTaskActions();
  const { openTask } = useUi();
  const [filters, setFilters] = useState(emptyFilters);
  const [importing, setImporting] = useState(false);
  // Multi-select: ids of ticked backlog tasks.
  const [rawSelected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const lastPicked = useRef<string | null>(null);

  const columns = board.columns;
  const start = defaultColumn(columns);
  const labels = useMemo(() => [...new Set(board.tasks.flatMap((t) => t.labels))].sort(), [board.tasks]);
  const backlog = useMemo(
    () => applyFilters(board.tasks.filter((t) => !t.columnId && !t.archivedAt), filters).sort((a, b) => a.priority.localeCompare(b.priority) || a.orderIndex - b.orderIndex),
    [board.tasks, filters],
  );
  const archived = useMemo(
    () => applyFilters(board.tasks.filter((t) => t.archivedAt), filters).sort((a, b) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? "")),
    [board.tasks, filters],
  );
  const onBoardCount = board.tasks.filter((t) => t.columnId && !t.archivedAt).length;
  const visibleIds = useMemo(() => backlog.map((t) => t.id), [backlog]);

  // Ticks for tasks that left the backlog, or that the filters hide, don't count.
  const selected = useMemo(() => {
    const visible = new Set(visibleIds);
    const kept = [...rawSelected].filter((id) => visible.has(id));
    return kept.length === rawSelected.size ? rawSelected : new Set(kept);
  }, [rawSelected, visibleIds]);

  const toggleSelect = useCallback((task: TaskDTO, range: boolean) => {
    setSelected((cur) => {
      const next = new Set(cur);
      const anchor = lastPicked.current;
      if (range && anchor && anchor !== task.id) {
        const a = visibleIds.indexOf(anchor);
        const b = visibleIds.indexOf(task.id);
        if (a >= 0 && b >= 0) visibleIds.slice(Math.min(a, b), Math.max(a, b) + 1).forEach((id) => next.add(id));
      } else if (next.has(task.id)) next.delete(task.id);
      else next.add(task.id);
      return next;
    });
    lastPicked.current = task.id;
  }, [visibleIds]);
  const setMany = useCallback((ids: string[], on: boolean) => setSelected((cur) => {
    const next = new Set(cur);
    ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
    return next;
  }), []);
  const clearSelection = useCallback(() => { setSelected(new Set()); lastPicked.current = null; }, []);

  // Esc clears the selection (unless a dialog or menu is open).
  useEffect(() => {
    if (selected.size === 0) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector("[role=dialog],[role=menu]")) clearSelection(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected.size, clearSelection]);

  const onOpenTask = useCallback((t: TaskDTO) => openTask(t.key), [openTask]);
  const moveToColumn = useCallback((task: TaskDTO, columnId: string | null) => update.mutate({ task, patch: { columnId } }), [update]);

  /** Moves several backlog tasks onto the board in one go, with one confirmation toast. */
  const moveMany = (ids: string[], column: ColumnDTO) => {
    const movers = board.tasks.filter((t) => ids.includes(t.id));
    movers.forEach((task) => update.mutate({ task, patch: { columnId: column.id }, silent: true }));
    toast.success(movers.length === 1 ? `${movers[0].key} → ${column.name}` : `Moved ${movers.length} tasks to ${column.name}`);
    clearSelection();
  };

  const rowProps = { columns, onOpen: onOpenTask, onMove: moveToColumn, selected, onToggleSelect: toggleSelect };

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      {!canAdd && <ArchivedBanner project={board.project} />}
      <div className="mx-auto max-w-5xl space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-auto text-base font-semibold">Backlog</h1>
          <Button asChild size="sm" variant="outline"><Link href={`/projects/${projectKey}/board`}><LayoutGrid />Board{onBoardCount > 0 && <span className="text-muted-foreground">{onBoardCount}</span>}</Link></Button>
          {canAdd && <Button size="sm" variant="outline" onClick={() => setImporting(true)}><FileUp />Import CSV</Button>}
        </div>
        <BoardToolbar filters={filters} onChange={setFilters} labels={labels} />
        {selected.size > 0 ? (
          <SelectionBar
            count={selected.size}
            columns={columns}
            onMove={(column) => moveMany([...selected], column)}
            onPriority={(p) => {
              const picked = board.tasks.filter((t) => selected.has(t.id) && t.priority !== p);
              picked.forEach((task) => update.mutate({ task, patch: { priority: p }, silent: true }));
              toast.success(`Set ${selected.size} task${selected.size === 1 ? "" : "s"} to ${PRIORITY_META[p].label}`);
              clearSelection();
            }}
            onClear={clearSelection}
          />
        ) : (
          backlog.length > 1 && <p className="hidden text-xs text-muted-foreground md:block">Tick tasks (or Ctrl/⌘-click, Shift-click for a range) to move several to the board at once.</p>
        )}

        <Section
          title="Backlog"
          subtitle="Ideas and upcoming work. Move a task to the board when you're ready to start it."
          tasks={backlog}
          quickAdd={canAdd ? projectKey : undefined}
          emptyText={filters.q || filters.priority !== "all" || filters.type !== "all" || filters.label !== "all" ? "No tasks match the filters" : "The backlog is empty. Add a task below."}
          onSelectMany={setMany}
          startColumn={start}
          {...rowProps}
        />

        {archived.length > 0 && <ArchivedSection tasks={archived} onOpen={onOpenTask} onRestore={(task) => update.mutate({ task, patch: { archived: false } })} />}
      </div>

      <ImportCsvDialog projectKey={projectKey} columns={columns} open={importing} onOpenChange={setImporting} />
    </div>
  );
}

interface SectionProps {
  title: string;
  subtitle?: string;
  tasks: TaskDTO[];
  quickAdd?: string;
  emptyText: string;
  columns: ColumnDTO[];
  startColumn?: ColumnDTO;
  onOpen: (t: TaskDTO) => void;
  onMove: (t: TaskDTO, columnId: string | null) => void;
  selected: ReadonlySet<string>;
  onToggleSelect: (t: TaskDTO, range: boolean) => void;
  onSelectMany: (ids: string[], on: boolean) => void;
}

function Section({ title, subtitle, tasks, quickAdd, emptyText, columns, startColumn, onOpen, onMove, selected, onToggleSelect, onSelectMany }: SectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const points = tasks.reduce((n, t) => n + (t.estimate ?? 0), 0);
  const picked = tasks.filter((t) => selected.has(t.id)).length;
  return (
    <section className="rounded-xl border bg-muted/20">
      <header className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <button onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? "Expand" : "Collapse"} className="text-muted-foreground">{collapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}</button>
        {tasks.length > 0 && (
          <Checkbox
            checked={picked === tasks.length ? true : picked > 0 ? "indeterminate" : false}
            onCheckedChange={() => onSelectMany(tasks.map((t) => t.id), picked !== tasks.length)}
            aria-label={`Select all tasks in ${title}`}
            className="size-4"
          />
        )}
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-xs text-muted-foreground">{tasks.length} task{tasks.length === 1 ? "" : "s"}{points > 0 && ` · ${points} pts`}</span>
        {subtitle && <span className="hidden min-w-0 truncate text-xs text-muted-foreground md:inline">· {subtitle}</span>}
      </header>
      {!collapsed && (
        <>
          <ul className="divide-y border-t">
            {tasks.map((t) => <Row key={t.id} task={t} columns={columns} startColumn={startColumn} onOpen={onOpen} onMove={onMove} selected={selected.has(t.id)} anySelected={selected.size > 0} onToggleSelect={onToggleSelect} />)}
            {tasks.length === 0 && <li className="px-4 py-5 text-center text-sm text-muted-foreground">{emptyText}</li>}
          </ul>
          {quickAdd && <QuickAdd projectKey={quickAdd} />}
        </>
      )}
    </section>
  );
}

const Row = memo(function Row({ task, columns, startColumn, onOpen, onMove, selected, anySelected, onToggleSelect }: {
  task: TaskDTO; columns: ColumnDTO[]; startColumn?: ColumnDTO;
  onOpen: (t: TaskDTO) => void; onMove: (t: TaskDTO, columnId: string | null) => void;
  selected: boolean; anySelected: boolean; onToggleSelect: (t: TaskDTO, range: boolean) => void;
}) {
  const { update, remove } = useTaskActions();
  const confirm = useConfirm();
  return (
    <li data-selected={selected || undefined} className={cn("group flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/40", selected && "bg-primary/10 hover:bg-primary/15")}>
      <Checkbox checked={selected} onCheckedChange={() => onToggleSelect(task, false)} onClick={(e) => { if (e.shiftKey) { e.preventDefault(); onToggleSelect(task, true); } }} aria-label={`Select ${task.key}`} className={cn("size-4 shrink-0 transition-opacity", !selected && !anySelected && "opacity-30 group-hover:opacity-100 focus-visible:opacity-100 max-lg:opacity-60")} />
      <TypeIcon type={task.type} />
      <button onClick={(e) => { if (e.shiftKey || e.metaKey || e.ctrlKey) onToggleSelect(task, e.shiftKey); else onOpen(task); }} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <span className="shrink-0 font-mono text-xs text-muted-foreground">{task.key}</span>
        <span className="truncate">{task.title}</span>
        <span className="hidden gap-1 md:flex">{task.labels.slice(0, 2).map((l) => <LabelChip key={l} label={l} />)}</span>
      </button>
      {task.dueDate && <span className="hidden sm:block"><DueChip date={task.dueDate} /></span>}
      {task.estimate != null && <span className="rounded-full bg-muted px-1.5 text-[11px] font-medium text-muted-foreground">{task.estimate}</span>}
      <PriorityBadge priority={task.priority} />
      {startColumn && (
        <Button size="xs" variant="outline" className="shrink-0" title={`Move to ${startColumn.name} on the board`} onClick={() => onMove(task, startColumn.id)}>
          <span className="hidden sm:inline">Move to board</span><ArrowRight className="sm:hidden" /><ArrowRight className="hidden sm:inline" />
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-xs" aria-label={`Actions for ${task.key}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={() => onOpen(task)}>Open details</DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Move to board…</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {columns.map((c) => <DropdownMenuItem key={c.id} onSelect={() => onMove(task, c.id)}><span className={cn("inline-block size-2 rounded-full", CATEGORY_META[c.category].dot)} />{c.name}</DropdownMenuItem>)}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Priority</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>{PRIORITIES.map((p) => <DropdownMenuItem key={p} onSelect={() => update.mutate({ task, patch: { priority: p } })}>{PRIORITY_META[p].label}</DropdownMenuItem>)}</DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={async () => {
              const ok = await confirm({ title: `Delete ${task.key}?`, description: <>This permanently deletes <b>{task.title}</b> with its subtasks and comments. It can&apos;t be undone.</>, confirmLabel: "Delete task", destructive: true });
              if (ok) remove.mutate(task);
            }}
          ><Trash2 />Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
});

function SelectionBar({ count, columns, onMove, onPriority, onClear }: { count: number; columns: ColumnDTO[]; onMove: (c: ColumnDTO) => void; onPriority: (p: (typeof PRIORITIES)[number]) => void; onClear: () => void }) {
  const first = defaultColumn(columns);
  return (
    <div role="toolbar" aria-label="Selected tasks" className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-xl border bg-background px-3 py-2 shadow-lg">
      <span className="text-sm font-medium">{count} selected</span>
      {first && <Button size="sm" onClick={() => onMove(first)}><ArrowRight />Move to board</Button>}
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button size="sm" variant="outline">Move to…<ChevronDown /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          {columns.map((c) => <DropdownMenuItem key={c.id} onSelect={() => onMove(c)}><span className={cn("inline-block size-2 rounded-full", CATEGORY_META[c.category].dot)} />{c.name}</DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button size="sm" variant="outline"><Flag />Priority</Button></DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          {PRIORITIES.map((p) => <DropdownMenuItem key={p} onSelect={() => onPriority(p)}>{PRIORITY_META[p].label}</DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button size="sm" variant="ghost" className="ml-auto" onClick={onClear}><X />Clear</Button>
    </div>
  );
}

function QuickAdd({ projectKey }: { projectKey: string }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const add = useMutation({
    mutationFn: (t: string) => api<TaskDTO>("/api/tasks", { method: "POST", json: { projectKey, title: t } }),
    onSuccess: (t) => toast.success(`Created ${t.key}`),
    onError: (e) => toast.error(e.message),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.board(projectKey) }),
  });
  return (
    <form className="flex items-center gap-2 border-t px-3 py-2" onSubmit={(e) => { e.preventDefault(); if (title.trim()) { add.mutate(title.trim()); setTitle(""); } }}>
      <Plus className="size-4 text-muted-foreground" />
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task to the backlog and press Enter" className="h-7 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0" aria-label="Quick add task" />
    </form>
  );
}

/** Done tasks that were archived: off the board, still Done. Open by default; restore puts one back in its Done column. */
function ArchivedSection({ tasks, onOpen, onRestore }: { tasks: TaskDTO[]; onOpen: (t: TaskDTO) => void; onRestore: (t: TaskDTO) => void }) {
  const [open, setOpen] = useState(true);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (window.location.hash === "#archived") ref.current?.scrollIntoView({ block: "start" });
  }, []);
  return (
    <section id="archived" ref={ref} className="scroll-mt-4 rounded-xl border">
      <button className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
        <Archive className="size-4 text-muted-foreground" />Archived
        <span className="text-xs font-normal text-muted-foreground">{tasks.length} done task{tasks.length === 1 ? "" : "s"} hidden from the board</span>
      </button>
      {open && (
        <ul className="divide-y border-t">
          {tasks.map((t) => (
            <li key={t.id} className="group flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/40">
              <TypeIcon type={t.type} />
              <button onClick={() => onOpen(t)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <span className="shrink-0 font-mono text-xs text-muted-foreground">{t.key}</span>
                <span className="truncate text-muted-foreground line-through decoration-muted-foreground/50">{t.title}</span>
              </button>
              <span className="hidden text-xs text-muted-foreground sm:block">{t.completedAt ? `Done ${format(new Date(t.completedAt), "MMM d")}` : "Done"}</span>
              {t.estimate != null && <span className="rounded-full bg-muted px-1.5 text-[11px] font-medium text-muted-foreground">{t.estimate}</span>}
              <PriorityBadge priority={t.priority} />
              <Button size="xs" variant="outline" className="shrink-0" onClick={() => onRestore(t)}><ArchiveRestore /><span className="hidden sm:inline">Restore</span></Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
