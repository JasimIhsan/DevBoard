import { db } from "./db";
import { serializeProject, serializeSprint, serializeTask, taskInclude } from "./serialize";
import type { ProjectBoardDTO, ProjectDTO, SprintDTO, TaskDTO } from "./types";

/** Starred first (in the order they were starred, so rows don't reshuffle), then creation order. Includes archived projects. */
export function sortProjects<T extends { starredAt: Date | null; createdAt: Date }>(projects: T[]): T[] {
  return [...projects].sort((a, b) => {
    if (a.starredAt && b.starredAt) return a.starredAt.getTime() - b.starredAt.getTime();
    if (a.starredAt) return -1;
    if (b.starredAt) return 1;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

export async function getProjects(): Promise<ProjectDTO[]> {
  const projects = await db.project.findMany({ orderBy: { createdAt: "asc" } });
  return sortProjects(projects).map(serializeProject);
}

export async function getProjectBoard(projectKey: string): Promise<ProjectBoardDTO | null> {
  const project = await db.project.findUnique({
    where: { key: projectKey.toUpperCase() },
    include: {
      sprints: { orderBy: { createdAt: "asc" } },
      tasks: { include: taskInclude, orderBy: { orderIndex: "asc" } },
    },
  });
  if (!project) return null;
  return {
    project: serializeProject(project),
    sprints: project.sprints.map(serializeSprint),
    tasks: project.tasks.map(serializeTask),
  };
}

/** Every project's board (project + sprints + tasks) for the central board. */
export async function getAllBoards(): Promise<ProjectBoardDTO[]> {
  const projects = await db.project.findMany({ where: { archivedAt: null }, orderBy: { createdAt: "asc" }, select: { key: true } });
  const boards = await Promise.all(projects.map((p) => getProjectBoard(p.key)));
  return boards.filter((b): b is ProjectBoardDTO => b !== null);
}

export interface ProjectOverview {
  project: ProjectDTO;
  total: number;
  done: number;
  inFlight: number; // in progress + in review
  backlog: number;
  points: number;
  sprint: SprintDTO | null; // the active sprint
  sprintCount: number;
  lastActivity: string | null;
}

/** One row per project for the management page. */
export async function getProjectsOverview(): Promise<ProjectOverview[]> {
  const [projects, byStatus, sprints, last] = await Promise.all([
    db.project.findMany({ orderBy: { createdAt: "asc" } }).then(sortProjects),
    db.task.groupBy({ by: ["projectId", "status"], _count: { _all: true }, _sum: { estimate: true } }),
    db.sprint.findMany({ select: { id: true, projectId: true, name: true, goal: true, status: true, startDate: true, endDate: true } }),
    db.task.groupBy({ by: ["projectId"], _max: { updatedAt: true } }),
  ]);
  return projects.map((p) => {
    const rows = byStatus.filter((r) => r.projectId === p.id);
    const count = (...s: string[]) => rows.filter((r) => s.includes(r.status)).reduce((n, r) => n + r._count._all, 0);
    const mine = sprints.filter((s) => s.projectId === p.id);
    const active = mine.find((s) => s.status === "ACTIVE");
    return {
      project: serializeProject(p),
      total: rows.reduce((n, r) => n + r._count._all, 0),
      done: count("DONE"),
      inFlight: count("IN_PROGRESS", "IN_REVIEW"),
      backlog: count("BACKLOG"),
      points: rows.reduce((n, r) => n + (r._sum.estimate ?? 0), 0),
      sprint: active ? serializeSprint(active) : null,
      sprintCount: mine.length,
      lastActivity: last.find((l) => l.projectId === p.id)?._max.updatedAt?.toISOString() ?? null,
    };
  });
}

export interface SprintProgress {
  project: ProjectDTO;
  sprint: SprintDTO;
  total: number;
  done: number;
  inProgress: number;
  points: number;
  pointsDone: number;
  daysLeft: number | null;
}

export interface DashboardData {
  stats: { openTasks: number; inProgress: number; urgent: number; doneThisWeek: number; overdue: number };
  sprints: SprintProgress[];
  inProgress: TaskDTO[];
  dueSoon: TaskDTO[];
  recentlyDone: TaskDTO[];
  projectsWithoutSprint: ProjectDTO[];
}

export async function getDashboard(): Promise<DashboardData> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const soon = new Date(now.getTime() + 7 * 86_400_000);

  // Archived projects don't count toward anything on the dashboard.
  const live = { project: { archivedAt: null } };
  const [projects, activeSprints, inProgress, dueSoon, recentlyDone, openTasks, urgent, doneThisWeek, overdue] = await Promise.all([
    db.project.findMany({ where: { archivedAt: null }, orderBy: { createdAt: "asc" } }),
    db.sprint.findMany({ where: { status: "ACTIVE", ...live }, include: { tasks: { select: { status: true, estimate: true } } } }),
    db.task.findMany({ where: { status: "IN_PROGRESS", sprint: { status: "ACTIVE" }, ...live }, include: taskInclude, orderBy: [{ priority: "asc" }, { updatedAt: "desc" }], take: 12 }),
    db.task.findMany({ where: { status: { not: "DONE" }, dueDate: { lte: soon }, ...live }, include: taskInclude, orderBy: { dueDate: "asc" }, take: 8 }),
    db.task.findMany({ where: { status: "DONE", completedAt: { gte: weekAgo }, ...live }, include: taskInclude, orderBy: { completedAt: "desc" }, take: 6 }),
    db.task.count({ where: { status: { not: "DONE" }, ...live } }),
    db.task.count({ where: { status: { not: "DONE" }, priority: "P0", ...live } }),
    db.task.count({ where: { status: "DONE", completedAt: { gte: weekAgo }, ...live } }),
    db.task.count({ where: { status: { not: "DONE" }, dueDate: { lt: now }, ...live } }),
  ]);

  const byId = new Map(projects.map((p) => [p.id, p]));
  const sprints: SprintProgress[] = activeSprints
    .filter((s) => byId.has(s.projectId))
    .map((s) => ({
      project: serializeProject(byId.get(s.projectId)!),
      sprint: serializeSprint(s),
      total: s.tasks.length,
      done: s.tasks.filter((t) => t.status === "DONE").length,
      inProgress: s.tasks.filter((t) => t.status === "IN_PROGRESS" || t.status === "IN_REVIEW").length,
      points: s.tasks.reduce((n, t) => n + (t.estimate ?? 0), 0),
      pointsDone: s.tasks.filter((t) => t.status === "DONE").reduce((n, t) => n + (t.estimate ?? 0), 0),
      daysLeft: s.endDate ? Math.ceil((s.endDate.getTime() - now.getTime()) / 86_400_000) : null,
    }));

  const withSprint = new Set(activeSprints.map((s) => s.projectId));
  return {
    stats: { openTasks, inProgress: inProgress.length, urgent, doneThisWeek, overdue },
    sprints,
    inProgress: inProgress.map(serializeTask),
    dueSoon: dueSoon.map(serializeTask),
    recentlyDone: recentlyDone.map(serializeTask),
    projectsWithoutSprint: projects.filter((p) => !withSprint.has(p.id)).map(serializeProject),
  };
}
