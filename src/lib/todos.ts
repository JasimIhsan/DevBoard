"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, guardedGet } from "./client";
import type { TodoDTO } from "./types";

export const todosKey = ["todos"] as const;

/** Optimistic rows carry a temporary id until the server confirms them. */
export const isPendingTodo = (t: TodoDTO) => t.id.startsWith("tmp-");

export function useTodos() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: todosKey, queryFn: () => guardedGet<TodoDTO[]>(qc, todosKey, "/api/todos") });
  const { open, done } = useMemo(() => {
    const all = q.data ?? [];
    return {
      open: all.filter((t) => !t.done).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      done: all.filter((t) => t.done).sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? "")),
    };
  }, [q.data]);
  return { open, done, isLoading: q.isLoading, isError: q.isError, refetch: q.refetch };
}

/** Number of unfinished to-dos, for badges. Shares the cache with useTodos. */
export function useOpenTodoCount() {
  const qc = useQueryClient();
  return useQuery({ queryKey: todosKey, queryFn: () => guardedGet<TodoDTO[]>(qc, todosKey, "/api/todos"), select: (l) => l.filter((t) => !t.done).length }).data ?? 0;
}

export function useTodoActions() {
  const qc = useQueryClient();
  const edit = (fn: (l: TodoDTO[]) => TodoDTO[]) => qc.setQueryData<TodoDTO[]>(todosKey, (l) => fn(l ?? []));
  const snapshot = async () => {
    await qc.cancelQueries({ queryKey: todosKey });
    return qc.getQueryData<TodoDTO[]>(todosKey);
  };
  const rollback = (prev: TodoDTO[] | undefined, message: string) => (e: Error) => {
    qc.setQueryData(todosKey, prev);
    toast.error(`${message}: ${e.message}`);
  };
  const settle = () => qc.invalidateQueries({ queryKey: todosKey });

  const add = useMutation({
    mutationFn: (v: { title: string; dueDate?: string | null }) => api<TodoDTO>("/api/todos", { method: "POST", json: v }),
    onMutate: async (v) => {
      const prev = await snapshot();
      const tmp: TodoDTO = { id: `tmp-${crypto.randomUUID()}`, title: v.title, done: false, doneAt: null, dueDate: v.dueDate ?? null, createdAt: new Date().toISOString() };
      edit((l) => [tmp, ...l]);
      return { prev, tmpId: tmp.id };
    },
    onSuccess: (t, _v, ctx) => edit((l) => l.map((x) => (x.id === ctx.tmpId ? t : x))),
    onError: (e, _v, ctx) => rollback(ctx?.prev, "Couldn't add to-do")(e),
    onSettled: settle,
  });

  const update = useMutation({
    mutationFn: ({ id, ...patch }: { id: string; title?: string; done?: boolean; dueDate?: string | null }) => api<TodoDTO>(`/api/todos/${id}`, { method: "PATCH", json: patch }),
    onMutate: async ({ id, ...patch }) => {
      const prev = await snapshot();
      edit((l) => l.map((t) => (t.id === id ? { ...t, ...patch, ...(patch.done !== undefined && { doneAt: patch.done ? new Date().toISOString() : null }) } : t)));
      return { prev };
    },
    onSuccess: (t) => edit((l) => l.map((x) => (x.id === t.id ? t : x))),
    onError: (e, _v, ctx) => rollback(ctx?.prev, "Couldn't update to-do")(e),
    onSettled: settle,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/todos/${id}`, { method: "DELETE" }),
    onMutate: async (id) => {
      const prev = await snapshot();
      edit((l) => l.filter((t) => t.id !== id));
      return { prev };
    },
    onError: (e, _v, ctx) => rollback(ctx?.prev, "Couldn't delete to-do")(e),
    onSettled: settle,
  });

  const clearCompleted = useMutation({
    mutationFn: () => api("/api/todos?completed=1", { method: "DELETE" }),
    onMutate: async () => {
      const prev = await snapshot();
      edit((l) => l.filter((t) => !t.done));
      return { prev };
    },
    onError: (e, _v, ctx) => rollback(ctx?.prev, "Couldn't clear completed")(e),
    onSettled: settle,
  });

  return {
    add: (title: string, dueDate?: string | null) => add.mutate({ title, dueDate }),
    toggle: (t: TodoDTO) => update.mutate({ id: t.id, done: !t.done }),
    rename: (t: TodoDTO, title: string) => update.mutate({ id: t.id, title }),
    setDue: (t: TodoDTO, dueDate: string | null) => update.mutate({ id: t.id, dueDate }),
    remove: (t: TodoDTO) => remove.mutate(t.id),
    clearCompleted: () => clearCompleted.mutate(),
  };
}
