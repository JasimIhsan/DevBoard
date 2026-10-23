import type { ColumnCategory, Priority, TaskStatus, TaskType } from "@prisma/client";

export const CATEGORIES = ["TODO", "IN_PROGRESS", "DONE"] as const satisfies readonly ColumnCategory[];
export const PRIORITIES = ["P0", "P1", "P2", "P3"] as const satisfies readonly Priority[];
export const TASK_TYPES = ["FEATURE", "BUG", "CHORE", "SPIKE"] as const satisfies readonly TaskType[];

/** A project's board starts with these columns; more can be added per project. */
export const DEFAULT_COLUMNS: readonly { name: string; category: ColumnCategory }[] = [
  { name: "To Do", category: "TODO" },
  { name: "In Progress", category: "IN_PROGRESS" },
  { name: "Done", category: "DONE" },
];

export const CATEGORY_META: Record<ColumnCategory, { label: string; hint: string; dot: string }> = {
  TODO: { label: "To do", hint: "Not started", dot: "bg-sky-500" },
  IN_PROGRESS: { label: "In progress", hint: "Being worked on", dot: "bg-amber-500" },
  DONE: { label: "Done", hint: "Finished (can be archived)", dot: "bg-emerald-500" },
};

/** Status of a task as a category: where it is in its life, whatever its column is called. */
export const STATUS_META: Record<TaskStatus, { label: string; short: string; dot: string }> = {
  BACKLOG: { label: "Backlog", short: "Backlog", dot: "bg-zinc-500" },
  TODO: { label: "To Do", short: "Todo", dot: "bg-sky-500" },
  IN_PROGRESS: { label: "In Progress", short: "Doing", dot: "bg-amber-500" },
  DONE: { label: "Done", short: "Done", dot: "bg-emerald-500" },
};

export const PRIORITY_META: Record<Priority, { label: string; className: string }> = {
  P0: { label: "P0 · Critical", className: "bg-red-500/15 text-red-400 border-red-500/30" },
  P1: { label: "P1 · High", className: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  P2: { label: "P2 · Medium", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  P3: { label: "P3 · Low", className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
};

export const TYPE_META: Record<TaskType, { label: string; className: string }> = {
  FEATURE: { label: "Feature", className: "text-emerald-400" },
  BUG: { label: "Bug", className: "text-red-400" },
  CHORE: { label: "Chore", className: "text-zinc-400" },
  SPIKE: { label: "Spike", className: "text-fuchsia-400" },
};

export const PROJECT_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4", "#d946ef", "#f97316", "#84cc16"];
