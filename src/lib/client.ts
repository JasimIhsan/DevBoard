"use client";

import { useCallback } from "react";
import { useMutation, useQueries, useQuery, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";
import { calculateOrderIndex } from "./ordering";
import { PRIORITY_META } from "./constants";
import type { ColumnCategory, ColumnDTO, ProjectBoardDTO, TaskDetailDTO, TaskDTO } from "./types";
import type { UpdateTaskInput } from "./validators";
import { touchRecentProject } from "./recent";

export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body as T;
}

export const qk = {
  board: (projectKey: string) => ["board", projectKey.toUpperCase()] as const,
  task: (key: string) => ["task", key] as const,
  projects: ["projects"] as const,
};

/**
 * Stale-read guard. A GET that overlaps a write (it started before the write committed, or the write finished
 * while it was in flight) can come back with pre-write data and overwrite the UI that the write just updated.
 * `writeEpoch` ticks on every mutation state change; a read that saw any tick, or that ended while a write is
 * still running, is discarded in favour of the current cache and re-run once writes are idle.
 */
let writeEpoch = 0;
export function trackWrites(qc: QueryClient) {
  // Only real write progress counts; observer add/remove churn from mounting components must not look like a write.
  return qc.getMutationCache().subscribe((e) => { if (e.type === "added" || e.type === "updated") writeEpoch++; });
}

const idleRefetch = new Set<string>();
function refetchWhenIdle(qc: QueryClient, key: QueryKey) {
  const id = JSON.stringify(key);
  if (idleRefetch.has(id)) return;
  idleRefetch.add(id);
  const tick = () => {
    if (qc.isMutating() > 0) return void setTimeout(tick, 150);
    idleRefetch.delete(id);
    void qc.invalidateQueries({ queryKey: key });
  };
  setTimeout(tick, 150);
}

export async function guardedGet<T>(qc: QueryClient, key: QueryKey, url: string): Promise<T> {
  const epoch = writeEpoch;
  const data = await api<T>(url);
  if (epoch !== writeEpoch || qc.isMutating() > 0) {
    const current = qc.getQueryData<T>(key);
    if (current !== undefined) {
      refetchWhenIdle(qc, key);
      return current;
    }
  }
  return data;
}

export function useBoard(projectKey: string, initialData?: ProjectBoardDTO) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: qk.board(projectKey),
    queryFn: () => guardedGet<ProjectBoardDTO>(qc, qk.board(projectKey), `/api/projects/${projectKey}`),
    initialData,
    // Mutations write to / invalidate this cache explicitly, so a short staleTime only dedupes the refetch that
    // every newly mounted observer (detail panel, dialogs, rows) would otherwise fire.
    staleTime: 5_000,
  });
}

/**
 * All projects' boards at once. Each project keeps using its own `["board", KEY]` cache entry, so moves and edits made
 * anywhere (project board, backlog, detail panel, central board) stay in sync with no extra invalidation logic.
 */
export function useBoards(initial: ProjectBoardDTO[]): ProjectBoardDTO[] {
  const qc = useQueryClient();
  // combine must be stable, and its result is structurally shared, so the array only changes when some board does.
  const combine = useCallback((results: { data?: ProjectBoardDTO }[]) => results.map((r, i) => r.data ?? initial[i]), [initial]);
  return useQueries({
    queries: initial.map((b) => ({
      queryKey: qk.board(b.project.key),
      queryFn: () => guardedGet<ProjectBoardDTO>(qc, qk.board(b.project.key), `/api/projects/${b.project.key}`),
      initialData: b,
      staleTime: 5_000,
    })),
    combine,
  });
}

export function useTask(key: string | null) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: qk.task(key ?? ""),
    queryFn: () => guardedGet<TaskDetailDTO>(qc, qk.task(key ?? ""), `/api/tasks/${key}`),
    enabled: !!key,
  });
}

function patchBoard(qc: QueryClient, projectKey: string, fn: (b: ProjectBoardDTO) => ProjectBoardDTO) {
  qc.setQueryData<ProjectBoardDTO>(qk.board(projectKey), (b) => (b ? fn(b) : b));
}

const mergeTask = (b: ProjectBoardDTO, id: string, patch: Partial<TaskDTO>): ProjectBoardDTO => ({
  ...b,
  tasks: b.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
});

/** One-line summary of a field change worth announcing; null for quiet edits (title, description, links). */
function describeUpdate(t: TaskDTO, patch: UpdateTaskInput): string | null {
  if (patch.columnId !== undefined) return `${t.key} → ${t.columnName ?? "Backlog"}`;
  if (patch.archived !== undefined) return patch.archived ? `${t.key} archived` : `${t.key} restored`;
  if (patch.priority !== undefined) return `${t.key} set to ${PRIORITY_META[t.priority].label}`;
  if (patch.type !== undefined) return `${t.key} is now a ${t.type.toLowerCase()}`;
  return null;
}

/**
 * What a task looks like right after `patch`, before the server answers: moving to a column re-labels the task with the
 * column's category and name; archiving stamps archivedAt. Keeps every card and the detail panel in step instantly.
 */
function optimisticFields(task: TaskDTO, columns: ColumnDTO[], patch: UpdateTaskInput): Partial<TaskDTO> {
  const { prUrl, archived, columnId, ...rest } = patch;
  const out: Partial<TaskDTO> = { ...rest, ...(prUrl !== undefined ? { prUrl: prUrl || null } : {}) } as Partial<TaskDTO>;
  if (columnId !== undefined) {
    const col = columnId ? columns.find((c) => c.id === columnId) : null;
    const status: TaskDTO["status"] = col ? col.category : "BACKLOG";
    Object.assign(out, {
      columnId: col?.id ?? null,
      columnName: col?.name ?? null,
      status,
      completedAt: status === "DONE" ? task.completedAt ?? new Date().toISOString() : null,
      ...(status !== "DONE" ? { archivedAt: null } : {}),
    });
  }
  if (archived !== undefined) out.archivedAt = archived ? task.archivedAt ?? new Date().toISOString() : null;
  return out;
}

export interface MoveVars {
  task: TaskDTO;
  /** Board column the card was dropped in. */
  columnId: string;
  prevTaskId: string | null;
  nextTaskId: string | null;
}

/** Fields a move touches; used to roll back just this task, never the whole board. */
const MOVE_FIELDS = ["columnId", "columnName", "status", "orderIndex", "completedAt", "archivedAt"] as const;

/** Board mutations: synchronous optimistic write → server → merge the server's answer → reconcile once idle. */
export function useTaskActions() {
  const qc = useQueryClient();
  const settle = (task: Pick<TaskDTO, "key" | "projectKey">) => {
    // Only the last write to settle re-reads, so an early settle can't pull stale data into the UI.
    if (qc.isMutating() <= 1) qc.invalidateQueries({ queryKey: qk.board(task.projectKey) });
    qc.invalidateQueries({ queryKey: qk.task(task.key) });
  };

  const reorder = useMutation({
    mutationKey: ["tasks"],
    mutationFn: ({ task, columnId, prevTaskId, nextTaskId }: MoveVars & { optimisticIndex: number }) =>
      api<TaskDTO>(`/api/tasks/${task.id}/reorder`, { method: "PATCH", json: { columnId, prevTaskId, nextTaskId } }),
    onSuccess: (saved) => {
      patchBoard(qc, saved.projectKey, (b) => mergeTask(b, saved.id, saved));
      // No success toast: the card is already where you dropped it. Failures still announce themselves (onError).
    },
    // Hook-level (not per-mutate) so it also runs for moves that were superseded by a newer drag.
    onError: (e, v) => {
      patchBoard(qc, v.task.projectKey, (b) => ({
        ...b,
        tasks: b.tasks.map((t) => {
          // Only undo if the card still shows *this* move; a newer move owns it otherwise.
          if (t.id !== v.task.id || t.columnId !== v.columnId || t.orderIndex !== v.optimisticIndex) return t;
          return { ...t, ...Object.fromEntries(MOVE_FIELDS.map((f) => [f, v.task[f]])) };
        }),
      }));
      toast.error(`Couldn't move ${v.task.key}: ${e.message}`);
    },
    onSettled: (_d, _e, v) => settle(v.task),
  });

  function moveTask(vars: MoveVars) {
    const { task, columnId, prevTaskId, nextTaskId } = vars;
    touchRecentProject(task.projectKey);
    const key = qk.board(task.projectKey);
    const board = qc.getQueryData<ProjectBoardDTO>(key);
    // revert:false — the default would restore the pre-fetch state right after our optimistic write below.
    void qc.cancelQueries({ queryKey: key }, { revert: false });

    const idx = (id: string | null) => (id ? board?.tasks.find((t) => t.id === id)?.orderIndex ?? null : null);
    const optimisticIndex = calculateOrderIndex(idx(prevTaskId), idx(nextTaskId));
    // `task` as the caller saw it is the rollback point; take the freshest copy from the cache if we have one.
    const before = board?.tasks.find((t) => t.id === task.id) ?? task;
    const target = board?.columns.find((c) => c.id === columnId);
    const status: TaskDTO["status"] = target ? target.category : before.status;
    patchBoard(qc, task.projectKey, (b) =>
      mergeTask(b, task.id, {
        columnId,
        columnName: target?.name ?? before.columnName,
        status,
        orderIndex: optimisticIndex,
        completedAt: status === "DONE" ? before.completedAt ?? new Date().toISOString() : null,
        ...(status !== "DONE" ? { archivedAt: null } : {}),
      }),
    );
    reorder.mutate({ ...vars, task: before, optimisticIndex });
  }

  const update = useMutation({
    mutationKey: ["tasks"],
    // `silent`: skip the success toast (used by drag-and-drop, where the move itself is the feedback).
    mutationFn: ({ task, patch }: { task: Pick<TaskDTO, "id" | "key" | "projectKey">; patch: UpdateTaskInput; silent?: boolean }) =>
      api<TaskDTO>(`/api/tasks/${task.id}`, { method: "PATCH", json: patch }),
    onMutate: async ({ task, patch }) => {
      touchRecentProject(task.projectKey);
      const key = qk.board(task.projectKey);
      await qc.cancelQueries({ queryKey: key }, { revert: false });
      await qc.cancelQueries({ queryKey: qk.task(task.key) }, { revert: false });
      const cached = qc.getQueryData<ProjectBoardDTO>(key);
      const prev = cached?.tasks.find((t) => t.id === task.id);
      const optimistic = prev ? optimisticFields(prev, cached?.columns ?? [], patch) : ({} as Partial<TaskDTO>);
      patchBoard(qc, task.projectKey, (b) => mergeTask(b, task.id, optimistic));
      // The open detail panel reads this cache; without it a Select would flip back until the server replies.
      qc.setQueryData<TaskDetailDTO>(qk.task(task.key), (d) => d && { ...d, ...optimistic });
      return { prev, optimistic };
    },
    onSuccess: (saved, { patch, silent }) => {
      // Show the server's answer right away instead of waiting for the refetch below.
      patchBoard(qc, saved.projectKey, (b) => mergeTask(b, saved.id, saved));
      qc.setQueryData<TaskDetailDTO>(qk.task(saved.key), (d) => d && { ...d, ...saved, subtasks: d.subtasks, comments: d.comments, activities: d.activities });
      const note = describeUpdate(saved, patch);
      if (note && !silent) toast.success(note);
    },
    onError: (e, { task }, ctx) => {
      // Roll back only the fields this edit changed, and only where they still hold this edit's value.
      const { prev, optimistic } = ctx ?? {};
      if (prev && optimistic) {
        patchBoard(qc, task.projectKey, (b) => ({
          ...b,
          tasks: b.tasks.map((t) => {
            if (t.id !== task.id) return t;
            const restore = Object.keys(optimistic).filter((f) => t[f as keyof TaskDTO] === optimistic[f as keyof TaskDTO]);
            return { ...t, ...Object.fromEntries(restore.map((f) => [f, prev[f as keyof TaskDTO]])) };
          }),
        }));
      }
      toast.error(e.message);
    },
    onSettled: (_d, _e, { task }) => settle(task),
  });

  const remove = useMutation({
    mutationFn: (task: Pick<TaskDTO, "id" | "key" | "projectKey">) => api(`/api/tasks/${task.id}`, { method: "DELETE" }),
    onSuccess: (_d, task) => {
      patchBoard(qc, task.projectKey, (b) => ({ ...b, tasks: b.tasks.filter((t) => t.id !== task.id) }));
      toast.success(`Deleted ${task.key}`);
    },
    onError: (e) => toast.error(e.message),
    onSettled: (_d, _e, task) => qc.invalidateQueries({ queryKey: qk.board(task.projectKey) }),
  });

  return { moveTask, update, remove };
}

/** The columns after moving `id` just before `beforeId` (null = to the end), with a fresh order index for the moved one. */
export function moveColumnLocal(columns: ColumnDTO[], id: string, beforeId: string | null): ColumnDTO[] {
  const sorted = [...columns].sort((a, b) => a.orderIndex - b.orderIndex);
  const moving = sorted.find((c) => c.id === id);
  if (!moving) return columns;
  const others = sorted.filter((c) => c.id !== id);
  const at = beforeId === null ? others.length : others.findIndex((c) => c.id === beforeId);
  if (at === -1) return columns;
  const orderIndex = calculateOrderIndex(others[at - 1]?.orderIndex ?? null, others[at]?.orderIndex ?? null);
  return [...others.slice(0, at), { ...moving, orderIndex }, ...others.slice(at)];
}

/** Board column management for one project: add, rename, recolour, reorder, delete, and archive everything done. */
export function useColumnActions(projectKey: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: qk.board(projectKey) });
  const base = `/api/projects/${projectKey}/columns`;
  const onError = (e: Error) => toast.error(e.message);
  return {
    create: useMutation({
      mutationFn: (json: { name: string; category: ColumnCategory }) => api<ColumnDTO>(base, { method: "POST", json }),
      onSuccess: (c) => toast.success(`Added column ${c.name}`),
      onError,
      onSettled: refresh,
    }),
    update: useMutation({
      mutationFn: ({ id, ...json }: { id: string; name?: string; category?: ColumnCategory; direction?: "left" | "right" }) => api<ColumnDTO>(`${base}/${id}`, { method: "PATCH", json }),
      onError,
      onSettled: refresh,
    }),
    /** Drag and drop: put a column before another one (null = last). Shown instantly, rolled back on failure. */
    reorder: useMutation({
      mutationFn: ({ id, beforeColumnId }: { id: string; beforeColumnId: string | null }) => api<ColumnDTO>(`${base}/${id}`, { method: "PATCH", json: { beforeColumnId } }),
      onMutate: async ({ id, beforeColumnId }) => {
        await qc.cancelQueries({ queryKey: qk.board(projectKey) }, { revert: false });
        const prev = qc.getQueryData<ProjectBoardDTO>(qk.board(projectKey))?.columns;
        patchBoard(qc, projectKey, (b) => ({ ...b, columns: moveColumnLocal(b.columns, id, beforeColumnId) }));
        return { prev };
      },
      onError: (e, _v, ctx) => {
        if (ctx?.prev) patchBoard(qc, projectKey, (b) => ({ ...b, columns: ctx.prev! }));
        toast.error(`Couldn't move the column: ${e.message}`);
      },
      onSettled: refresh,
    }),
    remove: useMutation({
      mutationFn: ({ id, moveTo }: { id: string; moveTo?: string }) => api<{ moved: number }>(`${base}/${id}${moveTo ? `?moveTo=${moveTo}` : ""}`, { method: "DELETE" }),
      onSuccess: (r) => toast.success(r.moved ? `Column deleted · moved ${r.moved} task${r.moved === 1 ? "" : "s"}` : "Column deleted"),
      onError,
      onSettled: refresh,
    }),
    archiveAll: useMutation({
      mutationFn: (id: string) => api<{ archived: number }>(`${base}/${id}/archive`, { method: "POST" }),
      onSuccess: (r) => toast.success(r.archived ? `Archived ${r.archived} task${r.archived === 1 ? "" : "s"}` : "Nothing to archive"),
      onError,
      onSettled: refresh,
    }),
  };
}
