import { ApiError, type ApiFn } from "./api";

export const STATUSES = ["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"] as const;
export const BOARD_STATUSES = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"] as const;
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
  id: string; key: string; projectKey: string; sprintId: string | null; title: string; description: string;
  status: string; priority: string; type: string; branchName: string | null; prUrl: string | null; labels: string[];
  estimate: number | null; dueDate: string | null; subtasksDone: number; subtasksTotal: number; updatedAt: string; completedAt: string | null;
}
export interface SprintDto { id: string; name: string; goal: string | null; status: "DRAFT" | "ACTIVE" | "COMPLETED"; startDate: string | null; endDate: string | null }

/** Compact task view for lists: enough to decide what to do, without the description or history. */
export function slimTask(t: TaskDto, sprints?: SprintDto[]) {
  return {
    key: t.key,
    title: t.title,
    status: t.status,
    priority: t.priority,
    type: t.type,
    sprint: t.sprintId ? sprints?.find((s) => s.id === t.sprintId)?.name ?? t.sprintId : null,
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

/* ---------- sprints ---------- */
export const getSprints = (api: ApiFn, projectKey: string) => api<SprintDto[]>("GET", `/api/projects/${upper(projectKey)}/sprints`);

const describeSprints = (sprints: SprintDto[]) => sprints.length ? sprints.map((s) => `"${s.name}" (${s.status})`).join(", ") : "none yet";

/** Finds a sprint by id or name. Accepts "active" for the active sprint. */
export function findSprint(sprints: SprintDto[], ref: string): SprintDto {
  const r = ref.trim();
  if (r.toLowerCase() === "active") {
    const a = sprints.find((s) => s.status === "ACTIVE");
    if (!a) throw new ApiError(404, `This project has no active sprint. Sprints: ${describeSprints(sprints)}. Start one with start_sprint.`);
    return a;
  }
  const byId = sprints.find((s) => s.id === r);
  if (byId) return byId;
  const exact = sprints.filter((s) => s.name.toLowerCase() === r.toLowerCase());
  if (exact.length === 1) return exact[0];
  const partial = sprints.filter((s) => s.name.toLowerCase().includes(r.toLowerCase()));
  if (partial.length === 1) return partial[0];
  throw new ApiError(404, `No sprint matches "${ref}". Sprints: ${describeSprints(sprints)}.`);
}

/** sprint reference → sprintId | null (backlog). "backlog" / "none" / null mean no sprint. */
export async function resolveSprintRef(api: ApiFn, projectKey: string, ref: string | null | undefined): Promise<string | null> {
  if (ref === null || ref === undefined || /^(backlog|none|null)$/i.test(ref.trim())) return null;
  return findSprint(await getSprints(api, projectKey), ref).id;
}

/* ---------- tasks ---------- */
export const getTask = (api: ApiFn, key: string) => api<any>("GET", `/api/tasks/${encodeURIComponent(upper(key))}`);

/**
 * Moves a task to another board column and puts it at the top or bottom of that column.
 * Positions are per project+sprint+status lane, so neighbours are looked up in that lane.
 */
export async function moveToStatus(api: ApiFn, task: TaskDto, status: string, position: "top" | "bottom" = "bottom") {
  if (status !== "BACKLOG" && !task.sprintId) {
    throw new ApiError(409, `${task.key} is in the backlog (no sprint), so it has no board column. Put it in a sprint first: update_task with sprint "active" (or a sprint name).`);
  }
  const lane = (await api<TaskDto[]>("GET", `/api/tasks?projectKey=${task.projectKey}&sprintId=${task.sprintId ?? "none"}&status=${status}&limit=1000`))
    .filter((t) => t.id !== task.id)
    .sort((a: any, b: any) => a.orderIndex - b.orderIndex);
  const prev = position === "bottom" ? lane.at(-1) : undefined;
  const next = position === "top" ? lane[0] : undefined;
  return api<TaskDto>("PATCH", `/api/tasks/${task.id}/reorder`, { newStatus: status, prevTaskId: prev?.id ?? null, nextTaskId: next?.id ?? null });
}
