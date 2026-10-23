import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ApiFn } from "../api";
import { ApiError } from "../api";
import { findColumn, getColumns, getTask, guarded, moveToColumn, PRIORITIES, resolveColumnRef, slimTask, toIso, TYPES, upper, type TaskDto } from "../helpers";

const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;
const WRITE_IDEMPOTENT = { ...WRITE, idempotentHint: true } as const;
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false } as const;

const labels = z.array(z.string().min(1).max(24)).max(8).describe("Up to 8 short labels; stored lower-case.");
const columnRef = z.string().describe('A board column name such as "To Do", "In Progress" or "Done" (see list_columns), or "backlog".');
const dueDate = z.string().describe("YYYY-MM-DD.");

const brief = async (_api: ApiFn, t: TaskDto) => slimTask(t);

export function registerTaskTools(server: McpServer, api: ApiFn) {
  server.registerTool(
    "create_task",
    {
      title: "Create task",
      description: 'Create one task. It goes to the backlog unless you pass column (e.g. "To Do" puts it straight on the board). A git branch name is generated automatically. Returns the new task key (e.g. CORE-12).',
      inputSchema: {
        projectKey: z.string().describe("Project key, e.g. CORE."),
        title: z.string().min(1).max(200),
        description: z.string().max(20000).optional().describe("Markdown: context, acceptance criteria, links."),
        type: z.enum(TYPES).optional().describe("Default FEATURE."),
        priority: z.enum(PRIORITIES).optional().describe("P0 critical … P3 low. Default P2."),
        column: columnRef.optional().describe("Where to put it. Default: the backlog."),
        estimate: z.number().int().min(0).max(100).optional().describe("Story points."),
        dueDate: dueDate.optional(),
        labels: labels.optional(),
        branchName: z.string().max(200).optional().describe("Override the generated git branch name."),
      },
      annotations: WRITE,
    },
    guarded(async (a: { projectKey: string; title: string; description?: string; type?: string; priority?: string; column?: string; estimate?: number; dueDate?: string; labels?: string[]; branchName?: string }) => {
      const columnId = a.column !== undefined ? await resolveColumnRef(api, a.projectKey, a.column) : null;
      const t = await api<TaskDto>("POST", "/api/tasks", { projectKey: upper(a.projectKey), title: a.title, description: a.description, type: a.type, priority: a.priority, columnId, estimate: a.estimate, dueDate: toIso(a.dueDate), labels: a.labels, branchName: a.branchName });
      return { created: await brief(api, t) };
    }),
  );

  server.registerTool(
    "create_tasks",
    {
      title: "Create many tasks",
      description: "Create up to 50 tasks in one project in a single call (e.g. when breaking a feature down). Each task may name a board column (like To Do); omit it for the backlog. An unknown column name rejects the whole call so a typo can't scatter tasks.",
      inputSchema: {
        projectKey: z.string(),
        tasks: z.array(z.object({
          title: z.string().min(1).max(200),
          description: z.string().max(20000).optional(),
          type: z.enum(TYPES).optional(),
          priority: z.enum(PRIORITIES).optional(),
          column: columnRef.optional(),
          estimate: z.number().int().min(0).max(100).optional(),
          dueDate: dueDate.optional(),
          labels: labels.optional(),
        })).min(1).max(50),
      },
      annotations: WRITE,
    },
    guarded(async ({ projectKey, tasks }: { projectKey: string; tasks: { title: string; description?: string; type?: string; priority?: string; column?: string; estimate?: number; dueDate?: string; labels?: string[] }[] }) => {
      const columns = await getColumns(api, projectKey);
      const rows = tasks.map((t) => {
        let column: string | undefined;
        if (t.column !== undefined && !/^(backlog|none)$/i.test(t.column)) column = findColumn(columns, t.column).name; // must be an existing column
        return { ...t, column, dueDate: toIso(t.dueDate) ?? undefined };
      });
      const r = await api<{ created: number; keys: string[] }>("POST", "/api/tasks/import", { projectKey: upper(projectKey), tasks: rows });
      return { created: r.created, keys: r.keys };
    }),
  );

  server.registerTool(
    "update_task",
    {
      title: "Update task fields",
      description: "Change a task's title, description, type, priority, estimate, due date, labels, branch or PR link. Only the fields you pass change; pass null to clear estimate/dueDate/branchName/prUrl. To change its board column (or send it back to the backlog) use move_task.",
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
      },
      annotations: WRITE_IDEMPOTENT,
    },
    guarded(async (a: { taskKey: string; title?: string; description?: string; type?: string; priority?: string; estimate?: number | null; dueDate?: string | null; labels?: string[]; branchName?: string | null; prUrl?: string | null }) => {
      const { taskKey, ...fields } = a;
      const existing = await getTask(api, taskKey);
      const patch: Record<string, unknown> = { ...fields };
      if ("dueDate" in fields) patch.dueDate = toIso(fields.dueDate);
      if (Object.keys(patch).length === 0) throw new ApiError(400, "Nothing to update: pass at least one field.");
      return { updated: await brief(api, await api<TaskDto>("PATCH", `/api/tasks/${existing.id}`, patch)) };
    }),
  );

  server.registerTool(
    "move_task",
    {
      title: "Move task to a board column",
      description: 'Move a task to a board column by name (same as dragging the card), for example "To Do", "In Progress" or "Done"; use "backlog" to send it back to the backlog. It lands at the bottom of the column unless position is "top". Moving a task out of Done un-archives it.',
      inputSchema: { taskKey: z.string(), column: columnRef, position: z.enum(["top", "bottom"]).optional().describe("Default bottom.") },
      annotations: WRITE_IDEMPOTENT,
    },
    guarded(async ({ taskKey, column, position }: { taskKey: string; column: string; position?: "top" | "bottom" }) => {
      const t = await getTask(api, taskKey);
      const columnId = await resolveColumnRef(api, t.projectKey, column);
      return { moved: await brief(api, await moveToColumn(api, t, columnId, position ?? "bottom")) };
    }),
  );

  server.registerTool(
    "start_task",
    {
      title: "Start working on a task",
      description: "Claim a task: moves it to the first In Progress column (pulling it from the backlog if needed) and returns everything needed to start (description, subtasks, branch name and the git command to create it). Use after get_next_task. Optionally leaves a comment such as your plan.",
      inputSchema: { taskKey: z.string(), comment: z.string().max(5000).optional().describe("e.g. a short plan; recorded as a comment.") },
      annotations: WRITE_IDEMPOTENT,
    },
    guarded(async ({ taskKey, comment }: { taskKey: string; comment?: string }) => {
      let t = await getTask(api, taskKey);
      if (t.status === "DONE") throw new ApiError(409, `${t.key} is already done. Reopen it with move_task first if that's intended.`);
      const already = t.status === "IN_PROGRESS";
      if (!already) {
        const target = (await getColumns(api, t.projectKey)).find((c) => c.category === "IN_PROGRESS");
        if (!target) throw new ApiError(409, `${t.projectKey} has no In Progress column. Add one with create_column.`);
        await moveToColumn(api, t, target.id);
      }
      if (comment) await api("POST", `/api/tasks/${t.id}/comments`, { body: comment });
      t = await getTask(api, taskKey);
      return {
        note: already ? "Task was already in progress." : `Task moved to ${t.columnName}.`,
        task: { ...slimTask(t), description: t.description, subtasks: t.subtasks.map((s: any) => ({ id: s.id, title: s.title, done: s.done })) },
        gitCheckout: t.branchName ? `git checkout -b ${t.branchName}` : null,
      };
    }),
  );

  server.registerTool(
    "submit_for_review",
    {
      title: "Submit task for review",
      description: 'Mark work as ready for review: moves the task to a column whose name contains "review" (if the project has one), optionally saves the pull request URL on it and adds a summary comment. If there is no review column the task stays where it is and the response says so (add one with create_column).',
      inputSchema: { taskKey: z.string(), prUrl: z.string().url().optional().describe("Pull request URL."), comment: z.string().max(5000).optional().describe("What was done / what to check.") },
      annotations: WRITE_IDEMPOTENT,
    },
    guarded(async ({ taskKey, prUrl, comment }: { taskKey: string; prUrl?: string; comment?: string }) => {
      let t = await getTask(api, taskKey);
      if (prUrl) await api("PATCH", `/api/tasks/${t.id}`, { prUrl });
      if (comment) await api("POST", `/api/tasks/${t.id}/comments`, { body: comment });
      const review = (await getColumns(api, t.projectKey)).find((c) => /review/i.test(c.name));
      if (review) t = await moveToColumn(api, t, review.id);
      else t = await getTask(api, taskKey);
      return { submitted: await brief(api, t), ...(review ? {} : { note: `${t.projectKey} has no review column, so the task was left in "${t.columnName ?? "Backlog"}". PR link and comment were saved. Add a "Review" column with create_column if you want one.` }) };
    }),
  );

  server.registerTool(
    "complete_task",
    {
      title: "Complete task",
      description: "Mark a task done: moves it to the first Done column and records the completion time. Optionally adds a closing comment. Use archive_task afterwards to hide it from the board.",
      inputSchema: { taskKey: z.string(), comment: z.string().max(5000).optional() },
      annotations: WRITE_IDEMPOTENT,
    },
    guarded(async ({ taskKey, comment }: { taskKey: string; comment?: string }) => {
      const t = await getTask(api, taskKey);
      const done = (await getColumns(api, t.projectKey)).find((c) => c.category === "DONE");
      if (!done) throw new ApiError(409, `${t.projectKey} has no Done column. Add one with create_column (category DONE).`);
      if (comment) await api("POST", `/api/tasks/${t.id}/comments`, { body: comment });
      return { completed: await brief(api, await moveToColumn(api, t, done.id)) };
    }),
  );

  server.registerTool(
    "archive_task",
    {
      title: "Archive or restore a done task",
      description: "Archive a done task: it disappears from the board but stays Done and is listed under Archived below the backlog. Pass restore:true to bring an archived task back onto the board. Only done tasks can be archived.",
      inputSchema: { taskKey: z.string(), restore: z.boolean().optional().describe("true to un-archive. Default false (archive).") },
      annotations: WRITE_IDEMPOTENT,
    },
    guarded(async ({ taskKey, restore }: { taskKey: string; restore?: boolean }) => {
      const t = await getTask(api, taskKey);
      return { [restore ? "restored" : "archived"]: await brief(api, await api<TaskDto>("PATCH", `/api/tasks/${t.id}`, { archived: !restore })) };
    }),
  );

  server.registerTool(
    "archive_done_tasks",
    {
      title: "Archive all done tasks in a project",
      description: "Archive every task in the project's Done columns (or in one named Done column) in one call, to clear the board. They stay Done and are listed under Archived.",
      inputSchema: { projectKey: z.string(), column: z.string().optional().describe("A specific Done column name. Default: all Done columns.") },
      annotations: WRITE_IDEMPOTENT,
    },
    guarded(async ({ projectKey, column }: { projectKey: string; column?: string }) => {
      const columns = await getColumns(api, projectKey);
      const targets = column ? [findColumn(columns, column)] : columns.filter((c) => c.category === "DONE");
      if (targets.some((c) => c.category !== "DONE")) throw new ApiError(409, "Only Done columns can be archived.");
      let archived = 0;
      for (const c of targets) archived += (await api<{ archived: number }>("POST", `/api/projects/${upper(projectKey)}/columns/${c.id}/archive`)).archived;
      return { archived, columns: targets.map((c) => c.name) };
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
