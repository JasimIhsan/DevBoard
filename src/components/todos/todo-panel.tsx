"use client";

import { useMemo, useRef, useState } from "react";
import { format, isBefore, isToday, startOfDay } from "date-fns";
import { CalendarDays, CalendarPlus, ChevronDown, Flag, ListChecks, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { DueChip } from "@/components/task/badges";
import { useConfirm } from "@/components/confirm-dialog";
import { isPendingTodo, useTodoActions, useTodos } from "@/lib/todos";
import type { TodoDTO, TodoPriority } from "@/lib/types";
import { cn } from "@/lib/utils";

const toIso = (day: string) => new Date(`${day}T12:00:00`).toISOString();
const toDay = (iso: string) => format(new Date(iso), "yyyy-MM-dd");

const PRIORITIES: { value: TodoPriority; label: string; text: string }[] = [
  { value: "HIGH", label: "High", text: "text-red-400" },
  { value: "MEDIUM", label: "Medium", text: "text-amber-400" },
  { value: "LOW", label: "Low", text: "text-muted-foreground" },
];
const priorityMeta = (p: TodoPriority) => PRIORITIES.find((x) => x.value === p)!;

type Filter = { kind: "all" | "today" | "overdue" | "upcoming" | "nodate" } | { kind: "date"; day: string };

function matches(t: TodoDTO, f: Filter): boolean {
  if (f.kind === "all") return true;
  if (f.kind === "nodate") return !t.dueDate;
  if (!t.dueDate) return false;
  const d = new Date(t.dueDate);
  switch (f.kind) {
    case "today": return isToday(d);
    case "overdue": return !t.done && isBefore(d, startOfDay(new Date()));
    case "upcoming": return !isToday(d) && !isBefore(d, startOfDay(new Date()));
    case "date": return toDay(t.dueDate) === f.day;
  }
}

/** A native date input hidden behind a button: opens the platform's own picker on phones and desktops. */
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

function PriorityMenu({ value, onChange, children, label }: { value: TodoPriority; onChange: (p: TodoPriority) => void; children: React.ReactNode; label: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={label} className="inline-flex items-center">{children}</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(v as TodoPriority)}>
          {PRIORITIES.map((p) => (
            <DropdownMenuRadioItem key={p.value} value={p.value}><Flag className={cn("size-3.5", p.text)} />{p.label}</DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TodoRow({ todo }: { todo: TodoDTO }) {
  const { toggle, rename, setDue, setPriority, remove } = useTodoActions();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.title);
  const pending = isPendingTodo(todo);
  const pr = priorityMeta(todo.priority);

  const save = () => {
    setEditing(false);
    const t = draft.trim();
    if (t && t !== todo.title) rename(todo, t);
    else setDraft(todo.title);
  };

  return (
    <li className="group flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50">
      <Checkbox checked={todo.done} disabled={pending} onCheckedChange={() => toggle(todo)} aria-label={todo.done ? `Mark "${todo.title}" as not done` : `Mark "${todo.title}" as done`} className={cn("mt-0.5 size-5 rounded-full", !todo.done && todo.priority === "HIGH" && "border-red-400", !todo.done && todo.priority === "MEDIUM" && "border-amber-400")} />
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
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          {!todo.done && (
            <PriorityMenu value={todo.priority} onChange={(p) => setPriority(todo, p)} label={`Priority: ${pr.label}. Change priority`}>
              <span className={cn("inline-flex items-center gap-1 text-[10px]", pr.text, todo.priority === "LOW" && "opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 max-lg:opacity-60")}>
                <Flag className="size-3" />{pr.label}
              </span>
            </PriorityMenu>
          )}
          {todo.dueDate ? (
            <span className="inline-flex items-center gap-1">
              <DatePick value={todo.dueDate} onChange={(d) => setDue(todo, d)} label="Change due date">
                <DueChip date={todo.dueDate} done={todo.done} />
              </DatePick>
              {!todo.done && (
                <button type="button" aria-label="Clear due date" onClick={() => setDue(todo, null)} className="text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 max-lg:opacity-60"><X className="size-3" /></button>
              )}
            </span>
          ) : (
            !todo.done && (
              <DatePick value={null} onChange={(d) => d && setDue(todo, d)} label="Set due date" className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-lg:opacity-60">
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"><CalendarPlus className="size-3" />Add date</span>
              </DatePick>
            )
          )}
        </div>
      </div>
      <Button variant="ghost" size="icon-sm" disabled={pending} aria-label={`Delete "${todo.title}"`} onClick={() => remove(todo)} className="-my-0.5 shrink-0 text-muted-foreground opacity-0 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 max-lg:opacity-60">
        <Trash2 />
      </Button>
    </li>
  );
}

const FILTER_EMPTY: Record<Filter["kind"], string> = {
  all: "",
  today: "Nothing due today.",
  overdue: "Nothing overdue.",
  upcoming: "Nothing coming up.",
  nodate: "Every to-do has a date.",
  date: "Nothing due on this day.",
};

export function TodoPanel({ autoFocus, className }: { autoFocus?: boolean; className?: string }) {
  const { open, done, isLoading, isError, refetch } = useTodos();
  const { add, clearCompleted } = useTodoActions();
  const confirm = useConfirm();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState<string | null>(null);
  const [priority, setPriority] = useState<TodoPriority>("LOW");
  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const [showDone, setShowDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const counts = useMemo(() => ({
    today: open.filter((t) => matches(t, { kind: "today" })).length,
    overdue: open.filter((t) => matches(t, { kind: "overdue" })).length,
    upcoming: open.filter((t) => matches(t, { kind: "upcoming" })).length,
    nodate: open.filter((t) => !t.dueDate).length,
  }), [open]);
  const shownOpen = useMemo(() => open.filter((t) => matches(t, filter)), [open, filter]);
  const shownDone = useMemo(() => done.filter((t) => matches(t, filter)), [done, filter]);
  const pr = priorityMeta(priority);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    // Adding while looking at a day should land in that day, otherwise the new to-do would vanish from view.
    const day = due ?? (filter.kind === "today" ? toIso(format(new Date(), "yyyy-MM-dd")) : filter.kind === "date" ? toIso(filter.day) : null);
    add(t, day, priority);
    setTitle("");
    setDue(null);
    setPriority("LOW");
    inputRef.current?.focus(); // keep typing: add several in a row
  };

  const clear = async () => {
    const ok = await confirm({ title: "Clear completed to-dos?", description: `${done.length} finished to-do${done.length === 1 ? "" : "s"} will be permanently deleted.`, confirmLabel: "Clear", destructive: true });
    if (ok) clearCompleted();
  };

  const chip = (active: boolean) =>
    cn("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors", active ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground");
  const pick = (kind: Exclude<Filter["kind"], "date">, label: string, count?: number) => (
    <button key={kind} type="button" aria-pressed={filter.kind === kind} onClick={() => setFilter({ kind })} className={chip(filter.kind === kind)}>
      {label}{count ? <span className={cn("rounded-full px-1.5 text-[10px]", filter.kind === kind ? "bg-background/20" : "bg-muted")}>{count}</span> : null}
    </button>
  );
  const empty = open.length === 0 && done.length === 0;

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <form onSubmit={submit} className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Input ref={inputRef} autoFocus={autoFocus} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Add a to-do…" aria-label="New to-do" enterKeyHint="done" className="h-10 pr-[4.5rem]" />
          <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-2.5">
            <PriorityMenu value={priority} onChange={setPriority} label={`Priority: ${pr.label}. Change priority`}>
              <Flag className={cn("size-4", pr.text)} />
            </PriorityMenu>
            <DatePick value={due} onChange={setDue} label="Set due date">
              <CalendarPlus className={cn("size-4", due ? "text-foreground" : "text-muted-foreground")} />
            </DatePick>
          </div>
        </div>
        <Button type="submit" size="icon" className="size-10 shrink-0" aria-label="Add to-do" disabled={!title.trim()}><Plus /></Button>
      </form>
      {(due || priority !== "LOW") && (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
          {priority !== "LOW" && <span className={cn("inline-flex items-center gap-1", pr.text)}><Flag className="size-3" />{pr.label} priority</span>}
          {due && (
            <span className="inline-flex items-center gap-1">
              Due {format(new Date(due), "EEE, MMM d")}
              <button type="button" aria-label="Remove due date" onClick={() => setDue(null)} className="hover:text-foreground"><X className="size-3" /></button>
            </span>
          )}
        </p>
      )}

      {!empty && (
        <div role="group" aria-label="Filter by date" className="scroll-thin -mx-1 mt-3 flex items-center gap-1.5 overflow-x-auto px-1 pb-1">
          <button type="button" aria-pressed={filter.kind === "today"} onClick={() => setFilter({ kind: "today" })} className={cn(chip(filter.kind === "today"), "gap-1.5 pl-2.5")}>
            <CalendarDays className="size-3.5" />Today{counts.today ? <span className={cn("rounded-full px-1.5 text-[10px]", filter.kind === "today" ? "bg-background/20" : "bg-muted")}>{counts.today}</span> : null}
          </button>
          {pick("all", "All")}
          {pick("overdue", "Overdue", counts.overdue)}
          {pick("upcoming", "Upcoming", counts.upcoming)}
          {pick("nodate", "No date", counts.nodate)}
          <DatePick value={filter.kind === "date" ? toIso(filter.day) : null} onChange={(d) => setFilter(d ? { kind: "date", day: toDay(d) } : { kind: "all" })} label="Pick a date to filter by">
            <span className={chip(filter.kind === "date")}>
              <CalendarPlus className="size-3.5" />{filter.kind === "date" ? format(new Date(`${filter.day}T12:00:00`), "MMM d") : "Pick date"}
            </span>
          </DatePick>
        </div>
      )}

      <div className="scroll-thin -mx-2 mt-2 min-h-0 flex-1 overflow-y-auto px-2">
        {isLoading ? (
          <div className="space-y-2" aria-busy>{[0, 1, 2].map((i) => <div key={i} className="h-9 animate-pulse rounded-lg bg-muted/50" />)}</div>
        ) : isError ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Couldn&apos;t load to-dos. <button className="underline" onClick={() => refetch()}>Try again</button></p>
        ) : empty ? (
          <div className="grid place-items-center gap-2 py-12 text-center text-sm text-muted-foreground">
            <ListChecks className="size-8 opacity-50" />
            <p>Nothing to do yet.<br />Type above and press Enter to add your first to-do.</p>
          </div>
        ) : (
          <>
            {shownOpen.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{filter.kind === "all" ? "All done. Nice work." : FILTER_EMPTY[filter.kind]}</p>}
            <ul aria-label="To-dos">{shownOpen.map((t) => <TodoRow key={t.id} todo={t} />)}</ul>
            {shownDone.length > 0 && (
              <section className="mt-4">
                <div className="flex items-center px-2">
                  <button type="button" aria-expanded={showDone} onClick={() => setShowDone((v) => !v)} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                    <ChevronDown className={cn("size-3.5 transition-transform", !showDone && "-rotate-90")} />Completed ({shownDone.length})
                  </button>
                  {filter.kind === "all" && <Button variant="ghost" size="xs" className="ml-auto text-muted-foreground" onClick={clear}>Clear</Button>}
                </div>
                {showDone && <ul aria-label="Completed to-dos" className="mt-1">{shownDone.map((t) => <TodoRow key={t.id} todo={t} />)}</ul>}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
