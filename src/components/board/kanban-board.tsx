"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { differenceInCalendarDays, format } from "date-fns";
import { CalendarDays, Flag, ListTodo, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useBoard } from "@/lib/client";
import type { ProjectBoardDTO, TaskStatus } from "@/lib/types";
import { useIsDesktop } from "@/hooks/use-media-query";
import { useUi } from "@/components/ui-state";
import { CompleteSprintDialog } from "@/components/backlog/sprint-dialogs";
import { ArchivedBanner } from "@/components/projects/archived-banner";
import { applyFilters, BoardToolbar, emptyFilters } from "./board-toolbar";
import { DesktopBoard } from "./desktop-board";
import { MobileBoard } from "./mobile-board";

export function KanbanBoard({ projectKey, initialData }: { projectKey: string; initialData: ProjectBoardDTO }) {
  const { data } = useBoard(projectKey, initialData);
  const { openTask, openCreateTask } = useUi();
  const isDesktop = useIsDesktop();
  const [filters, setFilters] = useState(emptyFilters);
  const [completing, setCompleting] = useState(false);

  const board = data ?? initialData;
  const archived = board.project.archived; // archived: viewable, but no new tasks or sprint changes
  const sprint = board.sprints.find((s) => s.status === "ACTIVE");
  const sprintTasks = useMemo(() => (sprint ? board.tasks.filter((t) => t.sprintId === sprint.id && t.status !== "BACKLOG") : []), [board.tasks, sprint]);
  const visible = useMemo(() => applyFilters(sprintTasks, filters), [sprintTasks, filters]);
  const labels = useMemo(() => [...new Set(sprintTasks.flatMap((t) => t.labels))].sort(), [sprintTasks]);

  const sprintId = sprint?.id;
  const onOpen = useCallback((t: { key: string }) => openTask(t.key), [openTask]);
  const create = useCallback((status: TaskStatus) => openCreateTask({ projectKey, status, sprintId }), [openCreateTask, projectKey, sprintId]);

  if (!sprint) {
    return (
      <div className="flex h-full flex-col">
        {archived && <ArchivedBanner project={board.project} />}
        <div className="grid min-h-0 flex-1 place-items-center p-6">
        <div className="max-w-sm text-center">
          <Rocket className="mx-auto mb-3 size-8 text-muted-foreground" />
          <h2 className="text-lg font-semibold">No active sprint</h2>
          <p className="mt-1 text-sm text-muted-foreground">Plan a sprint in the backlog and start it to populate this board.</p>
          <Button asChild className="mt-4"><Link href={`/projects/${projectKey}/backlog`}><ListTodo />Go to backlog</Link></Button>
        </div>
      </div>
        </div>
    );
  }

  const done = sprintTasks.filter((t) => t.status === "DONE").length;
  const pct = sprintTasks.length ? Math.round((done / sprintTasks.length) * 100) : 0;
  const points = sprintTasks.reduce((n, t) => n + (t.estimate ?? 0), 0);
  const pointsDone = sprintTasks.filter((t) => t.status === "DONE").reduce((n, t) => n + (t.estimate ?? 0), 0);
  const daysLeft = sprint.endDate ? differenceInCalendarDays(new Date(sprint.endDate), new Date()) : null;

  return (
    <div className="flex h-full flex-col">
      {archived && <ArchivedBanner project={board.project} />}
      <div className="shrink-0 space-y-3 border-b px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="text-base font-semibold">{sprint.name}</h1>
          {sprint.goal && <p className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground"><Flag className="size-3.5 shrink-0" /><span className="truncate">{sprint.goal}</span></p>}
          <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
            {sprint.endDate && (
              <span className="flex items-center gap-1"><CalendarDays className="size-3.5" />{sprint.startDate && `${format(new Date(sprint.startDate), "MMM d")} – `}{format(new Date(sprint.endDate), "MMM d")}{daysLeft !== null && <b className={daysLeft < 0 ? "text-red-400" : daysLeft <= 2 ? "text-amber-400" : ""}> ({daysLeft < 0 ? `${-daysLeft}d overdue` : `${daysLeft}d left`})</b>}</span>
            )}
            {!archived && <Button size="xs" variant="outline" onClick={() => setCompleting(true)}>Complete sprint</Button>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Progress value={pct} className="h-1.5 flex-1" />
          <span className="shrink-0 text-xs text-muted-foreground">{done}/{sprintTasks.length} tasks · {pointsDone}/{points} pts</span>
        </div>
        <BoardToolbar filters={filters} onChange={setFilters} labels={labels} />
      </div>

      <div className="min-h-0 flex-1">
        {isDesktop === null ? (
          <div className="grid grid-cols-4 gap-3 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-64" />)}</div>
        ) : isDesktop ? (
          <DesktopBoard tasks={visible} onOpen={onOpen} onCreate={archived ? undefined : create} />
        ) : (
          <MobileBoard tasks={visible} onOpen={onOpen} onCreate={archived ? undefined : create} />
        )}
      </div>

      <CompleteSprintDialog key={String(completing)} projectKey={projectKey} sprint={sprint} tasks={sprintTasks} otherSprints={board.sprints.filter((s) => s.status === "DRAFT")} open={completing} onOpenChange={setCompleting} />
    </div>
  );
}
