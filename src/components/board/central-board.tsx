"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { DndContext, DragOverlay, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { Plus, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CATEGORIES, CATEGORY_META } from "@/lib/constants";
import { useBoards, useTaskActions } from "@/lib/client";
import type { ColumnCategory, ColumnDTO, ProjectBoardDTO, TaskDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useIsDesktop } from "@/hooks/use-media-query";
import { useUi } from "@/components/ui-state";
import { applyFilters, BoardToolbar, emptyFilters } from "./board-toolbar";
import { MobileBoard } from "./mobile-board";
import { TaskCard } from "./task-card";

type Col = ColumnCategory;

/** Where a task goes when dropped into a status lane: the first column of that status in its own project. */
const targetColumn = (columns: ColumnDTO[] | undefined, category: Col) => columns?.find((c) => c.category === category);

/** Highest priority first, then by project, then the project's own manual order. */
const byPriority = (a: TaskDTO, b: TaskDTO) => a.priority.localeCompare(b.priority) || a.projectKey.localeCompare(b.projectKey) || a.orderIndex - b.orderIndex;

export function CentralBoard({ initialData }: { initialData: ProjectBoardDTO[] }) {
  const boards = useBoards(initialData);
  const { moveTask } = useTaskActions();
  const { openTask, openCreateTask } = useUi();
  const isDesktop = useIsDesktop();
  const [filters, setFilters] = useState(emptyFilters);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());

  // Tasks that sit in a column and aren't archived, across every project.
  const rows = useMemo(
    () => boards.map((b) => ({ project: b.project, columns: b.columns, tasks: b.tasks.filter((t) => t.columnId && !t.archivedAt) })),
    [boards],
  );
  const color = useMemo(() => new Map(rows.map((r) => [r.project.id, r.project.color])), [rows]);
  const columnsOf = useMemo(() => new Map(rows.map((r) => [r.project.id, r.columns])), [rows]);
  const accentFor = useCallback((t: TaskDTO) => color.get(t.projectId), [color]);

  const all = useMemo(() => rows.filter((r) => !hidden.has(r.project.key)).flatMap((r) => r.tasks), [rows, hidden]);
  const labels = useMemo(() => [...new Set(rows.flatMap((r) => r.tasks.flatMap((t) => t.labels)))].sort(), [rows]);
  const visible = useMemo(() => applyFilters(all, filters), [all, filters]);
  const onOpen = useCallback((t: { key: string }) => openTask(t.key), [openTask]);
  const create = useCallback((category: Col) => openCreateTask({ category }), [openCreateTask]);

  const done = all.filter((t) => t.status === "DONE").length;

  const toggle = (key: string) =>
    setHidden((cur) => {
      const next = new Set(cur);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 space-y-3 border-b px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="text-base font-semibold">All projects</h1>
          <p className="text-sm text-muted-foreground">
            {all.length} task{all.length === 1 ? "" : "s"} on boards · {done} done
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Projects">
          {rows.map(({ project, tasks }) => {
            const off = hidden.has(project.key);
            return (
              <button
                key={project.id}
                type="button"
                aria-pressed={!off}
                onClick={() => toggle(project.key)}
                title={project.name}
                className={cn("inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs", off ? "text-muted-foreground opacity-60" : "bg-muted/50")}
              >
                <span className="size-2 rounded-full" style={{ background: project.color }} />
                <span className="font-mono">{project.key}</span>
                <span className="text-muted-foreground">{tasks.length}</span>
              </button>
            );
          })}
        </div>

        <BoardToolbar filters={filters} onChange={setFilters} labels={labels} />
      </div>

      <div className="min-h-0 flex-1">
        {rows.length === 0 ? (
          <Empty title="No projects yet" text="Create a project from the sidebar to start tracking work." />
        ) : isDesktop === null ? (
          <div className="grid grid-cols-4 gap-3 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-64" />)}</div>
        ) : all.length === 0 ? (
          <Empty title="Nothing on the boards yet" text="Move tasks from a project's backlog to its board to see them here." />
        ) : isDesktop ? (
          <CentralColumns tasks={visible} columnsOf={columnsOf} accentFor={accentFor} onOpen={onOpen} onCreate={create} />
        ) : (
          <MobileBoard
            lanes={CATEGORIES.map((c) => ({ id: c, title: CATEGORY_META[c].label, category: c }))}
            laneOf={(t) => t.status}
            tasks={visible}
            accentFor={accentFor}
            showColumn
            onOpen={onOpen}
            onCreate={(lane) => create(lane as Col)}
            onMove={(task, lane, last) => {
              const col = targetColumn(columnsOf.get(task.projectId), lane as Col);
              if (col) moveTask({ task, columnId: col.id, prevTaskId: last?.id ?? null, nextTaskId: null });
            }}
          />
        )}
      </div>
    </div>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="grid h-full place-items-center p-6 text-center">
      <div className="max-w-sm">
        <Rocket className="mx-auto mb-3 size-8 text-muted-foreground" />
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}

function CentralColumns({ tasks, columnsOf, accentFor, onOpen, onCreate }: { tasks: TaskDTO[]; columnsOf: Map<string, ColumnDTO[]>; accentFor: (t: TaskDTO) => string | undefined; onOpen: (t: TaskDTO) => void; onCreate: (c: Col) => void }) {
  const { moveTask } = useTaskActions();
  const [activeId, setActiveId] = useState<string | null>(null);
  // After a drop the cache updates one tick later; show the card in its new lane meanwhile so it never snaps back.
  const [hold, setHold] = useState<{ taskId: string; status: Col; source: TaskDTO[] } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const shown = useMemo(() => (hold && hold.source === tasks ? tasks.map((t) => (t.id === hold.taskId ? { ...t, status: hold.status } : t)) : tasks), [tasks, hold]);
  const lanes = useMemo(() => {
    const l: Record<Col, TaskDTO[]> = { TODO: [], IN_PROGRESS: [], DONE: [] };
    for (const t of [...shown].sort(byPriority)) l[t.status as Col]?.push(t);
    return l;
  }, [shown]);
  const active = activeId ? tasks.find((t) => t.id === activeId) : undefined;

  const onDragStart = (e: DragStartEvent) => { setHold(null); setActiveId(String(e.active.id)); };
  const onDragEnd = ({ active: a, over }: DragEndEvent) => {
    setActiveId(null);
    const task = tasks.find((t) => t.id === a.id);
    if (!task || !over) return;
    const status = String(over.id).replace("col:", "") as Col;
    if (!CATEGORIES.includes(status) || status === task.status) return;
    // The card goes to the first column of that status in its own project, at the bottom.
    const column = targetColumn(columnsOf.get(task.projectId), status);
    if (!column) return;
    const last = tasks.filter((t) => t.columnId === column.id && t.id !== task.id).sort((x, y) => x.orderIndex - y.orderIndex).at(-1);
    moveTask({ task, columnId: column.id, prevTaskId: last?.id ?? null, nextTaskId: null });
    setHold({ taskId: task.id, status, source: tasks });
  };

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      <div className="grid h-full grid-cols-[repeat(3,minmax(17rem,1fr))] gap-3 overflow-x-auto p-4">
        {CATEGORIES.map((s) => (
          <Column key={s} status={s} tasks={lanes[s]} accentFor={accentFor} onOpen={onOpen} onCreate={onCreate} />
        ))}
      </div>
      <DragOverlay dropAnimation={null} zIndex={50}>{active ? <TaskCard task={active} accent={accentFor(active)} showColumn overlay /> : null}</DragOverlay>
    </DndContext>
  );
}

const Column = memo(function Column({ status, tasks, accentFor, onOpen, onCreate }: { status: Col; tasks: TaskDTO[]; accentFor: (t: TaskDTO) => string | undefined; onOpen: (t: TaskDTO) => void; onCreate: (c: Col) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status}` });
  const points = tasks.reduce((n, t) => n + (t.estimate ?? 0), 0);
  return (
    <section aria-label={CATEGORY_META[status].label} className={cn("flex min-h-0 min-w-64 flex-col rounded-xl border bg-muted/30", isOver && "border-foreground/30 bg-muted/60")}>
      <header className="flex items-center gap-2 px-3 py-2.5">
        <span className={cn("inline-block size-2 shrink-0 rounded-full", CATEGORY_META[status].dot)} />
        <h2 className="text-sm font-medium">{CATEGORY_META[status].label}</h2>
        <span className="text-xs text-muted-foreground">{tasks.length}</span>
        {points > 0 && <span className="text-xs text-muted-foreground">· {points} pts</span>}
        <Button variant="ghost" size="icon-xs" className="ml-auto" aria-label={`Add task to ${CATEGORY_META[status].label}`} onClick={() => onCreate(status)}><Plus /></Button>
      </header>
      <div ref={setNodeRef} className="scroll-thin flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {tasks.map((t) => <DraggableCard key={t.id} task={t} accent={accentFor(t)} onOpen={onOpen} />)}
        {tasks.length === 0 && <p className="grid flex-1 place-items-center rounded-lg border border-dashed py-6 text-xs text-muted-foreground">Drop tasks here</p>}
      </div>
    </section>
  );
});

const DraggableCard = memo(function DraggableCard({ task, accent, onOpen }: { task: TaskDTO; accent?: string; onOpen: (t: TaskDTO) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return <TaskCard ref={setNodeRef} task={task} accent={accent} showColumn onOpen={onOpen} dragging={isDragging} style={{ touchAction: "manipulation" }} {...attributes} {...listeners} />;
});
