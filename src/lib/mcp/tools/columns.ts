import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ApiFn } from "../api";
import { ApiError } from "../api";
import { CATEGORIES, findColumn, getColumns, guarded, upper } from "../helpers";

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;
const WRITE_IDEMPOTENT = { ...WRITE, idempotentHint: true } as const;
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false } as const;

const category = z.enum(CATEGORIES).describe("What the column means: TODO (not started), IN_PROGRESS (being worked on) or DONE (finished; can be archived).");
const view = (c: { id: string; name: string; category: string }) => ({ id: c.id, name: c.name, category: c.category });

export function registerColumnTools(server: McpServer, api: ApiFn) {
  server.registerTool(
    "list_columns",
    { title: "List board columns", description: "A project's board columns in order, with their meaning (TODO / IN_PROGRESS / DONE) and how many tasks each holds (archived tasks not counted). New projects have To Do, In Progress and Done.", inputSchema: { projectKey: z.string() }, annotations: READ_ONLY },
    guarded(async ({ projectKey }: { projectKey: string }) => {
      const board = await api<{ columns: { id: string; name: string; category: string }[]; tasks: { columnId: string | null; archivedAt: string | null }[] }>("GET", `/api/projects/${upper(projectKey)}`);
      return board.columns.map((c) => ({ ...view(c), tasks: board.tasks.filter((t) => t.columnId === c.id && !t.archivedAt).length }));
    }),
  );

  server.registerTool(
    "create_column",
    {
      title: "Add a board column",
      description: 'Add a column to a project\'s board (for example "In Review" or "QA"), at the right end. Pick the category that says what it means, so dashboards and done-rules work: use IN_PROGRESS for work stages, DONE for finished states.',
      inputSchema: { projectKey: z.string(), name: z.string().min(1).max(40), category: category.optional().describe("Default IN_PROGRESS.") },
      annotations: WRITE,
    },
    guarded(async ({ projectKey, name, category: cat }: { projectKey: string; name: string; category?: string }) => ({ created: view(await api<any>("POST", `/api/projects/${upper(projectKey)}/columns`, { name, category: cat ?? "IN_PROGRESS" })) })),
  );

  server.registerTool(
    "update_column",
    {
      title: "Rename, retype or move a column",
      description: "Rename a column, change its category (tasks inside follow the new meaning), or shift it one place left or right on the board.",
      inputSchema: { projectKey: z.string(), column: z.string().describe("Column name or id."), name: z.string().min(1).max(40).optional(), category: category.optional(), direction: z.enum(["left", "right"]).optional() },
      annotations: WRITE_IDEMPOTENT,
    },
    guarded(async ({ projectKey, column, ...patch }: { projectKey: string; column: string; name?: string; category?: string; direction?: string }) => {
      if (Object.keys(patch).length === 0) throw new ApiError(400, "Nothing to update: pass name, category or direction.");
      const c = findColumn(await getColumns(api, projectKey), column);
      return { updated: view(await api<any>("PATCH", `/api/projects/${upper(projectKey)}/columns/${c.id}`, patch)) };
    }),
  );

  server.registerTool(
    "delete_column",
    {
      title: "Delete a board column (permanent)",
      description: "Delete a column. If it holds tasks (archived ones too) they are moved to the column named in moveTo, which is then required. The last column can't be deleted. Only call when the user asked for it; confirm must be true.",
      inputSchema: { projectKey: z.string(), column: z.string().describe("Column name or id."), moveTo: z.string().optional().describe("Column that receives the tasks."), confirm: z.literal(true).describe("Must be true.") },
      annotations: DESTRUCTIVE,
    },
    guarded(async ({ projectKey, column, moveTo }: { projectKey: string; column: string; moveTo?: string; confirm: true }) => {
      const columns = await getColumns(api, projectKey);
      const c = findColumn(columns, column);
      const target = moveTo ? findColumn(columns, moveTo) : null;
      const r = await api<{ moved: number }>("DELETE", `/api/projects/${upper(projectKey)}/columns/${c.id}${target ? `?moveTo=${target.id}` : ""}`);
      return { deleted: c.name, tasksMovedTo: target?.name ?? null, moved: r.moved };
    }),
  );
}
