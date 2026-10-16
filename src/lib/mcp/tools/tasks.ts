import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ApiFn } from "../api";
import { ApiError } from "../api";
import { BOARD_STATUSES, findSprint, getSprints, getTask, guarded, moveToStatus, PRIORITIES, resolveSprintRef, slimTask, toIso, TYPES, upper, type TaskDto } from "../helpers";

const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;
const WRITE_IDEMPOTENT = { ...WRITE, idempotentHint: true } as const;
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false } as const;

const labels = z.array(z.string().min(1).max(24)).max(8).describe("Up to 8 short labels; stored lower-case.");
const sprintRef = z.string().describe('"active" (the active sprint), "backlog" (no sprint), or a sprint name/id.');
const dueDate = z.string().describe("YYYY-MM-DD.");

async function brief(api: ApiFn, t: TaskDto) {
  return slimTask(t, await getSprints(api, t.projectKey));
}

export function registerTaskTools(server: McpServer, api: ApiFn) {
  server.registerTool(
    "create_task",
    {
      title: "Create task",
      description: 'Create one task. Goes to the backlog unless you pass sprint ("active" puts it on the board as TODO). A git branch name is generated automatically. Returns the new task key (e.g. CORE-12).',
      inputSchema: {
        projectKey: z.string().describe("Project key, e.g. CORE."),
        title: z.string().min(1).max(200),
        description: z.string().max(20000).optional().describe("Markdown: context, acceptance criteria, links."),
        type: z.enum(TYPES).optional().describe("Default FEATURE."),
        priority: z.enum(PRIORITIES).optional().describe("P0 critical … P3 low. Default P2."),
        sprint: sprintRef.optional(),
        status: z.enum(BOARD_STATUSES).optional().describe("Only used with an active sprint. Default TODO."),
        estimate: z.number().int().min(0).max(100).optional().describe("Story points."),
        dueDate: dueDate.optional(),
        labels: labels.optional(),
        branchName: z.string().max(200).optional().describe("Override the generated git branch name."),
      },
      annotations: WRITE,
    },
    guarded(async (a: { projectKey: string; title: string; description?: string; type?: string; priority?: string; sprint?: string; status?: string; estimate?: number; dueDate?: string; labels?: string[]; branchName?: string }) => {
      const sprintId = a.sprint !== undefined ? await resolveSprintRef(api, a.projectKey, a.sprint) : undefined;
      const t = await api<TaskDto>("POST", "/api/tasks", { projectKey: upper(a.projectKey), title: a.title, description: a.description, type: a.type, priority: a.priority, sprintId, status: a.status, estimate: a.estimate, dueDate: toIso(a.dueDate), labels: a.labels, branchName: a.branchName });
      return { created: await brief(api, t) };
    }),
  );

  server.registerTool(
    "create_tasks",
    {
      title: "Create many tasks",
      description: "Create up to 50 tasks in one project in a single call (e.g. when breaking a feature down). Each task may name an existing sprint; unknown sprint names are rejected so a typo can't create stray sprints.",
      inputSchema: {
        projectKey: z.string(),
        tasks: z.array(z.object({
          title: z.string().min(1).max(200),
          description: z.string().max(20000).optional(),
          type: z.enum(TYPES).optional(),
          priority: z.enum(PRIORITIES).optional(),
          sprint: sprintRef.optional(),
          estimate: z.number().int().min(0).max(100).optional(),
          dueDate: dueDate.optional(),
          labels: labels.optional(),
        })).min(1).max(50),
      },
      annotations: WRITE,
    },
    guarded(async ({ projectKey, tasks }: { projectKey: string; tasks: { title: string; description?: string; type?: string; priority?: string; sprint?: string; estimate?: number; dueDate?: string; labels?: string[] }[] }) => {
      const sprints = await getSprints(api, projectKey);
      const rows = tasks.map((t) => {
        let sprint: string | undefined;
        if (t.sprint !== undefined && !/^(backlog|none)$/i.test(t.sprint)) sprint = findSprint(sprints, t.sprint).name; // existing name only
        return { ...t, sprint, dueDate: toIso(t.dueDate) ?? undefined };
      });
      const r = await api<{ created: number; keys: string[]; sprintsCreated: string[] }>("POST", "/api/tasks/import", { projectKey: upper(projectKey), tasks: rows });
      return { created: r.created, keys: r.keys };
    }),
  );

  server.registerTool(
    "update_task",
    {
      title: "Update task fields",
      description: "Change a task's title, description, type, priority, estimate, due date, labels, branch, PR link, or sprint. Only the fields you pass change; pass null to clear estimate/dueDate/branchName/prUrl. To change its board column use move_task. Moving it between sprints (sprint: name | 'active' | 'backlog') resets its column to TODO (in an active sprint) or BACKLOG.",
      inputSchema: {
        taskKey: z.string(),
        title: z.string().min(1).max(200).optional(),
        description: z.string().max(20000).optional(),
        type: z.enum(TYPES).optional(),
        priority: z.enum(PRIORITIES).optional(),
        estimate: z.number().int().min(0).max(100).nullable().optional(),
        dueDate: dueDate.nullable().optional(),
        labels: labels.optional(),
        branchName: z.string().max(200).nullable().optional(),
        prUrl: z.string().url().nullable().optional(),
        sprint: sprintRef.optional(),
      },
      annotations: WRITE_IDEMPOTENT,
    },
    guarded(async (a: { taskKey: string; title?: string; description?: string; type?: string; priority?: string; estimate?: number | null; dueDate?: string | null; labels?: string[]; branchName?: string | null; prUrl?: string | null; sprint?: string }) => {
      const { taskKey, sprint, ...fields } = a;
      const existing = await getTask(api, taskKey);
      const patch: Record<string, unknown> = { ...fields };
      if ("dueDate" in fields) patch.dueDate = toIso(fields.dueDate);
      if (sprint !== undefined) patch.sprintId = await resolveSprintRef(api, existing.projectKey, sprint);
      if (Object.keys(patch).length === 0) throw new ApiError(400, "Nothing to update: pass at least one field.");
      return { updated: await brief(api, await api<TaskDto>("PATCH", `/api/tasks/${existing.id}`, patch)) };
    }),
  );

  server.registerTool(
    "move_task",
    {
      title: "Move task to a board column",
      description: "Move a task to TODO, IN_PROGRESS, IN_REVIEW or DONE (same as dragging a card). It lands at the bottom of the column unless position is 'top'. The task must be in a sprint; for backlog tasks first use update_task with sprint.",
      inputSchema: { taskKey: z.string(), status: z.enum(BOARD_STATUSES), position: z.enum(["top", "bottom"]).optional().describe("Default bottom.") },
      annotations: WRITE_IDEMPOTENT,
    },
    guarded(async ({ taskKey, status, position }: { taskKey: string; status: string; position?: "top" | "bottom" }) => {
      const t = await getTask(api, taskKey);
      return { moved: await brief(api, await moveToStatus(api, t, status, position ?? "bottom")) };
    }),
  );

  server.registerTool(
    "start_task",
    {
      title: "Start working on a task",
      description: "Claim a task: moves it to IN_PROGRESS and returns everything needed to start (description, subtasks, branch name and the git command to create it). Use after get_next_task. Optionally leaves a comment such as your plan.",
      inputSchema: { taskKey: z.string(), comment: z.string().max(5000).optional().describe("e.g. a short plan; recorded as a comment.") },
      annotations: WRITE_IDEMPOTENT,
    },
    guarded(async ({ taskKey, comment }: { taskKey: string; comment?: string }) => {
      let t = await getTask(api, taskKey);
      if (t.status === "DONE") throw new ApiError(409, `${t.key} is already DONE. Reopen it with move_task first if that's intended.`);
      const already = t.status === "IN_PROGRESS";
      if (!already) await moveToStatus(api, t, "IN_PROGRESS");
      if (comment) await api("POST", `/api/tasks/${t.id}/comments`, { body: comment });
      t = await getTask(api, taskKey);
      return {
        note: already ? "Task was already in progress." : "Task moved to IN_PROGRESS.",
        task: { ...slimTask(t, await getSprints(api, t.projectKey)), description: t.description, subtasks: t.subtasks.map((s: any) => ({ id: s.id, title: s.title, done: s.done })) },
        gitCheckout: t.branchName ? `git checkout -b ${t.branchName}` : null,
      };
    }),
  );

  server.registerTool(
    "submit_for_review",
    {
      title: "Submit task for review",
      description: "Mark work as ready for review: moves the task to IN_REVIEW, optionally saves the pull request URL on it and adds a summary comment.",
      inputSchema: { taskKey: z.string(), prUrl: z.string().url().optional().describe("Pull request URL."), comment: z.string().max(5000).optional().describe("What was done / what to check.") },
      annotations: WRITE_IDEMPOTENT,
    },
    guarded(async ({ taskKey, prUrl, comment }: { taskKey: string; prUrl?: string; comment?: string }) => {
      const t = await getTask(api, taskKey);
      if (prUrl) await api("PATCH", `/api/tasks/${t.id}`, { prUrl });
      if (comment) await api("POST", `/api/tasks/${t.id}/comments`, { body: comment });
      return { submitted: await brief(api, await moveToStatus(api, t, "IN_REVIEW")) };
    }),
  );

  server.registerTool(
    "complete_task",
    {
      title: "Complete task",
      description: "Mark a task DONE (moves it to the Done column and records the completion time). Optionally adds a closing comment.",
      inputSchema: { taskKey: z.string(), comment: z.string().max(5000).optional() },
      annotations: WRITE_IDEMPOTENT,
    },
    guarded(async ({ taskKey, comment }: { taskKey: string; comment?: string }) => {
      const t = await getTask(api, taskKey);
      if (comment) await api("POST", `/api/tasks/${t.id}/comments`, { body: comment });
      return { completed: await brief(api, await moveToStatus(api, t, "DONE")) };
    }),
  );

  server.registerTool(
    "add_comment",
    { title: "Add comment", description: "Add a Markdown comment to a task (progress notes, questions, findings).", inputSchema: { taskKey: z.string(), body: z.string().min(1).max(5000) }, annotations: WRITE },
    guarded(async ({ taskKey, body }: { taskKey: string; body: string }) => {
      const t = await getTask(api, taskKey);
      const c = await api<any>("POST", `/api/tasks/${t.id}/comments`, { body });
      return { added: { task: t.key, commentId: c.id } };
    }),
  );

  server.registerTool(
    "add_subtask",
    { title: "Add subtask", description: "Add a checklist item to a task.", inputSchema: { taskKey: z.string(), title: z.string().min(1).max(200) }, annotations: WRITE },
    guarded(async ({ taskKey, title }: { taskKey: string; title: string }) => {
      const t = await getTask(api, taskKey);
      const s = await api<any>("POST", `/api/tasks/${t.id}/subtasks`, { title });
      return { added: { task: t.key, subtaskId: s.id, title: s.title } };
    }),
  );

  server.registerTool(
    "set_subtask_done",
    {
      title: "Check or uncheck a subtask",
      description: "Mark a subtask done (or not). Identify it by id or by its title (case-insensitive; a unique partial match is fine).",
      inputSchema: { taskKey: z.string(), subtask: z.string().describe("Subtask id or title."), done: z.boolean().optional().describe("Default true.") },
      annotations: WRITE_IDEMPOTENT,
    },
    guarded(async ({ taskKey, subtask, done }: { taskKey: string; subtask: string; done?: boolean }) => {
      const t = await getTask(api, taskKey);
      const list: { id: string; title: string; done: boolean }[] = t.subtasks;
      const q = subtask.trim().toLowerCase();
      const hit = list.find((s) => s.id === subtask) ?? (list.filter((s) => s.title.toLowerCase() === q).length === 1 ? list.find((s) => s.title.toLowerCase() === q) : undefined) ?? (list.filter((s) => s.title.toLowerCase().includes(q)).length === 1 ? list.find((s) => s.title.toLowerCase().includes(q)) : undefined);
      if (!hit) throw new ApiError(404, `No single subtask matches "${subtask}". Subtasks: ${list.map((s) => `"${s.title}"`).join(", ") || "none"}.`);
      await api("PATCH", `/api/tasks/${t.id}/subtasks`, { id: hit.id, done: done ?? true });
      const after = await getTask(api, taskKey);
      return { task: t.key, subtask: hit.title, done: done ?? true, progress: `${after.subtasksDone}/${after.subtasksTotal}` };
    }),
  );

  server.registerTool(
    "delete_task",
    {
      title: "Delete task (permanent)",
      description: "Permanently delete a task with its subtasks, comments and history. This cannot be undone. Only call when the user explicitly asked for deletion; confirm must be true.",
      inputSchema: { taskKey: z.string(), confirm: z.literal(true).describe("Must be true: acknowledges the deletion is permanent.") },
      annotations: DESTRUCTIVE,
    },
    guarded(async ({ taskKey }: { taskKey: string; confirm: true }) => {
      const t = await getTask(api, taskKey);
      await api("DELETE", `/api/tasks/${t.id}`);
      return { deleted: t.key, title: t.title };
    }),
  );
}
