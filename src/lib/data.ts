import { db } from "./db";
import { ensureDefaultColumns } from "./tasks";
import { serializeColumn, serializeProject, serializeTask, taskInclude } from "./serialize";
import type { ColumnCategory, ProjectBoardDTO, ProjectDTO, TaskDTO } from "./types";

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
      columns: { orderBy: { orderIndex: "asc" } },
      tasks: { include: taskInclude, orderBy: { orderIndex: "asc" } },
    },
  });
  if (!project) return null;
  // Safety net for projects created before columns existed or by other means.
  const columns = project.columns.length ? project.columns : await ensureDefaultColumns(db, project.id);
  return {
    project: serializeProject(project),
    columns: columns.map(serializeColumn),
    tasks: project.tasks.map(serializeTask),
  };
}

/** Every project's board (project + columns + tasks) for the central board. */
export async function getAllBoards(): Promise<ProjectBoardDTO[]> {
  const projects = await db.project.findMany({ where: { archivedAt: null }, orderBy: { createdAt: "asc" }, select: { key: true } });
  const boards = await Promise.all(projects.map((p) => getProjectBoard(p.key)));
  return boards.filter((b): b is ProjectBoardDTO => b !== null);
}

export interface ColumnCount { id: string; name: string; category: ColumnCategory; count: number }

export interface ProjectOverview {
  project: ProjectDTO;
  total: number;
  done: number;
  inFlight: number; // in progress
  backlog: number;
  archived: number;
  points: number;
  /** Tasks per board column (archived tasks are not counted). */
  columns: ColumnCount[];
  lastActivity: string | null;
}

/** Task counts per column for the given projects; archived tasks are left out. */
async function columnCounts(projectIds: string[]): Promise<Map<string, ColumnCount[]>> {
  const [cols, counts] = await Promise.all([
    db.boardColumn.findMany({ where: { projectId: { in: projectIds } }, orderBy: { orderIndex: "asc" } }),
    db.task.groupBy({ by: ["columnId"], where: { projectId: { in: projectIds }, columnId: { not: null }, archivedAt: null }, _count: { _all: true } }),
  ]);
  const byCol = new Map(counts.map((c) => [c.columnId, c._count._all]));
  const out = new Map<string, ColumnCount[]>();
  for (const c of cols) out.set(c.projectId, [...(out.get(c.projectId) ?? []), { id: c.id, name: c.name, category: c.category, count: byCol.get(c.id) ?? 0 }]);
  return out;
}

/** One row per project for the management page. */
export async function getProjectsOverview(): Promise<ProjectOverview[]> {
  const projects = await db.project.findMany({ orderBy: { createdAt: "asc" } }).then(sortProjects);
  const [byStatus, archived, last, cols] = await Promise.all([
    db.task.groupBy({ by: ["projectId", "status"], _count: { _all: true }, _sum: { estimate: true } }),
    db.task.groupBy({ by: ["projectId"], where: { archivedAt: { not: null } }, _count: { _all: true } }),
    db.task.groupBy({ by: ["projectId"], _max: { updatedAt: true } }),
    columnCounts(projects.map((p) => p.id)),
  ]);
  return projects.map((p) => {
    const rows = byStatus.filter((r) => r.projectId === p.id);
    const count = (...s: string[]) => rows.filter((r) => s.includes(r.status)).reduce((n, r) => n + r._count._all, 0);
    return {
      project: serializeProject(p),
      total: rows.reduce((n, r) => n + r._count._all, 0),
      done: count("DONE"),
      inFlight: count("IN_PROGRESS"),
      backlog: count("BACKLOG"),
      archived: archived.find((a) => a.projectId === p.id)?._count._all ?? 0,
      points: rows.reduce((n, r) => n + (r._sum.estimate ?? 0), 0),
      columns: cols.get(p.id) ?? [],
      lastActivity: last.find((l) => l.projectId === p.id)?._max.updatedAt?.toISOString() ?? null,
    };
  });
}

export interface BoardProgress {
  project: ProjectDTO;
  columns: ColumnCount[];
  /** Tasks on the board (not backlog, not archived). */
  onBoard: number;
  done: number;
  points: number;
  pointsDone: number;
  backlog: number;
}

export interface DashboardData {
  stats: { openTasks: number; inProgress: number; urgent: number; doneThisWeek: number; overdue: number };
  boards: BoardProgress[];
  inProgress: TaskDTO[];
  dueSoon: TaskDTO[];
  recentlyDone: TaskDTO[];
}

export async function getDashboard(): Promise<DashboardData> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const soon = new Date(now.getTime() + 7 * 86_400_000);

  // Archived projects don't count toward anything on the dashboard.
  const live = { project: { archivedAt: null } };
  const [projects, boardTasks, inProgress, dueSoon, recentlyDone, openTasks, inProgressCount, urgent, doneThisWeek, overdue] = await Promise.all([
    db.project.findMany({ where: { archivedAt: null }, orderBy: { createdAt: "asc" } }),
    db.task.findMany({ where: { ...live, columnId: { not: null }, archivedAt: null }, select: { projectId: true, status: true, estimate: true } }),
    db.task.findMany({ where: { status: "IN_PROGRESS", archivedAt: null, ...live }, include: taskInclude, orderBy: [{ priority: "asc" }, { updatedAt: "desc" }], take: 12 }),
    db.task.findMany({ where: { status: { not: "DONE" }, dueDate: { lte: soon }, ...live }, include: taskInclude, orderBy: { dueDate: "asc" }, take: 8 }),
    db.task.findMany({ where: { status: "DONE", completedAt: { gte: weekAgo }, ...live }, include: taskInclude, orderBy: { completedAt: "desc" }, take: 6 }),
    db.task.count({ where: { status: { not: "DONE" }, ...live } }),
    db.task.count({ where: { status: "IN_PROGRESS", ...live } }),
    db.task.count({ where: { status: { not: "DONE" }, priority: "P0", ...live } }),
    db.task.count({ where: { status: "DONE", completedAt: { gte: weekAgo }, ...live } }),
    db.task.count({ where: { status: { not: "DONE" }, dueDate: { lt: now }, ...live } }),
  ]);

  const [cols, backlogRows] = await Promise.all([
    columnCounts(projects.map((p) => p.id)),
    db.task.groupBy({ by: ["projectId"], where: { status: "BACKLOG", ...live }, _count: { _all: true } }),
  ]);
  const boards: BoardProgress[] = projects.map((p) => {
    const mine = boardTasks.filter((t) => t.projectId === p.id);
    const done = mine.filter((t) => t.status === "DONE");
    return {
      project: serializeProject(p),
      columns: cols.get(p.id) ?? [],
      onBoard: mine.length,
      done: done.length,
      points: mine.reduce((n, t) => n + (t.estimate ?? 0), 0),
      pointsDone: done.reduce((n, t) => n + (t.estimate ?? 0), 0),
      backlog: backlogRows.find((r) => r.projectId === p.id)?._count._all ?? 0,
    };
  });

  return {
    stats: { openTasks, inProgress: inProgressCount, urgent, doneThisWeek, overdue },
    boards,
    inProgress: inProgress.map(serializeTask),
    dueSoon: dueSoon.map(serializeTask),
    recentlyDone: recentlyDone.map(serializeTask),
  };
}
