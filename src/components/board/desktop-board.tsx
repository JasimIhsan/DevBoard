"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  closestCenter, DndContext, DragOverlay, getFirstCollision, KeyboardSensor, MeasuringStrategy, PointerSensor, pointerWithin, rectIntersection,
  useDroppable, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type UniqueIdentifier, type DragOverEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BOARD_STATUSES, STATUS_META } from "@/lib/constants";
import { useTaskActions } from "@/lib/client";
import type { TaskDTO, TaskStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { StatusDot } from "@/components/task/badges";
import { SortableTaskCard, TaskCard } from "./task-card";

type Col = (typeof BOARD_STATUSES)[number];
type Lanes = Record<Col, string[]>;
const AUTO_SCROLL = { threshold: { x: 0.12, y: 0.2 }, acceleration: 14 };
const MEASURING = { droppable: { strategy: MeasuringStrategy.WhileDragging } };

const colId = (s: Col) => `col:${s}`;
const isColId = (id: unknown): boolean => typeof id === "string" && id.startsWith("col:");

const groupIds = (tasks: TaskDTO[]): Lanes => {
  const lanes = { TODO: [], IN_PROGRESS: [], IN_REVIEW: [], DONE: [] } as Lanes;
  [...tasks].sort((a, b) => a.orderIndex - b.orderIndex).forEach((t) => lanes[t.status as Col]?.push(t.id));
  return lanes;
};

const findLane = (lanes: Lanes, id: unknown): Col | undefined => {
  if (isColId(id)) return (id as string).slice(4) as Col;
  return BOARD_STATUSES.find((s) => lanes[s].includes(id as string));
};

export function DesktopBoard({ tasks, onOpen, onCreate }: { tasks: TaskDTO[]; onOpen: (t: TaskDTO) => void; onCreate?: (status: TaskStatus) => void }) {
  const { moveTask } = useTaskActions();
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const base = useMemo(() => groupIds(tasks), [tasks]);
  const [drag, setDrag] = useState<Lanes | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Live drag snapshot while dragging; the latest data otherwise. After a drop, React Query publishes the optimistic update one tick later. Until `tasks` changes, keep showing the
  // post-drop layout; otherwise the card briefly snaps back to its old column and the drop animation flies there.
  const [hold, setHold] = useState<{ lanes: Lanes; tasks: TaskDTO[] } | null>(null);
  const lanes = activeId && drag ? drag : hold && hold.tasks === tasks ? hold.lanes : base;
  const lastOverId = useRef<UniqueIdentifier | null>(null);
  const justMovedLane = useRef(false);

  // After a cross-column move the layout shifts under the pointer; hold the last target for one frame to stop flicker.
  useEffect(() => {
    if (!justMovedLane.current) return;
    const id = requestAnimationFrame(() => { justMovedLane.current = false; });
    return () => cancelAnimationFrame(id);
  }, [drag]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const collision: CollisionDetection = (args) => {
    const pointer = pointerWithin(args);
    const hits = pointer.length ? pointer : rectIntersection(args);
    let overId = getFirstCollision(hits, "id");
    if (overId == null) return lastOverId.current ? [{ id: lastOverId.current }] : [];
    if (isColId(overId)) {
      const items = lanes[(overId as string).slice(4) as Col];
      if (items.length) {
        const nearest = closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => c.id !== overId && items.includes(c.id as string)) });
        overId = nearest[0]?.id ?? overId;
      }
    }
    if (justMovedLane.current && lastOverId.current) return [{ id: lastOverId.current }];
    lastOverId.current = overId;
    return [{ id: overId }];
  };

  const onDragStart = (e: DragStartEvent) => { setHold(null); lastOverId.current = null; setActiveId(String(e.active.id)); setDrag(base); };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    setDrag((cur) => {
      const l = cur ?? base;
      const from = findLane(l, active.id);
      const to = findLane(l, over.id);
      if (!from || !to || from === to) return cur;
      justMovedLane.current = true;
      const overItems = l[to];
      const overIndex = isColId(over.id) ? -1 : overItems.indexOf(String(over.id));
      const t = active.rect.current.translated;
      const below = !!t && t.top > over.rect.top + over.rect.height / 2;
      const at = overIndex >= 0 ? overIndex + (below ? 1 : 0) : overItems.length;
      return {
        ...l,
        [from]: l[from].filter((id) => id !== active.id),
        [to]: [...overItems.slice(0, at), String(active.id), ...overItems.slice(at)],
      };
    });
  };

  const commitDrag = ({ active, over }: DragEndEvent) => {
    const task = byId.get(String(active.id));
    const final: Lanes = { ...(drag ?? base) };
    if (over && task) {
      const from = findLane(final, active.id);
      const to = findLane(final, over.id);
      if (from && to && from === to) {
        const oldI = final[from].indexOf(String(active.id));
        const newI = isColId(over.id) ? final[to].length - 1 : final[to].indexOf(String(over.id));
        if (oldI !== newI && newI >= 0) final[to] = arrayMove(final[to], oldI, newI);
      }
      const col = findLane(final, active.id);
      if (col) {
        const list = final[col];
        const i = list.indexOf(String(active.id));
        const prev = list[i - 1] ?? null;
        const next = list[i + 1] ?? null;
        const baseList = base[col];
        const bi = baseList.indexOf(task.id);
        const unchanged = col === task.status && (baseList[bi - 1] ?? null) === prev && (baseList[bi + 1] ?? null) === next;
        if (!unchanged) {
          moveTask({ task, newStatus: col, prevTaskId: prev, nextTaskId: next });
          setHold({ lanes: final, tasks });
        }
      }
    }
  };

  // Always clear drag state, even if committing the move throws — a stuck snapshot would freeze the board.
  const onDragEnd = (e: DragEndEvent) => {
    try {
      commitDrag(e);
    } finally {
      setDrag(null);
      setActiveId(null);
      lastOverId.current = null;
    }
  };

  const activeTask = activeId ? byId.get(activeId) : undefined;

  return (
    <DndContext sensors={sensors} collisionDetection={collision} autoScroll={AUTO_SCROLL} measuring={MEASURING} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => { setDrag(null); setActiveId(null); lastOverId.current = null; }}>
      <div className="grid h-full grid-cols-[repeat(4,minmax(16rem,1fr))] gap-3 overflow-x-auto p-4">
        {BOARD_STATUSES.map((status) => (
          <Column key={status} status={status} ids={lanes[status]} byId={byId} onOpen={onOpen} onCreate={onCreate} highlight={!!activeId && lanes[status].includes(activeId)} />
        ))}
      </div>
      <DragOverlay dropAnimation={null} zIndex={50}>{activeTask ? <TaskCard task={activeTask} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}

const Column = memo(function Column({ status, ids, byId, onOpen, onCreate, highlight }: { status: Col; ids: string[]; byId: Map<string, TaskDTO>; onOpen: (t: TaskDTO) => void; onCreate?: (s: TaskStatus) => void; highlight: boolean }) {
  const { setNodeRef } = useDroppable({ id: colId(status) });
  const isOver = highlight;
  const items = ids.map((id) => byId.get(id)).filter((t): t is TaskDTO => !!t);
  const points = items.reduce((n, t) => n + (t.estimate ?? 0), 0);
  return (
    <section aria-label={STATUS_META[status].label} className={cn("flex min-h-0 min-w-64 flex-col rounded-xl border bg-muted/30 ", isOver && "border-foreground/30 bg-muted/60")}>
      <header className="flex items-center gap-2 px-3 py-2.5">
        <StatusDot status={status} />
        <h2 className="text-sm font-medium">{STATUS_META[status].label}</h2>
        <span className="text-xs text-muted-foreground">{items.length}</span>
        {points > 0 && <span className="text-xs text-muted-foreground">· {points} pts</span>}
        {onCreate && <Button variant="ghost" size="icon-xs" className="ml-auto" aria-label={`Add task to ${STATUS_META[status].label}`} onClick={() => onCreate(status)}><Plus /></Button>}
      </header>
      <div ref={setNodeRef} className="scroll-thin flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {items.map((t) => <SortableTaskCard key={t.id} task={t} onOpen={onOpen} />)}
        </SortableContext>
        {items.length === 0 && <p className="grid flex-1 place-items-center rounded-lg border border-dashed py-6 text-xs text-muted-foreground">Drop tasks here</p>}
      </div>
    </section>
  );
});
