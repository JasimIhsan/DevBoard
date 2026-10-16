import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ApiFn } from "../api";
import { ApiError } from "../api";
import { getSprints, getTask, guarded, PRIORITIES, priorityRank, resolveSprintRef, slimTask, STATUSES, TYPES, upper, type SprintDto, type TaskDto } from "../helpers";

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

/** Per-call cache so listing tasks across projects fetches each project's sprints once. */
const sprintCache = (api: ApiFn) => {
  const cache = new Map<string, Promise<SprintDto[]>>();
  return (projectKey: string) => {
    if (!cache.has(projectKey)) cache.set(projectKey, getSprints(api, projectKey));
    return cache.get(projectKey)!;
  };
};

const countBy = <T,>(items: T[], key: (t: T) => string) => items.reduce<Record<string, number>>((m, i) => ((m[key(i)] = (m[key(i)] ?? 0) + 1), m), {});

export async function workspaceSummary(api: ApiFn) {
  const projects = (await api<any[]>("GET", "/api/projects")).filter((p) => !p.archived);
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const out = [];
  for (const p of projects) {
    const board = await api<{ sprints: SprintDto[]; tasks: TaskDto[] }>("GET", `/api/projects/${p.key}`);
    const sprint = board.sprints.find((s) => s.status === "ACTIVE") ?? null;
    const inSprint = sprint ? board.tasks.filter((t) => t.sprintId === sprint.id) : [];
    const open = board.tasks.filter((t) => t.status !== "DONE");
    out.push({
      project: { key: p.key, name: p.name, starred: p.starred },
      activeSprint: sprint && { name: sprint.name, goal: sprint.goal, endDate: sprint.endDate?.slice(0, 10) ?? null, byStatus: countBy(inSprint, (t) => t.status), done: inSprint.filter((t) => t.status === "DONE").length, total: inSprint.length },
      backlogCount: board.tasks.filter((t) => !t.sprintId).length,
      openP0: open.filter((t) => t.priority === "P0").map((t) => ({ key: t.key, title: t.title, status: t.status })),
      overdue: open.filter((t) => t.dueDate && t.dueDate.slice(0, 10) < today).map((t) => ({ key: t.key, title: t.title, dueDate: t.dueDate!.slice(0, 10) })),
      dueThisWeek: open.filter((t) => t.dueDate && t.dueDate.slice(0, 10) >= today && t.dueDate.slice(0, 10) <= soon).map((t) => ({ key: t.key, title: t.title, dueDate: t.dueDate!.slice(0, 10) })),
      inProgress: board.tasks.filter((t) => t.status === "IN_PROGRESS").map((t) => ({ key: t.key, title: t.title })),
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
    { title: "Get project overview", description: "Overview of one project: its sprints (id, name, status, goal, dates, task counts) and task counts per status. Use before planning or moving work around.", inputSchema: { projectKey: z.string().describe("Project key, e.g. CORE.") }, annotations: READ_ONLY },
    guarded(async ({ projectKey }: { projectKey: string }) => {
      const b = await api<{ project: any; sprints: SprintDto[]; tasks: TaskDto[] }>("GET", `/api/projects/${upper(projectKey)}`);
      return {
        key: b.project.key, name: b.project.name, description: b.project.description, archived: b.project.archived, starred: b.project.starred,
        taskCounts: { total: b.tasks.length, byStatus: countBy(b.tasks, (t) => t.status), inBacklog: b.tasks.filter((t) => !t.sprintId).length },
        sprints: b.sprints.map((s) => {
          const ts = b.tasks.filter((t) => t.sprintId === s.id);
          return { id: s.id, name: s.name, status: s.status, goal: s.goal, startDate: s.startDate?.slice(0, 10) ?? null, endDate: s.endDate?.slice(0, 10) ?? null, tasks: ts.length, done: ts.filter((t) => t.status === "DONE").length, points: ts.reduce((n, t: any) => n + (t.estimate ?? 0), 0) };
        }),
      };
    }),
  );

  server.registerTool(
    "list_tasks",
    {
      title: "List tasks",
      description: "List tasks, optionally filtered. Returns compact task summaries (use get_task for the full description, subtasks and comments). Filtering by sprint requires projectKey.",
      inputSchema: {
        projectKey: z.string().optional().describe("Limit to one project. Omit to list across all (non-archived) projects."),
        sprint: z.string().optional().describe('"active", "backlog", or a sprint name/id. Requires projectKey.'),
        status: z.enum(STATUSES).optional(),
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
    guarded(async (a: { projectKey?: string; sprint?: string; status?: string; priority?: string; type?: string; label?: string; search?: string; dueBefore?: string; includeDone?: boolean; limit?: number }) => {
      if (a.sprint && !a.projectKey) throw new ApiError(400, "Filtering by sprint requires projectKey.");
      const params = new URLSearchParams({ limit: "1000" });
      if (a.projectKey) params.set("projectKey", upper(a.projectKey));
      if (a.search) params.set("q", a.search);
      if (a.status) params.set("status", a.status);
      if (a.sprint) params.set("sprintId", (await resolveSprintRef(api, a.projectKey!, a.sprint)) ?? "none");
      let tasks = await api<TaskDto[]>("GET", `/api/tasks?${params}`);
      if (a.priority) tasks = tasks.filter((t) => t.priority === a.priority);
      if (a.type) tasks = tasks.filter((t) => t.type === a.type);
      if (a.label) tasks = tasks.filter((t) => t.labels.includes(a.label!.toLowerCase()));
      if (a.dueBefore) tasks = tasks.filter((t) => t.dueDate && t.dueDate.slice(0, 10) <= a.dueBefore!);
      if (a.includeDone === false) tasks = tasks.filter((t) => t.status !== "DONE");
      const limit = a.limit ?? 50;
      const sprints = sprintCache(api);
      const page = tasks.slice(0, limit);
      const named = await Promise.all(page.map(async (t) => slimTask(t, await sprints(t.projectKey))));
      return { total: tasks.length, returned: named.length, truncated: tasks.length > limit, tasks: named };
    }),
  );

  server.registerTool(
    "search_tasks",
    { title: "Search tasks", description: "Free-text search across all non-archived projects by title, label, or task key (e.g. 'login', 'CORE-12'). Most recently updated first.", inputSchema: { query: z.string().min(1), limit: z.number().int().min(1).max(50).optional() }, annotations: READ_ONLY },
    guarded(async ({ query, limit }: { query: string; limit?: number }) => {
      const tasks = await api<TaskDto[]>("GET", `/api/tasks?q=${encodeURIComponent(query)}&sort=recent&limit=${limit ?? 20}`);
      const sprints = sprintCache(api);
      return { returned: tasks.length, tasks: await Promise.all(tasks.map(async (t) => slimTask(t, await sprints(t.projectKey)))) };
    }),
  );

  server.registerTool(
    "get_task",
    { title: "Get task details", description: "Full details of one task by key (e.g. CORE-12): description (Markdown), subtasks, comments, recent activity, branch name and a ready-to-run git command.", inputSchema: { taskKey: z.string().describe("Task key like CORE-12.") }, annotations: READ_ONLY },
    guarded(async ({ taskKey }: { taskKey: string }) => {
      const t = await getTask(api, taskKey);
      const sprints = await getSprints(api, t.projectKey);
      return {
        ...slimTask(t, sprints),
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
    { title: "Workspace summary", description: "One-call overview of everything in flight: per project the active sprint's progress, open P0 tasks, overdue and due-this-week tasks, and what is in progress. Good for standups and 'what should I look at?'.", inputSchema: {}, annotations: READ_ONLY },
    guarded(async () => workspaceSummary(api)),
  );

  server.registerTool(
    "get_next_task",
    {
      title: "Get next task to work on",
      description: "Recommends the next task to pick up: the highest-priority TODO task in an active sprint (ties by board order). Also lists tasks already IN_PROGRESS so you can resume instead of starting something new. Then call start_task.",
      inputSchema: { projectKey: z.string().optional().describe("Limit to one project; omit to consider every active project.") },
      annotations: READ_ONLY,
    },
    guarded(async ({ projectKey }: { projectKey?: string }) => {
      const projects = projectKey ? [{ key: upper(projectKey) }] : (await api<any[]>("GET", "/api/projects")).filter((p) => !p.archived);
      const candidates: (TaskDto & { orderIndex: number; sprintName: string })[] = [];
      const inProgress: string[] = [];
      for (const p of projects) {
        const b = await api<{ sprints: SprintDto[]; tasks: (TaskDto & { orderIndex: number })[] }>("GET", `/api/projects/${p.key}`);
        const active = b.sprints.find((s) => s.status === "ACTIVE");
        if (!active) continue;
        for (const t of b.tasks) {
          if (t.sprintId !== active.id) continue;
          if (t.status === "TODO") candidates.push({ ...t, sprintName: active.name });
          if (t.status === "IN_PROGRESS") inProgress.push(`${t.key} ${t.title}`);
        }
      }
      candidates.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || a.orderIndex - b.orderIndex);
      const next = candidates[0];
      return next
        ? { next: { ...slimTask(next), sprint: next.sprintName, why: `Highest priority (${next.priority}) TODO task in the active sprint.` }, alsoInProgress: inProgress, nextStep: `Call start_task with taskKey "${next.key}" to claim it.` }
        : { next: null, alsoInProgress: inProgress, message: "No TODO tasks in any active sprint. Check the backlog (list_tasks sprint:'backlog') or start a sprint." };
    }),
  );

  // list_sprints is a convenience over get_project for clients that just want sprint metadata
  server.registerTool(
    "list_sprints",
    { title: "List sprints", description: "List a project's sprints with ids, names, status (DRAFT/ACTIVE/COMPLETED), goals and dates.", inputSchema: { projectKey: z.string() }, annotations: READ_ONLY },
    guarded(async ({ projectKey }: { projectKey: string }) => (await getSprints(api, projectKey)).map((s) => ({ id: s.id, name: s.name, status: s.status, goal: s.goal, startDate: s.startDate?.slice(0, 10) ?? null, endDate: s.endDate?.slice(0, 10) ?? null }))),
  );
}

