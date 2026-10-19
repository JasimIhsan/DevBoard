"use client";

import { useRef, useState } from "react";
import { format } from "date-fns";
import { CalendarPlus, ChevronDown, ListChecks, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { DueChip } from "@/components/task/badges";
import { useConfirm } from "@/components/confirm-dialog";
import { isPendingTodo, useTodoActions, useTodos } from "@/lib/todos";
import type { TodoDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

const toIso = (day: string) => new Date(`${day}T12:00:00`).toISOString();
const toDay = (iso: string) => format(new Date(iso), "yyyy-MM-dd");

/** A native date input hidden behind an icon button: opens the platform's own picker on phones and desktops. */
function DatePick({ value, onChange, label, children, className }: { value: string | null; onChange: (iso: string | null) => void; label: string; children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <span className={cn("relative inline-flex", className)}>
      <button type="button" aria-label={label} onClick={() => { try { ref.current?.showPicker(); } catch { ref.current?.focus(); } }} className="inline-flex items-center">
        {children}
      </button>
      <input
        ref={ref}
        type="date"
        tabIndex={-1}
        aria-hidden
        value={value ? toDay(value) : ""}
        onChange={(e) => onChange(e.target.value ? toIso(e.target.value) : null)}
        className="pointer-events-none absolute inset-0 size-full opacity-0"
      />
    </span>
  );
}

function TodoRow({ todo }: { todo: TodoDTO }) {
  const { toggle, rename, setDue, remove } = useTodoActions();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.title);
  const pending = isPendingTodo(todo);

  const save = () => {
    setEditing(false);
    const t = draft.trim();
    if (t && t !== todo.title) rename(todo, t);
    else setDraft(todo.title);
  };

  return (
    <li className="group flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50">
      <Checkbox checked={todo.done} disabled={pending} onCheckedChange={() => toggle(todo)} aria-label={todo.done ? `Mark "${todo.title}" as not done` : `Mark "${todo.title}" as done`} className="mt-0.5 size-5 rounded-full" />
      <div className="min-w-0 flex-1">
        {editing ? (
          <Input
            autoFocus
            value={draft}
            maxLength={200}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") { setDraft(todo.title); setEditing(false); }
            }}
            className="h-8"
          />
        ) : (
          <button type="button" disabled={pending} onClick={() => { setDraft(todo.title); setEditing(true); }} className={cn("block w-full text-left text-sm leading-snug break-words", todo.done && "text-muted-foreground line-through decoration-muted-foreground/50")}>
            {todo.title}
          </button>
        )}
        <div className="mt-0.5 flex items-center gap-2">
          {todo.dueDate ? (
            <DatePick value={todo.dueDate} onChange={(d) => setDue(todo, d)} label="Change due date">
              <DueChip date={todo.dueDate} done={todo.done} />
            </DatePick>
          ) : (
            !todo.done && (
              <DatePick value={null} onChange={(d) => d && setDue(todo, d)} label="Set due date" className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-lg:opacity-60">
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"><CalendarPlus className="size-3" />Add date</span>
              </DatePick>
            )
          )}
          {todo.dueDate && !todo.done && (
            <button type="button" aria-label="Clear due date" onClick={() => setDue(todo, null)} className="text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 max-lg:opacity-60"><X className="size-3" /></button>
          )}
        </div>
      </div>
      <Button variant="ghost" size="icon-sm" disabled={pending} aria-label={`Delete "${todo.title}"`} onClick={() => remove(todo)} className="-my-0.5 shrink-0 text-muted-foreground opacity-0 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 max-lg:opacity-60">
        <Trash2 />
      </Button>
    </li>
  );
}

export function TodoPanel({ autoFocus, className }: { autoFocus?: boolean; className?: string }) {
  const { open, done, isLoading, isError, refetch } = useTodos();
  const { add, clearCompleted } = useTodoActions();
  const confirm = useConfirm();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    add(t, due);
    setTitle("");
    setDue(null);
    inputRef.current?.focus(); // keep typing: add several in a row
  };

  const clear = async () => {
    const ok = await confirm({ title: "Clear completed to-dos?", description: `${done.length} finished to-do${done.length === 1 ? "" : "s"} will be permanently deleted.`, confirmLabel: "Clear", destructive: true });
    if (ok) clearCompleted();
  };

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <form onSubmit={submit} className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Input ref={inputRef} autoFocus={autoFocus} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Add a to-do…" aria-label="New to-do" enterKeyHint="done" className="h-10 pr-10" />
          <DatePick value={due} onChange={setDue} label="Set due date" className="absolute top-1/2 right-2 -translate-y-1/2">
            <CalendarPlus className={cn("size-4", due ? "text-foreground" : "text-muted-foreground")} />
          </DatePick>
        </div>
        <Button type="submit" size="icon" className="size-10 shrink-0" aria-label="Add to-do" disabled={!title.trim()}><Plus /></Button>
      </form>
      {due && (
        <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
          Due {format(new Date(due), "EEE, MMM d")}
          <button type="button" aria-label="Remove due date" onClick={() => setDue(null)} className="hover:text-foreground"><X className="size-3" /></button>
        </p>
      )}

      <div className="scroll-thin -mx-2 mt-3 min-h-0 flex-1 overflow-y-auto px-2">
        {isLoading ? (
          <div className="space-y-2" aria-busy>{[0, 1, 2].map((i) => <div key={i} className="h-9 animate-pulse rounded-lg bg-muted/50" />)}</div>
        ) : isError ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Couldn&apos;t load to-dos. <button className="underline" onClick={() => refetch()}>Try again</button></p>
        ) : open.length === 0 && done.length === 0 ? (
          <div className="grid place-items-center gap-2 py-12 text-center text-sm text-muted-foreground">
            <ListChecks className="size-8 opacity-50" />
            <p>Nothing to do yet.<br />Type above and press Enter to add your first to-do.</p>
          </div>
        ) : (
          <>
            {open.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">All done. Nice work.</p>}
            <ul aria-label="To-dos">{open.map((t) => <TodoRow key={t.id} todo={t} />)}</ul>
            {done.length > 0 && (
              <section className="mt-4">
                <div className="flex items-center px-2">
                  <button type="button" aria-expanded={showDone} onClick={() => setShowDone((v) => !v)} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                    <ChevronDown className={cn("size-3.5 transition-transform", !showDone && "-rotate-90")} />Completed ({done.length})
                  </button>
                  <Button variant="ghost" size="xs" className="ml-auto text-muted-foreground" onClick={clear}>Clear</Button>
                </div>
                {showDone && <ul aria-label="Completed to-dos" className="mt-1">{done.map((t) => <TodoRow key={t.id} todo={t} />)}</ul>}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
