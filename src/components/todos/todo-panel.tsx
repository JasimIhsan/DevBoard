"use client";

import { useMemo, useRef, useState } from "react";
import { format, isBefore, isToday, isTomorrow, startOfDay } from "date-fns";
import { CalendarDays, CalendarPlus, ChevronDown, Flag, ListChecks, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { DueChip } from "@/components/task/badges";
import { DatePicker, dayToIso, isoToDay, todayIso } from "./date-picker";
import { useConfirm } from "@/components/confirm-dialog";
import { isPendingTodo, useTodoActions, useTodos } from "@/lib/todos";
import type { TodoDTO, TodoPriority } from "@/lib/types";
import { cn } from "@/lib/utils";

const toIso = dayToIso;
const toDay = isoToDay;

const PRIORITIES: { value: TodoPriority; label: string; text: string }[] = [
  { value: "HIGH", label: "High", text: "text-red-400" },
  { value: "MEDIUM", label: "Medium", text: "text-amber-400" },
  { value: "LOW", label: "Low", text: "text-muted-foreground" },
];
/** "Today", "Tomorrow", or "Wed, Oct 21". */
const dueLabel = (iso: string) => (isToday(new Date(iso)) ? "Today" : isTomorrow(new Date(iso)) ? "Tomorrow" : format(new Date(iso), "EEE, MMM d"));
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
              <DatePicker value={todo.dueDate} onChange={(d) => setDue(todo, d)} label="Change due date" align="start">
                <DueChip date={todo.dueDate} done={todo.done} />
              </DatePicker>
              {!todo.done && (
                <button type="button" aria-label="Clear due date" onClick={() => setDue(todo, null)} className="-m-1.5 p-1.5 text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 max-lg:opacity-60"><X className="size-3" /></button>
              )}
            </span>
          ) : (
            !todo.done && (
              <DatePicker value={null} onChange={(d) => d && setDue(todo, d)} label="Set due date" align="start" className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 max-lg:opacity-60">
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"><CalendarPlus className="size-3" />Add date</span>
              </DatePicker>
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
  // New to-dos default to today (or the day you're filtering by). Once you pick or clear a date, your choice wins.
  const [pickedDue, setPickedDue] = useState<{ value: string | null } | null>(null);
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
  const due = pickedDue ? pickedDue.value : filter.kind === "date" ? toIso(filter.day) : todayIso();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    add(t, due, priority);
    setTitle("");
    setPickedDue(null);
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
            <DatePicker value={due} onChange={(d) => setPickedDue({ value: d })} label="Set due date" allowClear clearLabel="No date">
              <CalendarPlus className={cn("size-4", due ? "text-foreground" : "text-muted-foreground")} />
            </DatePicker>
          </div>
        </div>
        <Button type="submit" size="icon" className="size-10 shrink-0" aria-label="Add to-do" disabled={!title.trim()}><Plus /></Button>
      </form>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
        {priority !== "LOW" && <span className={cn("inline-flex items-center gap-1", pr.text)}><Flag className="size-3" />{pr.label} priority</span>}
        {due ? (
          <span className="inline-flex items-center gap-1">
            Due {dueLabel(due)}
            <button type="button" aria-label="Remove due date" onClick={() => setPickedDue({ value: null })} className="-m-1.5 p-1.5 hover:text-foreground"><X className="size-3" /></button>
          </span>
        ) : (
          <span>No due date</span>
        )}
      </p>

      {!empty && (
        <div role="group" aria-label="Filter by date" className="scroll-thin -mx-1 mt-3 flex items-center gap-1.5 overflow-x-auto px-1 pb-1">
          <button type="button" aria-pressed={filter.kind === "today"} onClick={() => setFilter({ kind: "today" })} className={cn(chip(filter.kind === "today"), "gap-1.5 pl-2.5")}>
            <CalendarDays className="size-3.5" />Today{counts.today ? <span className={cn("rounded-full px-1.5 text-[10px]", filter.kind === "today" ? "bg-background/20" : "bg-muted")}>{counts.today}</span> : null}
          </button>
          {pick("all", "All")}
          {pick("overdue", "Overdue", counts.overdue)}
          {pick("upcoming", "Upcoming", counts.upcoming)}
          {pick("nodate", "No date", counts.nodate)}
          <DatePicker value={filter.kind === "date" ? toIso(filter.day) : null} onChange={(d) => setFilter(d ? { kind: "date", day: toDay(d) } : { kind: "all" })} label="Pick a date to filter by" allowClear clearLabel="Show all" align="start">
            <span className={chip(filter.kind === "date")}>
              <CalendarPlus className="size-3.5" />{filter.kind === "date" ? format(new Date(`${filter.day}T12:00:00`), "MMM d") : "Pick date"}
            </span>
          </DatePicker>
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
