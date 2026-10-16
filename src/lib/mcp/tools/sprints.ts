import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ApiFn } from "../api";
import { ApiError } from "../api";
import { findSprint, getSprints, guarded, toIso, upper } from "../helpers";

const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;
const WRITE_IDEMPOTENT = { ...WRITE, idempotentHint: true } as const;
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false } as const;
const date = z.string().describe("YYYY-MM-DD.");
const view = (s: any) => ({ id: s.id, name: s.name, status: s.status, goal: s.goal, startDate: s.startDate?.slice(0, 10) ?? null, endDate: s.endDate?.slice(0, 10) ?? null });
const sprintBase = (api: ApiFn, projectKey: string) => `/api/projects/${upper(projectKey)}/sprints`;

export function registerSprintTools(server: McpServer, api: ApiFn) {
  server.registerTool(
    "create_sprint",
    {
      title: "Create sprint",
      description: "Create a DRAFT sprint (a planned time-box of work). Add tasks to it with update_task (sprint: name) and begin it with start_sprint.",
      inputSchema: { projectKey: z.string(), name: z.string().min(1).max(80), goal: z.string().max(300).optional(), startDate: date.optional(), endDate: date.optional() },
      annotations: WRITE,
    },
    guarded(async ({ projectKey, startDate, endDate, ...rest }: { projectKey: string; name: string; goal?: string; startDate?: string; endDate?: string }) =>
      ({ created: view(await api("POST", sprintBase(api, projectKey), { ...rest, startDate: toIso(startDate), endDate: toIso(endDate) })) })),
  );

  server.registerTool(
    "start_sprint",
    {
      title: "Start sprint",
      description: "Start a DRAFT sprint: it becomes the ACTIVE sprint and its tasks appear on the board as TODO. A project can have only one active sprint (complete the current one first). Dates default to today and two weeks out.",
      inputSchema: { projectKey: z.string(), sprint: z.string().describe("Sprint name or id."), startDate: date.optional(), endDate: date.optional() },
      annotations: WRITE_IDEMPOTENT,
    },
    guarded(async ({ projectKey, sprint, startDate, endDate }: { projectKey: string; sprint: string; startDate?: string; endDate?: string }) => {
      const s = findSprint(await getSprints(api, projectKey), sprint);
      return { started: view(await api("PATCH", sprintBase(api, projectKey), { sprintId: s.id, action: "start", startDate: toIso(startDate), endDate: toIso(endDate) })) };
    }),
  );

  server.registerTool(
    "complete_sprint",
    {
      title: "Complete sprint",
      description: "Complete the active sprint (or a named active one). DONE tasks stay in it as history. Unfinished tasks are carried over: to the backlog by default, or into another sprint (moveUnfinishedTo: sprint name/id).",
      inputSchema: { projectKey: z.string(), sprint: z.string().optional().describe('Default "active".'), moveUnfinishedTo: z.string().optional().describe('"backlog" (default) or a draft sprint name/id.') },
      annotations: WRITE_IDEMPOTENT,
    },
    guarded(async ({ projectKey, sprint, moveUnfinishedTo }: { projectKey: string; sprint?: string; moveUnfinishedTo?: string }) => {
      const sprints = await getSprints(api, projectKey);
      const s = findSprint(sprints, sprint ?? "active");
      const target = !moveUnfinishedTo || /^(backlog|none)$/i.test(moveUnfinishedTo) ? null : findSprint(sprints, moveUnfinishedTo).id;
      const r = await api<{ sprint: any; movedTasks: number }>("PATCH", sprintBase(api, projectKey), { sprintId: s.id, action: "complete", moveUnfinishedTo: target });
      return { completed: view(r.sprint), unfinishedTasksCarriedOver: r.movedTasks, carriedTo: target ? moveUnfinishedTo : "backlog" };
    }),
  );

  server.registerTool(
    "update_sprint",
    {
      title: "Update sprint",
      description: "Rename a sprint or change its goal or dates.",
      inputSchema: { projectKey: z.string(), sprint: z.string().describe("Sprint name or id."), name: z.string().min(1).max(80).optional(), goal: z.string().max(300).nullable().optional(), startDate: date.nullable().optional(), endDate: date.nullable().optional() },
      annotations: WRITE_IDEMPOTENT,
    },
    guarded(async ({ projectKey, sprint, ...f }: { projectKey: string; sprint: string; name?: string; goal?: string | null; startDate?: string | null; endDate?: string | null }) => {
      if (Object.keys(f).length === 0) throw new ApiError(400, "Nothing to update: pass at least one field.");
      const s = findSprint(await getSprints(api, projectKey), sprint);
      const body: Record<string, unknown> = { sprintId: s.id, action: "update", ...f };
      if ("startDate" in f) body.startDate = toIso(f.startDate);
      if ("endDate" in f) body.endDate = toIso(f.endDate);
      return { updated: view(await api("PATCH", sprintBase(api, projectKey), body)) };
    }),
  );

  server.registerTool(
    "delete_sprint",
    {
      title: "Delete sprint (permanent)",
      description: "Delete a DRAFT or COMPLETED sprint (the active sprint must be completed instead). Its unfinished tasks return to the backlog. Cannot be undone; confirm must be true.",
      inputSchema: { projectKey: z.string(), sprint: z.string().describe("Sprint name or id."), confirm: z.literal(true) },
      annotations: DESTRUCTIVE,
    },
    guarded(async ({ projectKey, sprint }: { projectKey: string; sprint: string; confirm: true }) => {
      const s = findSprint(await getSprints(api, projectKey), sprint);
      await api("PATCH", sprintBase(api, projectKey), { sprintId: s.id, action: "delete" });
      return { deleted: s.name };
    }),
  );
}
