import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ApiFn } from "./api";
import { getSprints, getTask, slimTask } from "./helpers";
import { registerProjectTools } from "./tools/projects";
import { registerReadTools, workspaceSummary } from "./tools/read";
import { registerSprintTools } from "./tools/sprints";
import { registerTaskTools } from "./tools/tasks";

export const MCP_SERVER_NAME = "devboard";
export const MCP_SERVER_VERSION = "1.0.0";

/** Shown to the model by clients that support server instructions: how DevBoard is organised and the safe way to use it. */
const INSTRUCTIONS = `DevBoard is a Kanban/sprint task manager.
- Projects have a short KEY (e.g. CORE). Tasks are addressed by key: CORE-12. Call list_projects first if you don't know the keys.
- A task has a status (BACKLOG, TODO, IN_PROGRESS, IN_REVIEW, DONE), a priority (P0 critical … P3 low), a type (FEATURE, BUG, CHORE, SPIKE), optional estimate (story points), due date, labels, a git branch name and a PR link.
- Work is planned in sprints: DRAFT → ACTIVE → COMPLETED. Only tasks in the ACTIVE sprint appear on the board (columns TODO, IN_PROGRESS, IN_REVIEW, DONE). Tasks with no sprint are in the backlog.
- Typical agent loop: get_next_task → start_task → do the work → submit_for_review (with the PR URL) → complete_task once merged.
- Prefer small, targeted calls: list_tasks returns summaries, get_task returns full detail.
- Destructive tools (delete_task, delete_sprint, delete_project) are permanent: only use them when the user explicitly asked. Prefer archiving a project over deleting it.`;

export function createDevBoardMcpServer(api: ApiFn): McpServer {
  const server = new McpServer({ name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION }, { instructions: INSTRUCTIONS });

  registerReadTools(server, api);
  registerTaskTools(server, api);
  registerSprintTools(server, api);
  registerProjectTools(server, api);

  /* ---------- resources: read-only context an app can attach ---------- */
  server.registerResource(
    "workspace",
    "devboard://workspace",
    { title: "Workspace summary", description: "Active sprints, open P0s, overdue and due-soon tasks across all projects.", mimeType: "application/json" },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(await workspaceSummary(api), null, 2) }] }),
  );

  server.registerResource(
    "task",
    new ResourceTemplate("devboard://tasks/{key}", { list: undefined }),
    { title: "Task", description: "Full details of a task by key, e.g. devboard://tasks/CORE-12.", mimeType: "application/json" },
    async (uri, { key }) => {
      const t = await getTask(api, String(key));
      const body = { ...slimTask(t, await getSprints(api, t.projectKey)), description: t.description, subtasks: t.subtasks, comments: t.comments };
      return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(body, null, 2) }] };
    },
  );

  server.registerResource(
    "project",
    new ResourceTemplate("devboard://projects/{key}", { list: undefined }),
    { title: "Project board", description: "A project's sprints and tasks, e.g. devboard://projects/CORE.", mimeType: "application/json" },
    async (uri, { key }) => {
      const b = await api<any>("GET", `/api/projects/${String(key).toUpperCase()}`);
      const body = { project: { key: b.project.key, name: b.project.name, description: b.project.description }, sprints: b.sprints, tasks: b.tasks.map((t: any) => slimTask(t, b.sprints)) };
      return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(body, null, 2) }] };
    },
  );

  /* ---------- prompts: reusable workflows a user can pick in their client ---------- */
  const user = (text: string) => ({ messages: [{ role: "user" as const, content: { type: "text" as const, text } }] });

  server.registerPrompt(
    "plan_sprint",
    { title: "Plan a sprint", description: "Propose the contents of the next sprint from the backlog.", argsSchema: { projectKey: z.string().describe("Project key, e.g. CORE."), goal: z.string().optional().describe("What the sprint should achieve."), capacityPoints: z.string().optional().describe("Story points the team can handle.") } },
    ({ projectKey, goal, capacityPoints }) =>
      user(`Plan the next sprint for project ${projectKey}${goal ? ` with the goal: "${goal}"` : ""}${capacityPoints ? `. Capacity: about ${capacityPoints} story points` : ""}.
1. Call get_project to see existing sprints and list_tasks (sprint: "backlog") to see candidates.
2. Propose a set of tasks that fits the goal and capacity, favouring P0/P1 and tasks with estimates. Note risks and anything missing an estimate.
3. Show me the proposal and ask for approval BEFORE changing anything.
4. When I approve: create_sprint if needed, then move each chosen task with update_task (sprint), and offer to start_sprint.`),
  );

  server.registerPrompt(
    "daily_standup",
    { title: "Daily standup", description: "Summarise progress, blockers and what's next.", argsSchema: { projectKey: z.string().optional().describe("Limit to one project.") } },
    ({ projectKey }) =>
      user(`Give me a concise standup${projectKey ? ` for ${projectKey}` : " across all projects"}.
Use get_workspace_summary and list_tasks (status IN_PROGRESS and IN_REVIEW). Report: what is in progress, what is waiting for review, anything overdue or P0, and the single most important thing to do next. Keep it under 15 lines.`),
  );

  server.registerPrompt(
    "triage_backlog",
    { title: "Triage the backlog", description: "Review backlog tasks and suggest priorities, estimates and clean-ups.", argsSchema: { projectKey: z.string().describe("Project key.") } },
    ({ projectKey }) =>
      user(`Triage the backlog of ${projectKey}. Call list_tasks (sprint: "backlog"). For each task note whether it is missing a description, estimate or sensible priority, is a duplicate of another, or looks obsolete. Present a table of suggested changes and ask which to apply; then apply the approved ones with update_task. Never delete anything without my explicit say-so.`),
  );

  server.registerPrompt(
    "work_on_next_task",
    { title: "Work on the next task", description: "Agent loop: claim the next task, do it, hand it over for review.", argsSchema: { projectKey: z.string().optional().describe("Limit to one project.") } },
    ({ projectKey }) =>
      user(`Pick up and work on the next task${projectKey ? ` in ${projectKey}` : ""}.
1. get_next_task, then start_task for the recommended task (read its description and subtasks carefully).
2. Do the work in the codebase on the suggested git branch. Tick subtasks off with set_subtask_done as you finish them and leave short progress notes with add_comment.
3. When finished and the changes are pushed, call submit_for_review with the PR URL and a summary of what you did.
Do not call complete_task yourself unless I tell you the work was reviewed and merged.`),
  );

  return server;
}
