"use client";

import { useRef, useState } from "react";
import { Archive, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CATEGORY_META, PRIORITIES, PRIORITY_META } from "@/lib/constants";
import { useTaskActions } from "@/lib/client";
import type { ColumnCategory, TaskDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { TaskCard } from "./task-card";

/** One tab/page on the phone board: a project's column, or (all-projects board) a status category. */
export interface BoardLane {
  id: string;
  title: string;
  category: ColumnCategory;
}

/**
 * Phone board: tabs plus swipeable pages, one lane per page. `laneOf` says which lane a task is in; `onMove` is told
 * when the user picks another lane from the move sheet (the parent knows how to turn a lane into a column).
 */
export function MobileBoard({ lanes, laneOf, tasks, onOpen, onCreate, onMove, onArchive, accentFor, showColumn }: {
  lanes: BoardLane[];
  laneOf: (t: TaskDTO) => string | null;
  tasks: TaskDTO[];
  onOpen: (t: TaskDTO) => void;
  onCreate?: (laneId: string) => void;
  onMove: (task: TaskDTO, laneId: string, lastInLane: TaskDTO | undefined) => void;
  onArchive?: (t: TaskDTO) => void;
  accentFor?: (t: TaskDTO) => string | undefined;
  showColumn?: boolean;
}) {
  const { update } = useTaskActions();
  const scroller = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState(lanes[0]?.id ?? "");
  const [moving, setMoving] = useState<TaskDTO | null>(null);
  const active = lanes.some((l) => l.id === tab) ? tab : lanes[0]?.id ?? "";

  const lane = (id: string) => tasks.filter((t) => laneOf(t) === id).sort((a, b) => a.orderIndex - b.orderIndex);

  const selectTab = (id: string) => {
    setTab(id);
    const el = scroller.current;
    el?.scrollTo({ left: lanes.findIndex((l) => l.id === id) * el.clientWidth, behavior: "smooth" });
  };
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const l = lanes[Math.round(el.scrollLeft / el.clientWidth)];
    if (l && l.id !== tab) setTab(l.id);
  };

  const quickMove = (task: TaskDTO, laneId: string) => {
    setMoving(null);
    if (laneId === laneOf(task)) return;
    // Positions are per project, so the neighbour must come from the task's own project (matters on the central board).
    onMove(task, laneId, lane(laneId).filter((t) => t.projectId === task.projectId).at(-1));
  };

  return (
    <div className="flex h-full flex-col">
      <div role="tablist" aria-label="Board columns" className="no-scrollbar flex shrink-0 gap-1 overflow-x-auto border-b bg-background p-2">
        {lanes.map((l) => (
          <button key={l.id} role="tab" aria-selected={active === l.id} onClick={() => selectTab(l.id)} className={cn("flex h-11 min-w-[4.75rem] flex-1 flex-col items-center justify-center rounded-md px-2 text-xs transition-colors", active === l.id ? "bg-muted font-medium text-foreground" : "text-muted-foreground")}>
            <span className="max-w-24 truncate">{l.title}</span>
            <span className="text-[10px] opacity-70">{lane(l.id).length}</span>
          </button>
        ))}
      </div>

      <div ref={scroller} onScroll={onScroll} className="no-scrollbar flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain">
        {lanes.map((l) => (
          <section key={l.id} aria-label={l.title} className="scroll-thin h-full w-full shrink-0 snap-center overflow-y-auto px-3 py-3 pb-24">
            <div className="flex flex-col gap-2">
              {lane(l.id).map((t) => <TaskCard key={t.id} task={t} accent={accentFor?.(t)} showColumn={showColumn} onOpen={onOpen} onQuickMove={setMoving} onArchive={l.category === "DONE" ? onArchive : undefined} />)}
              {lane(l.id).length === 0 && <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">Nothing in {l.title}</p>}
            </div>
          </section>
        ))}
      </div>

      {onCreate && (
        <Button size="icon-lg" aria-label="New task" onClick={() => onCreate(active)} className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-20 size-14 rounded-full shadow-lg">
          <Plus className="size-6" />
        </Button>
      )}

      <Sheet open={!!moving} onOpenChange={(v) => !v && setMoving(null)}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]">
          {moving && (
            <>
              <SheetHeader>
                <SheetTitle className="text-base"><span className="font-mono text-xs text-muted-foreground">{moving.key}</span> Move task</SheetTitle>
                <SheetDescription className="line-clamp-2">{moving.title}</SheetDescription>
              </SheetHeader>
              <div className="grid gap-2 px-4">
                {lanes.map((l) => (
                  <Button key={l.id} variant={l.id === laneOf(moving) ? "secondary" : "outline"} className="h-12 justify-start text-base" onClick={() => quickMove(moving, l.id)}>
                    <span className={cn("inline-block size-2.5 rounded-full", CATEGORY_META[l.category].dot)} />{l.title}{l.id === laneOf(moving) && <span className="ml-auto text-xs text-muted-foreground">current</span>}
                  </Button>
                ))}
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {PRIORITIES.map((p) => (
                    <Button key={p} variant={p === moving.priority ? "secondary" : "outline"} size="lg" title={PRIORITY_META[p].label} onClick={() => { update.mutate({ task: moving, patch: { priority: p } }); setMoving(null); }}>{p}</Button>
                  ))}
                </div>
                {onArchive && moving.status === "DONE" && (
                  <Button variant="outline" className="h-11" onClick={() => { const t = moving; setMoving(null); onArchive(t); }}><Archive />Archive</Button>
                )}
                <Button variant="ghost" className="h-11" onClick={() => { const t = moving; setMoving(null); onOpen(t); }}>Open details</Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
