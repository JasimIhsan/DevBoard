"use client";

import { Archive, ArrowLeft, ArrowRight, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ColumnDTO } from "@/lib/types";

export interface ColumnActions {
  rename: (c: ColumnDTO) => void;
  remove: (c: ColumnDTO) => void;
  move: (c: ColumnDTO, dir: "left" | "right") => void;
  archiveAll: (c: ColumnDTO) => void;
}

/** The ⋯ menu on a column header. */
export function ColumnMenu({ column, index, count, doneCount, actions }: { column: ColumnDTO; index: number; count: number; doneCount: number; actions: ColumnActions }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={`Column options for ${column.name}`}><MoreHorizontal /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={() => actions.rename(column)}><Pencil />Rename or change type</DropdownMenuItem>
        <DropdownMenuItem disabled={index === 0} onSelect={() => actions.move(column, "left")}><ArrowLeft />Move left</DropdownMenuItem>
        <DropdownMenuItem disabled={index === count - 1} onSelect={() => actions.move(column, "right")}><ArrowRight />Move right</DropdownMenuItem>
        {column.category === "DONE" && (
          <DropdownMenuItem disabled={doneCount === 0} onSelect={() => actions.archiveAll(column)}><Archive />Archive all{doneCount ? ` (${doneCount})` : ""}</DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => actions.remove(column)}><Trash2 />Delete column</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
