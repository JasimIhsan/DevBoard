"use client";

import Link from "next/link";
import { Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { ProjectBoardDTO } from "@/lib/types";
import { BacklogView } from "./backlog-view";

/**
 * The backlog as a panel that slides in from the right of the board, so you can groom it without leaving the board.
 * It reads the same board cache as the columns behind it, so moving a task onto the board shows up there instantly.
 */
export function BacklogSheet({ projectKey, board, open, onOpenChange, focusArchived }: { projectKey: string; board: ProjectBoardDTO; open: boolean; onOpenChange: (v: boolean) => void; focusArchived: boolean }) {
  const waiting = board.tasks.filter((t) => !t.columnId && !t.archivedAt).length;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* The data-[side=right] selectors must match the sheet's own (w-3/4, sm:max-w-sm) or they lose on specificity. */}
      <SheetContent side="right" className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
        <div className="border-b px-4 py-3 pr-12">
          <SheetTitle className="flex items-center gap-2">
            Backlog
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">{waiting} waiting</span>
            <Button asChild variant="ghost" size="icon-xs" className="ml-auto" aria-label="Open the backlog as a full page" title="Open as a full page">
              <Link href={`/projects/${projectKey}/backlog`}><Maximize2 /></Link>
            </Button>
          </SheetTitle>
          <SheetDescription className="mt-1 text-xs">Add and sort work here, then move it onto the board. The board updates as you go.</SheetDescription>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {open && <BacklogView projectKey={projectKey} initialData={board} embedded focusArchived={focusArchived} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
