"use client";

import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { BOARD_STATUSES, PRIORITIES, PRIORITY_META, STATUS_META } from "@/lib/constants";
import { useTaskActions } from "@/lib/client";
import type { TaskDTO, TaskStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { StatusDot } from "@/components/task/badges";
import { TaskCard } from "./task-card";

type Col = (typeof BOARD_STATUSES)[number];

export function MobileBoard({ tasks, onOpen, onCreate, accentFor }: { tasks: TaskDTO[]; onOpen: (t: TaskDTO) => void; onCreate?: (status: TaskStatus) => void; accentFor?: (t: TaskDTO) => string | undefined }) {
  const { moveTask, update } = useTaskActions();
  const scroller = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Col>("TODO");
  const [moving, setMoving] = useState<TaskDTO | null>(null);

  const lane = (s: Col) => tasks.filter((t) => t.status === s).sort((a, b) => a.orderIndex - b.orderIndex);

  const selectTab = (s: Col) => {
    setTab(s);
    const el = scroller.current;
    el?.scrollTo({ left: BOARD_STATUSES.indexOf(s) * el.clientWidth, behavior: "smooth" });
  };
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const s = BOARD_STATUSES[Math.round(el.scrollLeft / el.clientWidth)];
    if (s && s !== tab) setTab(s);
  };

  const quickMove = (task: TaskDTO, status: Col) => {
    setMoving(null);
    if (status === task.status) return;
    // Positions are per project, so the neighbour must come from the task's own project (matters on the central board).
    const last = lane(status).filter((t) => t.projectId === task.projectId).at(-1);
    moveTask({ task, newStatus: status, prevTaskId: last?.id ?? null, nextTaskId: null });
  };

  return (
    <div className="flex h-full flex-col">
      <div role="tablist" aria-label="Board columns" className="grid shrink-0 grid-cols-4 gap-1 border-b bg-background p-2">
        {BOARD_STATUSES.map((s) => (
          <button key={s} role="tab" aria-selected={tab === s} onClick={() => selectTab(s)} className={cn("flex h-11 flex-col items-center justify-center rounded-md text-xs transition-colors", tab === s ? "bg-muted font-medium text-foreground" : "text-muted-foreground")}>
            <span>{STATUS_META[s].short}</span>
            <span className="text-[10px] opacity-70">{lane(s).length}</span>
          </button>
        ))}
      </div>

      <div ref={scroller} onScroll={onScroll} className="no-scrollbar flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain">
        {BOARD_STATUSES.map((s) => (
          <section key={s} aria-label={STATUS_META[s].label} className="scroll-thin h-full w-full shrink-0 snap-center overflow-y-auto px-3 py-3 pb-24">
            <div className="flex flex-col gap-2">
              {lane(s).map((t) => <TaskCard key={t.id} task={t} accent={accentFor?.(t)} onOpen={onOpen} onQuickMove={setMoving} />)}
              {lane(s).length === 0 && <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">Nothing in {STATUS_META[s].label}</p>}
            </div>
          </section>
        ))}
      </div>

      {onCreate && (
        <Button size="icon-lg" aria-label="New task" onClick={() => onCreate(tab)} className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-20 size-14 rounded-full shadow-lg">
        <Plus className="size-6" />
      </Button>
      )}

      <Sheet open={!!moving} onOpenChange={(v) => !v && setMoving(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]">
          {moving && (
            <>
              <SheetHeader>
                <SheetTitle className="text-base"><span className="font-mono text-xs text-muted-foreground">{moving.key}</span> Move task</SheetTitle>
                <SheetDescription className="line-clamp-2">{moving.title}</SheetDescription>
              </SheetHeader>
              <div className="grid gap-2 px-4">
                {BOARD_STATUSES.map((s) => (
                  <Button key={s} variant={s === moving.status ? "secondary" : "outline"} className="h-12 justify-start text-base" onClick={() => quickMove(moving, s)}>
                    <StatusDot status={s} className="size-2.5" />{STATUS_META[s].label}{s === moving.status && <span className="ml-auto text-xs text-muted-foreground">current</span>}
                  </Button>
                ))}
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {PRIORITIES.map((p) => (
                    <Button key={p} variant={p === moving.priority ? "secondary" : "outline"} size="lg" title={PRIORITY_META[p].label} onClick={() => { update.mutate({ task: moving, patch: { priority: p } }); setMoving(null); }}>{p}</Button>
                  ))}
                </div>
                <Button variant="ghost" className="h-11" onClick={() => { const t = moving; setMoving(null); onOpen(t); }}>Open details</Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
