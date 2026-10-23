import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ApiFn } from "../api";
import { ApiError } from "../api";
import { getTask, guarded, PRIORITIES, priorityRank, resolveColumnRef, slimTask, STATUSES, TYPES, upper, type ColumnDto, type TaskDto } from "../helpers";

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

const countBy = <T,>(items: T[], key: (t: T) => string) => items.reduce<Record<string, number>>((m, i) => ((m[key(i)] = (m[key(i)] ?? 0) + 1), m), {});

export async function workspaceSummary(api: ApiFn) {
  const projects = (await api<any[]>("GET", "/api/projects")).filter((p) => !p.archived);
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const out = [];
  for (const p of projects) {
    const board = await api<{ columns: ColumnDto[]; tasks: TaskDto[] }>("GET", `/api/projects/${p.key}`);
    const live = board.tasks.filter((t) => !t.archivedAt);
    const open = live.filter((t) => t.status !== "DONE");
    out.push({
      project: { key: p.key, name: p.name, starred: p.starred },
      board: board.columns.map((c) => ({ column: c.name, category: c.category, tasks: live.filter((t) => t.columnId === c.id).length })),
      backlogCount: live.filter((t) => !t.columnId).length,
      archivedCount: board.tasks.length - live.length,
      openP0: open.filter((t) => t.priority === "P0").map((t) => ({ key: t.key, title: t.title, column: t.columnName ?? "Backlog" })),
      overdue: open.filter((t) => t.dueDate && t.dueDate.slice(0, 10) < today).map((t) => ({ key: t.key, title: t.title, dueDate: t.dueDate!.slice(0, 10) })),
      dueThisWeek: open.filter((t) => t.dueDate && t.dueDate.slice(0, 10) >= today && t.dueDate.slice(0, 10) <= soon).map((t) => ({ key: t.key, title: t.title, dueDate: t.dueDate!.slice(0, 10) })),
      inProgress: live.filter((t) => t.status === "IN_PROGRESS").map((t) => ({ key: t.key, title: t.title, column: t.columnName })),
    });
  }
  return { today, projects: out };
}

export function registerReadTools(server: McpServer, api: ApiFn) {
  server.registerTool(
    "list_projects",
    { title: "List projects", description: "List DevBoard projects with their keys, names, and whether they are starred or archived. Start here to discover valid project keys (e.g. CORE).", inputSchema: { includeArchived: z.boolean().optional().describe("Include archived projects (default false).") }, annotations: READ_ONLY },
    guarded(async ({ includeArchived }: { includeArchived?: boolean }) => {
      const projects = await api<any[]>("GET", "/api/projects");
      return projects.filter((p) => includeArchived || !p.archived).map((p) => ({ key: p.key, name: p.name, description: p.description, starred: p.starred, archived: p.archived }));
    }),
  );

  server.registerTool(
    "get_project",
    { title: "Get project overview", description: "Overview of one project: its board columns (name, meaning, task count), the backlog size, archived count and task counts per status. Use before planning or moving work around.", inputSchema: { projectKey: z.string().describe("Project key, e.g. CORE.") }, annotations: READ_ONLY },
    guarded(async ({ projectKey }: { projectKey: string }) => {
      const b = await api<{ project: any; columns: ColumnDto[]; tasks: TaskDto[] }>("GET", `/api/projects/${upper(projectKey)}`);
      const live = b.tasks.filter((t) => !t.archivedAt);
      return {
        key: b.project.key, name: b.project.name, description: b.project.description, archived: b.project.archived, starred: b.project.starred,
        taskCounts: { total: b.tasks.length, byStatus: countBy(live, (t) => t.status), inBacklog: live.filter((t) => !t.columnId).length, archived: b.tasks.length - live.length },
        columns: b.columns.map((c) => ({ id: c.id, name: c.name, category: c.category, tasks: live.filter((t) => t.columnId === c.id).length, points: live.filter((t) => t.columnId === c.id).reduce((n, t) => n + (t.estimate ?? 0), 0) })),
      };
    }),
  );

  server.registerTool(
    "list_tasks",
    {
      title: "List tasks",
      description: "List tasks, optionally filtered. Returns compact task summaries (use get_task for the full description, subtasks and comments). Archived tasks are left out unless archived is set. Filtering by column requires projectKey.",
      inputSchema: {
        projectKey: z.string().optional().describe("Limit to one project. Omit to list across all (non-archived) projects."),
        column: z.string().optional().describe('A board column name (e.g. "In Progress") or "backlog". Requires projectKey.'),
        status: z.enum(STATUSES).optional().describe("BACKLOG, or the category of the column the task is in (TODO, IN_PROGRESS, DONE)."),
        archived: z.enum(["include", "only"]).optional().describe("Include archived tasks, or list only archived ones. Default: leave them out."),
        priority: z.enum(PRIORITIES).optional(),
        type: z.enum(TYPES).optional(),
        label: z.string().optional().describe("Only tasks with this label (case-insensitive)."),
        search: z.string().optional().describe("Matches title, label, or a task key like CORE-12."),
        dueBefore: z.string().optional().describe("YYYY-MM-DD. Only tasks due on or before this date."),
        includeDone: z.boolean().optional().describe("Include DONE tasks (default true)."),
        limit: z.number().int().min(1).max(200).optional().describe("Max tasks returned (default 50)."),
      },
      annotations: READ_ONLY,
    },
    guarded(async (a: { projectKey?: string; column?: string; archived?: string; status?: string; priority?: string; type?: string; label?: string; search?: string; dueBefore?: string; includeDone?: boolean; limit?: number }) => {
      if (a.column && !a.projectKey) throw new ApiError(400, "Filtering by column requires projectKey.");
      const params = new URLSearchParams({ limit: "1000" });
      if (a.projectKey) params.set("projectKey", upper(a.projectKey));
      if (a.search) params.set("q", a.search);
      if (a.status) params.set("status", a.status);
      if (a.column) params.set("columnId", (await resolveColumnRef(api, a.projectKey!, a.column)) ?? "none");
      if (a.archived) params.set("archived", a.archived);
      let tasks = await api<TaskDto[]>("GET", `/api/tasks?${params}`);
      if (a.priority) tasks = tasks.filter((t) => t.priority === a.priority);
      if (a.type) tasks = tasks.filter((t) => t.type === a.type);
      if (a.label) tasks = tasks.filter((t) => t.labels.includes(a.label!.toLowerCase()));
      if (a.dueBefore) tasks = tasks.filter((t) => t.dueDate && t.dueDate.slice(0, 10) <= a.dueBefore!);
      if (a.includeDone === false) tasks = tasks.filter((t) => t.status !== "DONE");
      const limit = a.limit ?? 50;
      const named = tasks.slice(0, limit).map((t) => slimTask(t));
      return { total: tasks.length, returned: named.length, truncated: tasks.length > limit, tasks: named };
    }),
  );

  server.registerTool(
    "search_tasks",
    { title: "Search tasks", description: "Free-text search across all non-archived projects by title, label, or task key (e.g. 'login', 'CORE-12'). Most recently updated first.", inputSchema: { query: z.string().min(1), limit: z.number().int().min(1).max(50).optional() }, annotations: READ_ONLY },
    guarded(async ({ query, limit }: { query: string; limit?: number }) => {
      const tasks = await api<TaskDto[]>("GET", `/api/tasks?q=${encodeURIComponent(query)}&sort=recent&limit=${limit ?? 20}`);
      return { returned: tasks.length, tasks: tasks.map((t) => slimTask(t)) };
    }),
  );

  server.registerTool(
    "get_task",
    { title: "Get task details", description: "Full details of one task by key (e.g. CORE-12): description (Markdown), subtasks, comments, recent activity, branch name and a ready-to-run git command.", inputSchema: { taskKey: z.string().describe("Task key like CORE-12.") }, annotations: READ_ONLY },
    guarded(async ({ taskKey }: { taskKey: string }) => {
      const t = await getTask(api, taskKey);
      return {
        ...slimTask(t),
        description: t.description,
        gitCheckout: t.branchName ? `git checkout -b ${t.branchName}` : null,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        completedAt: t.completedAt,
        subtasks: t.subtasks.map((s: any) => ({ id: s.id, title: s.title, done: s.done })),
        comments: t.comments.map((c: any) => ({ id: c.id, body: c.body, at: c.createdAt })),
        recentActivity: t.activities.slice(0, 10).map((a: any) => ({ what: a.detail, at: a.createdAt })),
      };
    }),
  );

  server.registerTool(
    "get_workspace_summary",
    { title: "Workspace summary", description: "One-call overview of everything in flight: per project the board (tasks per column), backlog size, open P0 tasks, overdue and due-this-week tasks, and what is in progress. Good for standups and 'what should I look at?'.", inputSchema: {}, annotations: READ_ONLY },
    guarded(async () => workspaceSummary(api)),
  );

  server.registerTool(
    "get_next_task",
    {
      title: "Get next task to work on",
      description: "Recommends the next task to pick up: the highest-priority task sitting in a To Do-type column on a board (ties by board order). Also lists tasks already in progress so you can resume instead of starting something new. Then call start_task.",
      inputSchema: { projectKey: z.string().optional().describe("Limit to one project; omit to consider every active project.") },
      annotations: READ_ONLY,
    },
    guarded(async ({ projectKey }: { projectKey?: string }) => {
      const projects = projectKey ? [{ key: upper(projectKey) }] : (await api<any[]>("GET", "/api/projects")).filter((p) => !p.archived);
      const candidates: TaskDto[] = [];
      const inProgress: string[] = [];
      let backlog = 0;
      for (const p of projects) {
        const b = await api<{ tasks: TaskDto[] }>("GET", `/api/projects/${p.key}`);
        for (const t of b.tasks) {
          if (t.archivedAt) continue;
          if (!t.columnId) backlog++;
          else if (t.status === "TODO") candidates.push(t);
          else if (t.status === "IN_PROGRESS") inProgress.push(`${t.key} ${t.title}`);
        }
      }
      candidates.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || a.orderIndex - b.orderIndex);
      const next = candidates[0];
      return next
        ? { next: { ...slimTask(next), why: `Highest priority (${next.priority}) task waiting in "${next.columnName}".` }, alsoInProgress: inProgress, nextStep: `Call start_task with taskKey "${next.key}" to claim it.` }
        : { next: null, alsoInProgress: inProgress, message: `Nothing is waiting on a board. ${backlog} task${backlog === 1 ? " is" : "s are"} in the backlog: look at them with list_tasks (column: "backlog") and move one to the board with move_task.` };
    }),
  );
}
