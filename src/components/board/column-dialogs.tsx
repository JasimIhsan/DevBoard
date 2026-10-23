"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CATEGORIES, CATEGORY_META } from "@/lib/constants";
import { useColumnActions } from "@/lib/client";
import type { ColumnCategory, ColumnDTO, TaskDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

export type ColumnDialogState = { mode: "add" } | { mode: "rename"; column: ColumnDTO } | { mode: "delete"; column: ColumnDTO } | null;

/** Add, rename and delete board columns. One dialog, three modes. */
export function ColumnDialog({ projectKey, columns, tasks, state, onClose }: { projectKey: string; columns: ColumnDTO[]; tasks: TaskDTO[]; state: ColumnDialogState; onClose: () => void }) {
  return (
    <Dialog open={!!state} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        {state?.mode === "add" && <AddForm key="add" projectKey={projectKey} columns={columns} onClose={onClose} />}
        {state?.mode === "rename" && <RenameForm key={state.column.id} projectKey={projectKey} column={state.column} columns={columns} onClose={onClose} />}
        {state?.mode === "delete" && <DeleteForm key={state.column.id} projectKey={projectKey} column={state.column} columns={columns} tasks={tasks} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function CategoryPicker({ value, onChange }: { value: ColumnCategory; onChange: (c: ColumnCategory) => void }) {
  return (
    <div role="radiogroup" aria-label="What this column means" className="grid gap-2 sm:grid-cols-3">
      {CATEGORIES.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value === c} onClick={() => onChange(c)} className={cn("rounded-lg border p-2.5 text-left transition-colors", value === c ? "border-foreground bg-muted" : "hover:bg-muted/50")}>
          <span className="flex items-center gap-2 text-sm font-medium"><span className={cn("size-2 rounded-full", CATEGORY_META[c].dot)} />{CATEGORY_META[c].label}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">{CATEGORY_META[c].hint}</span>
        </button>
      ))}
    </div>
  );
}

const nameTaken = (columns: ColumnDTO[], name: string, exceptId?: string) => columns.some((c) => c.id !== exceptId && c.name.toLowerCase() === name.trim().toLowerCase());

function AddForm({ projectKey, columns, onClose }: { projectKey: string; columns: ColumnDTO[]; onClose: () => void }) {
  const { create } = useColumnActions(projectKey);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ColumnCategory>("IN_PROGRESS");
  const taken = name.trim() !== "" && nameTaken(columns, name);
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (name.trim() && !taken) create.mutate({ name: name.trim(), category }, { onSuccess: onClose }); }} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Add a column</DialogTitle>
        <DialogDescription>Columns are per project, for example Review, QA or Blocked.</DialogDescription>
      </DialogHeader>
      <label className="block text-sm font-medium">Name
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="e.g. In Review" className="mt-1.5" />
        {taken && <span className="mt-1 block text-xs font-normal text-destructive">There is already a column with this name.</span>}
      </label>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">This column means</p>
        <CategoryPicker value={category} onChange={setCategory} />
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={!name.trim() || taken || create.isPending}>Add column</Button>
      </DialogFooter>
    </form>
  );
}

function RenameForm({ projectKey, column, columns, onClose }: { projectKey: string; column: ColumnDTO; columns: ColumnDTO[]; onClose: () => void }) {
  const { update } = useColumnActions(projectKey);
  const [name, setName] = useState(column.name);
  const [category, setCategory] = useState<ColumnCategory>(column.category);
  const taken = name.trim() !== "" && nameTaken(columns, name, column.id);
  const changed = name.trim() !== column.name || category !== column.category;
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (name.trim() && !taken && changed) update.mutate({ id: column.id, name: name.trim(), category }, { onSuccess: onClose }); }} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Edit column</DialogTitle>
        <DialogDescription>Rename it or change what it means. Tasks inside follow the new meaning.</DialogDescription>
      </DialogHeader>
      <label className="block text-sm font-medium">Name
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className="mt-1.5" />
        {taken && <span className="mt-1 block text-xs font-normal text-destructive">There is already a column with this name.</span>}
      </label>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">This column means</p>
        <CategoryPicker value={category} onChange={setCategory} />
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={!name.trim() || taken || !changed || update.isPending}>Save</Button>
      </DialogFooter>
    </form>
  );
}

function DeleteForm({ projectKey, column, columns, tasks, onClose }: { projectKey: string; column: ColumnDTO; columns: ColumnDTO[]; tasks: TaskDTO[]; onClose: () => void }) {
  const { remove } = useColumnActions(projectKey);
  const others = columns.filter((c) => c.id !== column.id);
  const count = tasks.filter((t) => t.columnId === column.id).length;
  const [moveTo, setMoveTo] = useState(others[0]?.id ?? "");
  const last = others.length === 0;
  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle>Delete “{column.name}”?</DialogTitle>
        <DialogDescription>
          {last ? "A board needs at least one column, so this one can't be deleted."
            : count === 0 ? "The column is empty. This can't be undone."
            : `${count} task${count === 1 ? "" : "s"} in this column (including archived ones) will move to the column you choose.`}
        </DialogDescription>
      </DialogHeader>
      {!last && count > 0 && (
        <label className="block text-sm font-medium">Move tasks to
          <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} className="mt-1.5 h-9 w-full rounded-md border bg-background px-2 text-sm">
            {others.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      )}
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="destructive" disabled={last || remove.isPending || (count > 0 && !moveTo)} onClick={() => remove.mutate({ id: column.id, moveTo: count > 0 ? moveTo : undefined }, { onSuccess: onClose })}>Delete column</Button>
      </DialogFooter>
    </div>
  );
}
