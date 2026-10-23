"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Maximize2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useBoard, useTaskActions } from "@/lib/client";
import type { ProjectBoardDTO } from "@/lib/types";
import { useUi } from "@/components/ui-state";
import { TypeIcon } from "@/components/task/badges";
import { defaultColumn, useAddBacklogTask } from "./backlog-view";

/**
 * The backlog as a simple panel that slides in from the right of the board: add a task, see every waiting task with its
 * full title, and move it onto the board. Everything else (filters, bulk edits, CSV import, archive) lives on the
 * backlog page, one click away. Shares the board's cache, so the columns behind it update as you move tasks.
 */
export function BacklogSheet({ projectKey, board, open, onOpenChange }: { projectKey: string; board: ProjectBoardDTO; open: boolean; onOpenChange: (v: boolean) => void }) {
  const waiting = board.tasks.filter((t) => !t.columnId && !t.archivedAt).length;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* The data-[side=right] selectors must match the sheet's own (w-3/4, sm:max-w-sm) or they lose on specificity. */}
      <SheetContent side="right" className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <div className="border-b px-4 py-3 pr-12">
          <SheetTitle className="flex items-center gap-2">
            Backlog
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">{waiting} waiting</span>
            <Button asChild variant="ghost" size="icon-xs" className="ml-auto" aria-label="Open the full backlog page" title="Open the full backlog page (filters, bulk edit, import, archive)">
              <Link href={`/projects/${projectKey}/backlog`}><Maximize2 /></Link>
            </Button>
          </SheetTitle>
          <SheetDescription className="mt-1 text-xs">Add a task, then move it onto the board.</SheetDescription>
        </div>
        {open && <SheetBody projectKey={projectKey} initialData={board} />}
      </SheetContent>
    </Sheet>
  );
}

function SheetBody({ projectKey, initialData }: { projectKey: string; initialData: ProjectBoardDTO }) {
  const { data } = useBoard(projectKey, initialData);
  const board = data ?? initialData;
  const { update } = useTaskActions();
  const { openTask } = useUi();
  const add = useAddBacklogTask(projectKey);
  const [title, setTitle] = useState("");
  const canAdd = !board.project.archived;
  const start = defaultColumn(board.columns);
  const tasks = useMemo(
    () => board.tasks.filter((t) => !t.columnId && !t.archivedAt).sort((a, b) => a.priority.localeCompare(b.priority) || a.orderIndex - b.orderIndex),
    [board.tasks],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {canAdd && (
        <form
          className="flex items-center gap-2 border-b px-4 py-3"
          onSubmit={(e) => { e.preventDefault(); if (title.trim()) { add.mutate(title.trim()); setTitle(""); } }}
        >
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task…" aria-label="Quick add task" enterKeyHint="done" maxLength={200} className="h-10" />
          <Button type="submit" size="icon" className="size-10 shrink-0" aria-label="Add task" disabled={!title.trim()}><Plus /></Button>
        </form>
      )}
      <ul className="scroll-thin min-h-0 flex-1 divide-y overflow-y-auto pb-[max(0.5rem,env(safe-area-inset-bottom))]" aria-label="Backlog tasks">
        {tasks.map((t) => (
          <li key={t.id} className="flex items-start gap-3 px-4 py-3">
            <button type="button" onClick={() => openTask(t.key)} className="flex min-w-0 flex-1 flex-col gap-1 text-left">
              <span className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground"><TypeIcon type={t.type} />{t.key}</span>
              <span className="text-sm leading-snug break-words">{t.title}</span>
            </button>
            {start && (
              <Button size="sm" variant="outline" className="shrink-0" title={`Move to ${start.name} on the board`} onClick={() => update.mutate({ task: t, patch: { columnId: start.id } })}>
                Move<span className="max-sm:hidden"> to board</span><ArrowRight />
              </Button>
            )}
          </li>
        ))}
        {tasks.length === 0 && <li className="px-4 py-10 text-center text-sm text-muted-foreground">{canAdd ? "The backlog is empty. Add a task above." : "The backlog is empty."}</li>}
      </ul>
    </div>
  );
}
