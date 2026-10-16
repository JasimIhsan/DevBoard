import type { Prisma } from "@prisma/client";
import type { ProjectDTO, SprintDTO, TaskDTO, TaskDetailDTO } from "./types";

export const taskInclude = {
  project: { select: { key: true } },
  subtasks: { select: { done: true } },
} satisfies Prisma.TaskInclude;

export const taskDetailInclude = {
  project: { select: { key: true } },
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
    sprintId: t.sprintId,
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

export function serializeSprint(s: {
  id: string; projectId: string; name: string; goal: string | null;
  status: SprintDTO["status"]; startDate: Date | null; endDate: Date | null;
}): SprintDTO {
  return { id: s.id, projectId: s.projectId, name: s.name, goal: s.goal, status: s.status, startDate: iso(s.startDate), endDate: iso(s.endDate) };
}

export function serializeProject(p: { id: string; name: string; key: string; description: string | null; color: string; archivedAt: Date | null; starredAt: Date | null }): ProjectDTO {
  return { id: p.id, name: p.name, key: p.key, description: p.description, color: p.color, archived: !!p.archivedAt, starred: !!p.starredAt, starredAt: iso(p.starredAt) };
}
