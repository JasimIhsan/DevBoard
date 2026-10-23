import { ApiError, type ApiFn } from "./api";

/** Task status as a category: BACKLOG (not on the board) or the category of the board column the task is in. */
export const STATUSES = ["BACKLOG", "TODO", "IN_PROGRESS", "DONE"] as const;
export const CATEGORIES = ["TODO", "IN_PROGRESS", "DONE"] as const;
export const PRIORITIES = ["P0", "P1", "P2", "P3"] as const;
export const TYPES = ["FEATURE", "BUG", "CHORE", "SPIKE"] as const;
const PRIORITY_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
export const priorityRank = (p: string) => PRIORITY_RANK[p] ?? 9;

/* ---------- results ---------- */
export type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

export const ok = (data: unknown): ToolResult => ({ content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] });

export const fail = (e: unknown): ToolResult => {
  const message = e instanceof ApiError ? (e.status ? `DevBoard error (${e.status}): ${e.message}` : e.message) : e instanceof Error ? e.message : String(e);
  return { isError: true, content: [{ type: "text", text: message }] };
};

/** Wraps a tool body so thrown API/validation errors come back as `isError` results the model can read and recover from. */
export const guarded = <A>(fn: (args: A) => Promise<unknown>) => async (args: A): Promise<ToolResult> => {
  try { return ok(await fn(args)); } catch (e) { return fail(e); }
};

/* ---------- shapes ---------- */
export interface TaskDto {
  id: string; key: string; projectKey: string; columnId: string | null; columnName: string | null; title: string; description: string;
  status: string; priority: string; type: string; branchName: string | null; prUrl: string | null; labels: string[];
  estimate: number | null; dueDate: string | null; subtasksDone: number; subtasksTotal: number; updatedAt: string; completedAt: string | null;
  archivedAt: string | null; orderIndex: number;
}
export interface ColumnDto { id: string; name: string; category: "TODO" | "IN_PROGRESS" | "DONE"; orderIndex: number }

/** Compact task view for lists: enough to decide what to do, without the description or history. */
export function slimTask(t: TaskDto) {
  return {
    key: t.key,
    title: t.title,
    column: t.columnName ?? "Backlog",
    status: t.status,
    archived: !!t.archivedAt,
    priority: t.priority,
    type: t.type,
    estimate: t.estimate,
    dueDate: t.dueDate?.slice(0, 10) ?? null,
    labels: t.labels,
    branch: t.branchName,
    prUrl: t.prUrl,
    subtasks: t.subtasksTotal ? `${t.subtasksDone}/${t.subtasksTotal}` : null,
  };
}

/** "2030-05-01" → noon UTC ISO (what the UI stores); full ISO datetimes pass through; null clears. */
export function toIso(d: string | null | undefined): string | null | undefined {
  if (d === undefined || d === null) return d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return `${d}T12:00:00.000Z`;
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) throw new ApiError(400, `Invalid date "${d}". Use YYYY-MM-DD.`);
  return t.toISOString();
}

export const upper = (k: string) => k.trim().toUpperCase();

/* ---------- columns ---------- */
export const getColumns = (api: ApiFn, projectKey: string) => api<ColumnDto[]>("GET", `/api/projects/${upper(projectKey)}/columns`);

const describeColumns = (columns: ColumnDto[]) => columns.map((c) => `"${c.name}" (${c.category})`).join(", ") || "none";

const CATEGORY_WORDS: Record<string, ColumnDto["category"]> = {
  todo: "TODO", to_do: "TODO", "to do": "TODO", in_progress: "IN_PROGRESS", "in progress": "IN_PROGRESS", doing: "IN_PROGRESS", done: "DONE",
};

/**
 * Finds a board column by id or name (case-insensitive, unique partial match allowed). A bare status word such as
 * "DONE" or "IN_PROGRESS" means the first column with that category, so simple requests work in every project.
 */
export function findColumn(columns: ColumnDto[], ref: string): ColumnDto {
  const r = ref.trim();
  const byId = columns.find((c) => c.id === r);
  if (byId) return byId;
  const exact = columns.filter((c) => c.name.toLowerCase() === r.toLowerCase());
  if (exact.length === 1) return exact[0];
  const cat = CATEGORY_WORDS[r.toLowerCase()];
  const byCategory = cat ? columns.find((c) => c.category === cat) : undefined;
  if (byCategory) return byCategory;
  const partial = columns.filter((c) => c.name.toLowerCase().includes(r.toLowerCase()));
  if (partial.length === 1) return partial[0];
  throw new ApiError(404, `No column matches "${ref}". Columns: ${describeColumns(columns)}. Use "backlog" for the backlog.`);
}

/** Column reference → columnId, or null for the backlog ("backlog" / "none" / null). */
export async function resolveColumnRef(api: ApiFn, projectKey: string, ref: string | null | undefined): Promise<string | null> {
  if (ref === null || ref === undefined || /^(backlog|none|null)$/i.test(ref.trim())) return null;
  return findColumn(await getColumns(api, projectKey), ref).id;
}

/* ---------- tasks ---------- */
export const getTask = (api: ApiFn, key: string) => api<any>("GET", `/api/tasks/${encodeURIComponent(upper(key))}`);

/**
 * Moves a task into a board column (or back to the backlog with columnId null) and puts it at the top or bottom.
 * Positions are per project+column, so neighbours are looked up in that column.
 */
export async function moveToColumn(api: ApiFn, task: TaskDto, columnId: string | null, position: "top" | "bottom" = "bottom") {
  if (columnId === null) return api<TaskDto>("PATCH", `/api/tasks/${task.id}`, { columnId: null });
  const lane = (await api<TaskDto[]>("GET", `/api/tasks?projectKey=${task.projectKey}&columnId=${columnId}&limit=1000`))
    .filter((t) => t.id !== task.id)
    .sort((a, b) => a.orderIndex - b.orderIndex);
  const prev = position === "bottom" ? lane.at(-1) : undefined;
  const next = position === "top" ? lane[0] : undefined;
  return api<TaskDto>("PATCH", `/api/tasks/${task.id}/reorder`, { columnId, prevTaskId: prev?.id ?? null, nextTaskId: next?.id ?? null });
}
