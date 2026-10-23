"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { Archive, ListTodo, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useBoard, useColumnActions, useTaskActions } from "@/lib/client";
import type { ColumnDTO, ProjectBoardDTO, TaskDTO } from "@/lib/types";
import { useIsDesktop } from "@/hooks/use-media-query";
import { useUi } from "@/components/ui-state";
import { useConfirm } from "@/components/confirm-dialog";
import { ArchivedBanner } from "@/components/projects/archived-banner";
import { BacklogSheet } from "@/components/backlog/backlog-sheet";
import { applyFilters, BoardToolbar, emptyFilters } from "./board-toolbar";
import { ColumnDialog, type ColumnDialogState } from "./column-dialogs";
import type { ColumnActions } from "./column-menu";
import { DesktopBoard } from "./desktop-board";
import { MobileBoard } from "./mobile-board";

export function KanbanBoard({ projectKey, initialData }: { projectKey: string; initialData: ProjectBoardDTO }) {
  const { data } = useBoard(projectKey, initialData);
  const { openTask, openCreateTask } = useUi();
  const { moveTask, update } = useTaskActions();
  const columnApi = useColumnActions(projectKey);
  const confirm = useConfirm();
  const isDesktop = useIsDesktop();
  const [filters, setFilters] = useState(emptyFilters);
  const [dialog, setDialog] = useState<ColumnDialogState>(null);
  // The backlog opens as a simple side sheet (add, list, move) instead of leaving the board.
  const [backlogOpen, setBacklogOpen] = useState(false);

  const board = data ?? initialData;
  const readOnly = board.project.archived; // archived project: viewable, but no new tasks or columns
  const columns = board.columns;
  // The board shows tasks that sit in a column and haven't been archived.
  const onBoard = useMemo(() => board.tasks.filter((t) => t.columnId && !t.archivedAt), [board.tasks]);
  const visible = useMemo(() => applyFilters(onBoard, filters), [onBoard, filters]);
  const labels = useMemo(() => [...new Set(onBoard.flatMap((t) => t.labels))].sort(), [onBoard]);
  const backlogCount = board.tasks.filter((t) => !t.columnId).length;
  const archivedCount = board.tasks.filter((t) => t.archivedAt).length;

  const onOpen = useCallback((t: { key: string }) => openTask(t.key), [openTask]);
  const create = useCallback((columnId: string) => openCreateTask({ projectKey, columnId }), [openCreateTask, projectKey]);
  const archive = useCallback((task: TaskDTO) => update.mutate({ task, patch: { archived: true } }), [update]);

  const done = onBoard.filter((t) => t.status === "DONE").length;
  const pct = onBoard.length ? Math.round((done / onBoard.length) * 100) : 0;
  const points = onBoard.reduce((n, t) => n + (t.estimate ?? 0), 0);
  const pointsDone = onBoard.filter((t) => t.status === "DONE").reduce((n, t) => n + (t.estimate ?? 0), 0);

  const actions: ColumnActions | undefined = readOnly
    ? undefined
    : {
        rename: (c) => setDialog({ mode: "rename", column: c }),
        remove: (c) => setDialog({ mode: "delete", column: c }),
        move: (c, direction) => columnApi.update.mutate({ id: c.id, direction }),
        archiveAll: async (c: ColumnDTO) => {
          const n = onBoard.filter((t) => t.columnId === c.id).length;
          const ok = await confirm({ title: `Archive ${n} task${n === 1 ? "" : "s"} in ${c.name}?`, description: "They disappear from the board but stay Done, and are listed under Archived below the backlog. You can restore them any time.", confirmLabel: "Archive" });
          if (ok) columnApi.archiveAll.mutate(c.id);
        },
      };

  return (
    <div className="flex h-full flex-col">
      {readOnly && <ArchivedBanner project={board.project} />}
      <div className="shrink-0 space-y-3 border-b px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="text-base font-semibold">Board</h1>
          <p className="text-sm text-muted-foreground">{onBoard.length} task{onBoard.length === 1 ? "" : "s"} · {done} done{points > 0 && ` · ${pointsDone}/${points} pts`}</p>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {!readOnly && <Button size="sm" variant="outline" onClick={() => setDialog({ mode: "add" })}><Plus />Add column</Button>}
            <Button size="sm" variant="outline" onClick={() => setBacklogOpen(true)}><ListTodo />Backlog{backlogCount > 0 && <span className="text-muted-foreground">{backlogCount}</span>}</Button>
            {archivedCount > 0 && <Button asChild size="sm" variant="ghost"><Link href={`/projects/${projectKey}/backlog#archived`}><Archive />Archived<span className="text-muted-foreground">{archivedCount}</span></Link></Button>}
          </div>
        </div>
        {onBoard.length > 0 && <Progress value={pct} className="h-1.5" />}
        <BoardToolbar filters={filters} onChange={setFilters} labels={labels} />
      </div>

      {onBoard.length === 0 && (
        <p className="shrink-0 border-b bg-muted/30 px-4 py-2 text-sm text-muted-foreground">
          The board is empty. Add tasks in the <button type="button" className="underline" onClick={() => setBacklogOpen(true)}>backlog</button>, then move them here{backlogCount > 0 && ` (${backlogCount} waiting)`}.
        </p>
      )}

      <div className="min-h-0 flex-1">
        {isDesktop === null ? (
          <div className="grid grid-cols-3 gap-3 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-64" />)}</div>
        ) : isDesktop ? (
          <DesktopBoard columns={columns} tasks={visible} onOpen={onOpen} onCreate={readOnly ? undefined : create} onArchive={readOnly ? undefined : archive} actions={actions} onReorderColumn={readOnly ? undefined : (id, beforeColumnId) => columnApi.reorder.mutate({ id, beforeColumnId })} />
        ) : (
          <MobileBoard
            lanes={columns.map((c) => ({ id: c.id, title: c.name, category: c.category }))}
            laneOf={(t) => t.columnId}
            tasks={visible}
            onOpen={onOpen}
            onCreate={readOnly ? undefined : create}
            onArchive={readOnly ? undefined : archive}
            onMove={(task, columnId, last) => moveTask({ task, columnId, prevTaskId: last?.id ?? null, nextTaskId: null })}
          />
        )}
      </div>

      <BacklogSheet projectKey={projectKey} board={board} open={backlogOpen} onOpenChange={setBacklogOpen} />
      <ColumnDialog projectKey={projectKey} columns={columns} tasks={board.tasks} state={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}
