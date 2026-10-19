"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DndContext, DragOverlay, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { ArrowRightLeft, ChevronDown, ChevronRight, FileUp, Flag, GripVertical, MoreHorizontal, Play, Plus, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { api, qk, useBoard, useSprintActions, useTaskActions } from "@/lib/client";
import { PRIORITIES, PRIORITY_META, SPRINT_STATUS_META, STATUS_META } from "@/lib/constants";
import type { ProjectBoardDTO, SprintDTO, TaskDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useIsDesktop } from "@/hooks/use-media-query";
import { useUi } from "@/components/ui-state";
import { DueChip, LabelChip, PriorityBadge, StatusDot, TypeIcon } from "@/components/task/badges";
import { BoardToolbar, applyFilters, emptyFilters } from "@/components/board/board-toolbar";
import { ArchivedBanner } from "@/components/projects/archived-banner";
import { useConfirm } from "@/components/confirm-dialog";
import { CompleteSprintDialog, CreateSprintDialog, StartSprintDialog } from "./sprint-dialogs";
import { ImportCsvDialog } from "./import-csv-dialog";

const BACKLOG_ID = "section:backlog";
const STATUS_ORDER = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "BACKLOG"];

export function BacklogView({ projectKey, initialData }: { projectKey: string; initialData: ProjectBoardDTO }) {
  const { data } = useBoard(projectKey, initialData);
  const board = data ?? initialData;
  const canAdd = !board.project.archived; // archived: viewable and movable, but no new tasks, sprints or imports
  const { update } = useTaskActions();
  const isDesktop = useIsDesktop();
  const { openTask } = useUi();
  const [filters, setFilters] = useState(emptyFilters);
  const [creatingSprint, setCreatingSprint] = useState(false);
  const [importing, setImporting] = useState(false);
  const [starting, setStarting] = useState<SprintDTO | null>(null);
  const [completing, setCompleting] = useState<SprintDTO | null>(null);
  const [activeTask, setActiveTask] = useState<TaskDTO | null>(null);
  // Multi-select: ids of ticked tasks. Dragging one of them moves the whole selection.
  const [rawSelected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [dragIds, setDragIds] = useState<string[]>([]);
  const lastPicked = useRef<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // After a drop the cache updates one tick later (React Query batches notifications). Until it does, show the task in its
  // new section so it is already there for the drop animation to land on, rather than snapping back to the old one.
  const [hold, setHold] = useState<{ ids: ReadonlySet<string>; sprintId: string | null; source: TaskDTO[] } | null>(null);
  const shown = useMemo(
    () => (hold && hold.source === board.tasks ? board.tasks.map((t) => (hold.ids.has(t.id) ? { ...t, sprintId: hold.sprintId } : t)) : board.tasks),
    [board.tasks, hold],
  );
  const tasks = useMemo(() => applyFilters(shown, filters), [shown, filters]);
  const labels = useMemo(() => [...new Set(board.tasks.flatMap((t) => t.labels))].sort(), [board.tasks]);
  const live = useMemo(() => board.sprints.filter((s) => s.status !== "COMPLETED"), [board.sprints]);
  const completed = board.sprints.filter((s) => s.status === "COMPLETED");
  const sorted = (list: TaskDTO[], byPriority = false) =>
    [...list].sort((a, b) => (byPriority ? a.priority.localeCompare(b.priority) : STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)) || a.orderIndex - b.orderIndex);
  const backlogTasks = sorted(tasks.filter((t) => !t.sprintId), true);
  const nextName = `Sprint ${board.sprints.length + 1}`;

  // Visual order of every row on screen (sprints top to bottom, then backlog): shift-click selects a range in this order.
  const visualIds = useMemo(() => [...live.flatMap((s) => sorted(tasks.filter((t) => t.sprintId === s.id))), ...backlogTasks].map((t) => t.id), [live, tasks, backlogTasks]);

  // Ticks for tasks that no longer exist, or that the filters hide, don't count.
  const selected = useMemo(() => {
    const visible = new Set(visualIds);
    const kept = [...rawSelected].filter((id) => visible.has(id));
    return kept.length === rawSelected.size ? rawSelected : new Set(kept);
  }, [rawSelected, visualIds]);

  const toggleSelect = useCallback((task: TaskDTO, range: boolean) => {
    setSelected((cur) => {
      const next = new Set(cur);
      const anchor = lastPicked.current;
      if (range && anchor && anchor !== task.id) {
        const a = visualIds.indexOf(anchor);
        const b = visualIds.indexOf(task.id);
        if (a >= 0 && b >= 0) visualIds.slice(Math.min(a, b), Math.max(a, b) + 1).forEach((id) => next.add(id));
      } else if (next.has(task.id)) next.delete(task.id);
      else next.add(task.id);
      return next;
    });
    lastPicked.current = task.id;
  }, [visualIds]);

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

  /** Moves several tasks to a sprint (or the backlog) with one confirmation toast. Tasks already there are skipped. */
  const moveMany = useCallback((ids: string[], sprintId: string | null, announce = false) => {
    const movers = board.tasks.filter((t) => ids.includes(t.id) && t.sprintId !== sprintId);
    if (movers.length === 0) return 0;
    movers.forEach((task) => update.mutate({ task, patch: { sprintId }, silent: true }));
    setHold({ ids: new Set(movers.map((t) => t.id)), sprintId, source: board.tasks });
    const where = sprintId ? board.sprints.find((s) => s.id === sprintId)?.name ?? "sprint" : "Backlog";
    if (announce || movers.length > 1) toast.success(movers.length === 1 ? `${movers[0].key} → ${where}` : `Moved ${movers.length} tasks to ${where}`);
    return movers.length;
  }, [board.tasks, board.sprints, update]);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const ids = dragIds.length ? dragIds : [String(active.id)];
    setActiveTask(null);
    setDragIds([]);
    if (!over) return;
    const target = over.id === BACKLOG_ID ? null : String(over.id).replace("section:", "");
    if (moveMany(ids, target) > 0 && ids.length > 1) clearSelection();
  };

  const updateTask = update.mutate;
  const moveTo = useCallback((task: TaskDTO, sprintId: string | null) => updateTask({ task, patch: { sprintId } }), [updateTask]);
  const onOpenTask = useCallback((t: TaskDTO) => openTask(t.key), [openTask]);

  const rowProps = { sprints: live, onOpen: onOpenTask, onMove: moveTo, dndEnabled: !!isDesktop, selected, onToggleSelect: toggleSelect, onSelectMany: setMany };

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      {!canAdd && <ArchivedBanner project={board.project} />}
      <div className="mx-auto max-w-5xl space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-auto text-base font-semibold">Backlog</h1>
          {canAdd && <Button size="sm" variant="outline" onClick={() => setImporting(true)}><FileUp />Import CSV</Button>}
          {canAdd && <Button size="sm" variant="outline" onClick={() => setCreatingSprint(true)}><Plus />Create sprint</Button>}
        </div>
        <BoardToolbar filters={filters} onChange={setFilters} labels={labels} />
        {selected.size > 0 ? (
          <SelectionBar
            count={selected.size}
            sprints={live}
            onMove={(sprintId) => { moveMany([...selected], sprintId, true); clearSelection(); }}
            onPriority={(p) => {
              const picked = board.tasks.filter((t) => selected.has(t.id) && t.priority !== p);
              picked.forEach((task) => update.mutate({ task, patch: { priority: p }, silent: true }));
              toast.success(`Set ${selected.size} task${selected.size === 1 ? "" : "s"} to ${PRIORITY_META[p].label}`);
              clearSelection();
            }}
            onClear={clearSelection}
          />
        ) : (
          <p className="hidden text-xs text-muted-foreground md:block">Tick tasks (or Ctrl/⌘-click, Shift-click for a range) to move several at once. Drag any ticked task to take them all.</p>
        )}

        <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={(e) => {
          setHold(null);
          const id = String(e.active.id);
          setActiveTask(board.tasks.find((t) => t.id === id) ?? null);
          // Dragging a ticked task takes every ticked task with it; dragging an unticked one moves just that task.
          setDragIds(selected.has(id) ? visualIds.filter((v) => selected.has(v)) : [id]);
        }} onDragEnd={onDragEnd} onDragCancel={() => { setActiveTask(null); setDragIds([]); }}>
          {live.map((s) => {
            const list = sorted(tasks.filter((t) => t.sprintId === s.id));
            return (
              <Section
                key={s.id}
                id={`section:${s.id}`}
                title={s.name}
                badge={<Badge variant="outline" className={SPRINT_STATUS_META[s.status].className}>{SPRINT_STATUS_META[s.status].label}</Badge>}
                subtitle={[s.goal, s.startDate && s.endDate && `${format(new Date(s.startDate), "MMM d")} – ${format(new Date(s.endDate), "MMM d")}`].filter(Boolean).join(" · ")}
                tasks={list}
                action={
                  <>
                    {canAdd && s.status === "DRAFT" && <Button size="xs" onClick={() => setStarting(s)}><Play />Start sprint</Button>}
                    {canAdd && s.status === "ACTIVE" && <Button size="xs" variant="outline" onClick={() => setCompleting(s)}>Complete sprint</Button>}
                    {s.status === "DRAFT" && <DeleteSprintButton projectKey={projectKey} sprint={s} />}
                  </>
                }
                quickAdd={canAdd ? { projectKey, sprintId: s.id, status: s.status === "ACTIVE" ? "TODO" : "BACKLOG" } : undefined}
                {...rowProps}
              />
            );
          })}

          <Section id={BACKLOG_ID} title="Backlog" tasks={backlogTasks} subtitle="Unscheduled work, ordered by priority" quickAdd={canAdd ? { projectKey, sprintId: null, status: "BACKLOG" } : undefined} {...rowProps} />

          <DragOverlay dropAnimation={null} zIndex={50}>
            {activeTask ? (
              <div className="relative">
                {dragIds.length > 1 && <div className="absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-lg border bg-card opacity-70" />}
                <div className="relative flex cursor-grabbing items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm shadow-2xl ring-1 ring-foreground/10">
                  <span className="font-mono text-xs text-muted-foreground">{activeTask.key}</span>
                  <span className="truncate">{activeTask.title}</span>
                  {dragIds.length > 1 && <span className="ml-auto shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">{dragIds.length} tasks</span>}
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        {completed.length > 0 && <CompletedSprints sprints={completed} tasks={board.tasks} onOpen={(t) => openTask(t.key)} />}
      </div>

      <ImportCsvDialog projectKey={projectKey} sprints={board.sprints} open={importing} onOpenChange={setImporting} />
      <CreateSprintDialog key={nextName + creatingSprint} projectKey={projectKey} open={creatingSprint} onOpenChange={setCreatingSprint} suggestedName={nextName} />
      {starting && <StartSprintDialog projectKey={projectKey} sprint={starting} taskCount={board.tasks.filter((t) => t.sprintId === starting.id).length} open onOpenChange={(v) => !v && setStarting(null)} />}
      {completing && <CompleteSprintDialog projectKey={projectKey} sprint={completing} tasks={board.tasks.filter((t) => t.sprintId === completing.id)} otherSprints={board.sprints.filter((s) => s.status === "DRAFT")} open onOpenChange={(v) => !v && setCompleting(null)} />}
    </div>
  );
}

interface SectionProps {
  id: string;
  title: string;
  badge?: React.ReactNode;
  subtitle?: string;
  tasks: TaskDTO[];
  action?: React.ReactNode;
  quickAdd?: { projectKey: string; sprintId: string | null; status: "TODO" | "BACKLOG" };
  sprints: SprintDTO[];
  onOpen: (t: TaskDTO) => void;
  onMove: (t: TaskDTO, sprintId: string | null) => void;
  dndEnabled: boolean;
  selected: ReadonlySet<string>;
  onToggleSelect: (t: TaskDTO, range: boolean) => void;
  onSelectMany: (ids: string[], on: boolean) => void;
}

function Section({ id, title, badge, subtitle, tasks, action, quickAdd, sprints, onOpen, onMove, dndEnabled, selected, onToggleSelect, onSelectMany }: SectionProps) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const [collapsed, setCollapsed] = useState(false);
  const points = tasks.reduce((n, t) => n + (t.estimate ?? 0), 0);
  const picked = tasks.filter((t) => selected.has(t.id)).length;
  return (
    <section ref={setNodeRef} className={cn("rounded-xl border bg-muted/20", isOver && "border-foreground/40 bg-muted/50")}>
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
        {badge}
        <span className="text-xs text-muted-foreground">{tasks.length} task{tasks.length === 1 ? "" : "s"}{points > 0 && ` · ${points} pts`}</span>
        {subtitle && <span className="hidden min-w-0 truncate text-xs text-muted-foreground md:inline">· {subtitle}</span>}
        <span className="ml-auto flex items-center gap-2">{action}</span>
      </header>
      {!collapsed && (
        <>
          <ul className="divide-y border-t">
            {tasks.map((t) => <Row key={t.id} task={t} sprints={sprints} onOpen={onOpen} onMove={onMove} dndEnabled={dndEnabled} selected={selected.has(t.id)} anySelected={selected.size > 0} onToggleSelect={onToggleSelect} />)}
            {tasks.length === 0 && <li className="px-4 py-5 text-center text-sm text-muted-foreground">{dndEnabled ? (quickAdd ? "Drag tasks here or add one below" : "Drag tasks here") : "No tasks yet"}</li>}
          </ul>
          {quickAdd && <QuickAdd {...quickAdd} />}
        </>
      )}
    </section>
  );
}

const Row = memo(function Row({ task, sprints, onOpen, onMove, dndEnabled, selected, anySelected, onToggleSelect }: { task: TaskDTO; sprints: SprintDTO[]; onOpen: (t: TaskDTO) => void; onMove: (t: TaskDTO, sprintId: string | null) => void; dndEnabled: boolean; selected: boolean; anySelected: boolean; onToggleSelect: (t: TaskDTO, range: boolean) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, disabled: !dndEnabled });
  const { update, remove } = useTaskActions();
  const confirm = useConfirm();
  const done = task.status === "DONE";
  return (
    <li ref={setNodeRef} data-selected={selected || undefined} className={cn("group flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/40", selected && "bg-primary/10 hover:bg-primary/15", isDragging && "opacity-40")}>
      <Checkbox checked={selected} onCheckedChange={() => onToggleSelect(task, false)} onClick={(e) => { if (e.shiftKey) { e.preventDefault(); onToggleSelect(task, true); } }} aria-label={`Select ${task.key}`} className={cn("size-4 shrink-0 transition-opacity", !selected && !anySelected && "opacity-30 group-hover:opacity-100 focus-visible:opacity-100 max-lg:opacity-60")} />
      {dndEnabled && <span {...attributes} {...listeners} className="cursor-grab touch-none text-muted-foreground/50 hover:text-muted-foreground"><GripVertical className="size-4" /></span>}
      <TypeIcon type={task.type} />
      <button onClick={(e) => { if (e.shiftKey || e.metaKey || e.ctrlKey) onToggleSelect(task, e.shiftKey); else onOpen(task); }} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <span className="shrink-0 font-mono text-xs text-muted-foreground">{task.key}</span>
        <span className={cn("truncate", done && "text-muted-foreground line-through")}>{task.title}</span>
        <span className="hidden gap-1 md:flex">{task.labels.slice(0, 2).map((l) => <LabelChip key={l} label={l} />)}</span>
      </button>
      {task.dueDate && <span className="hidden sm:block"><DueChip date={task.dueDate} done={done} /></span>}
      {task.sprintId && <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><StatusDot status={task.status} /><span className="hidden lg:inline">{STATUS_META[task.status].short}</span></span>}
      {task.estimate != null && <span className="rounded-full bg-muted px-1.5 text-[11px] font-medium text-muted-foreground">{task.estimate}</span>}
      <PriorityBadge priority={task.priority} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-xs" aria-label={`Actions for ${task.key}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={() => onOpen(task)}>Open details</DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Move to…</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {task.sprintId && <DropdownMenuItem onSelect={() => onMove(task, null)}>Backlog</DropdownMenuItem>}
              {sprints.filter((s) => s.id !== task.sprintId).map((s) => <DropdownMenuItem key={s.id} onSelect={() => onMove(task, s.id)}>{s.name}</DropdownMenuItem>)}
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

function SelectionBar({ count, sprints, onMove, onPriority, onClear }: { count: number; sprints: SprintDTO[]; onMove: (sprintId: string | null) => void; onPriority: (p: (typeof PRIORITIES)[number]) => void; onClear: () => void }) {
  return (
    <div role="toolbar" aria-label="Selected tasks" className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-xl border bg-background px-3 py-2 shadow-lg">
      <span className="text-sm font-medium">{count} selected</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button size="sm" variant="outline"><ArrowRightLeft />Move to…</Button></DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuItem onSelect={() => onMove(null)}>Backlog</DropdownMenuItem>
          {sprints.map((s) => <DropdownMenuItem key={s.id} onSelect={() => onMove(s.id)}>{s.name}</DropdownMenuItem>)}
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

function QuickAdd({ projectKey, sprintId, status }: { projectKey: string; sprintId: string | null; status: "TODO" | "BACKLOG" }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const add = useMutation({
    mutationFn: (t: string) => api<TaskDTO>("/api/tasks", { method: "POST", json: { projectKey, title: t, sprintId, status } }),
    onSuccess: (t) => toast.success(`Created ${t.key}`),
    onError: (e) => toast.error(e.message),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.board(projectKey) }),
  });
  return (
    <form className="flex items-center gap-2 border-t px-3 py-2" onSubmit={(e) => { e.preventDefault(); if (title.trim()) { add.mutate(title.trim()); setTitle(""); } }}>
      <Plus className="size-4 text-muted-foreground" />
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task and press Enter" className="h-7 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0" aria-label="Quick add task" />
    </form>
  );
}

function DeleteSprintButton({ projectKey, sprint }: { projectKey: string; sprint: SprintDTO }) {
  const { act } = useSprintActions(projectKey);
  const confirm = useConfirm();
  return (
    <Button
      size="icon-xs"
      variant="ghost"
      aria-label={`Delete ${sprint.name}`}
      onClick={async () => {
        const ok = await confirm({ title: `Delete ${sprint.name}?`, description: "Its unfinished tasks return to the backlog. Completed tasks keep their status. This can\u2019t be undone.", confirmLabel: "Delete sprint", destructive: true });
        if (ok) act.mutate({ sprintId: sprint.id, action: "delete" }, { onSuccess: () => toast.success(`Deleted ${sprint.name}`) });
      }}
    >
      <Trash2 />
    </Button>
  );
}

function CompletedSprints({ sprints, tasks, onOpen }: { sprints: SprintDTO[]; tasks: TaskDTO[]; onOpen: (t: TaskDTO) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-xl border">
      <button className="flex w-full items-center gap-2 px-3 py-2.5 text-sm font-medium text-muted-foreground" onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}Completed sprints ({sprints.length})
      </button>
      {open && sprints.map((s) => {
        const list = tasks.filter((t) => t.sprintId === s.id);
        return (
          <div key={s.id} className="border-t px-3 py-2">
            <p className="text-sm font-medium">{s.name} <span className="text-xs font-normal text-muted-foreground">· {list.length} tasks</span></p>
            <ul className="mt-1 space-y-0.5">{list.map((t) => <li key={t.id}><button className="text-left text-xs text-muted-foreground hover:text-foreground" onClick={() => onOpen(t)}><span className="mr-2 font-mono">{t.key}</span>{t.title}</button></li>)}</ul>
          </div>
        );
      })}
    </section>
  );
}
