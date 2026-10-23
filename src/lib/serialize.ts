import type { Prisma } from "@prisma/client";
import type { ColumnDTO, ProjectDTO, TaskDTO, TaskDetailDTO, TodoDTO, TodoPriority } from "./types";

export const taskInclude = {
  project: { select: { key: true } },
  column: { select: { name: true } },
  subtasks: { select: { done: true } },
} satisfies Prisma.TaskInclude;

export const taskDetailInclude = {
  project: { select: { key: true } },
  column: { select: { name: true } },
  subtasks: { orderBy: { orderIndex: "asc" } },
  comments: { orderBy: { createdAt: "desc" } },
  activities: { orderBy: { createdAt: "desc" }, take: 50 },
} satisfies Prisma.TaskInclude;

type TaskWithCounts = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;
type TaskWithDetail = Prisma.TaskGetPayload<{ include: typeof taskDetailInclude }>;

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function serializeTask(t: TaskWithCounts): TaskDTO {
  return {
    id: t.id,
    key: `${t.project.key}-${t.taskNumber}`,
    projectId: t.projectId,
    projectKey: t.project.key,
    columnId: t.columnId,
    columnName: t.column?.name ?? null,
    taskNumber: t.taskNumber,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    type: t.type,
    orderIndex: t.orderIndex,
    branchName: t.branchName,
    prUrl: t.prUrl,
    labels: t.labels,
    estimate: t.estimate,
    dueDate: iso(t.dueDate),
    completedAt: iso(t.completedAt),
    archivedAt: iso(t.archivedAt),
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    subtasksDone: t.subtasks.filter((s) => s.done).length,
    subtasksTotal: t.subtasks.length,
  };
}

export function serializeTaskDetail(t: TaskWithDetail): TaskDetailDTO {
  return {
    ...serializeTask(t),
    subtasksDone: t.subtasks.filter((s) => s.done).length,
    subtasksTotal: t.subtasks.length,
    subtasks: t.subtasks.map((s) => ({ id: s.id, title: s.title, done: s.done })),
    comments: t.comments.map((c) => ({ id: c.id, body: c.body, createdAt: c.createdAt.toISOString() })),
    activities: t.activities.map((a) => ({ id: a.id, kind: a.kind, detail: a.detail, createdAt: a.createdAt.toISOString() })),
  };
}

export function serializeColumn(c: { id: string; projectId: string; name: string; category: ColumnDTO["category"]; orderIndex: number }): ColumnDTO {
  return { id: c.id, projectId: c.projectId, name: c.name, category: c.category, orderIndex: c.orderIndex };
}

export function serializeProject(p: { id: string; name: string; key: string; description: string | null; color: string; archivedAt: Date | null; starredAt: Date | null }): ProjectDTO {
  return { id: p.id, name: p.name, key: p.key, description: p.description, color: p.color, archived: !!p.archivedAt, starred: !!p.starredAt, starredAt: iso(p.starredAt) };
}

export function serializeTodo(t: { id: string; title: string; done: boolean; doneAt: Date | null; dueDate: Date | null; priority: TodoPriority; createdAt: Date }): TodoDTO {
  return { id: t.id, title: t.title, done: t.done, doneAt: iso(t.doneAt), dueDate: iso(t.dueDate), priority: t.priority, createdAt: t.createdAt.toISOString() };
}
