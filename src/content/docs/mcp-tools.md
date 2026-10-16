Everything below is discovered automatically by MCP clients. You don't need to memorise it; it is here so you know what to ask for.

## Reading

| Tool | What it does |
| --- | --- |
| `list_projects` | Lists projects with keys, and whether they are starred or archived. A good first call. |
| `get_project` | One project's sprints and task counts per status. |
| `list_tasks` | Filters tasks by project, sprint (`active`, `backlog` or a name), status, priority, type, label, search text or due date. |
| `search_tasks` | Free-text search across all active projects, including task keys such as `CORE-12`. |
| `get_task` | Full detail of one task: description, subtasks, comments, activity and branch name. |
| `get_workspace_summary` | Everything in flight: sprint progress, open P0 tasks, overdue and due-soon work. |
| `get_next_task` | Recommends the next task to pick up, and lists work already in progress. |
| `list_sprints` | A project's sprints with status, goal and dates. |

## Working on tasks

| Tool | What it does |
| --- | --- |
| `create_task` | Creates one task. Goes to the backlog unless a sprint is given (`active` puts it on the board). |
| `create_tasks` | Creates up to 50 tasks in one call. Unknown sprint names are rejected. |
| `update_task` | Changes title, description, type, priority, estimate, due date, labels, branch, PR link or sprint. |
| `move_task` | Moves a task to a board column, at the top or bottom. |
| `start_task` | Claims a task: moves it to In Progress and returns what is needed to begin. |
| `submit_for_review` | Moves to In Review, optionally saving a PR link and a summary comment. |
| `complete_task` | Moves to Done, optionally with a closing comment. |
| `add_comment` | Adds a Markdown comment. |
| `add_subtask` | Adds a checklist item. |
| `set_subtask_done` | Ticks or unticks a subtask by id or title. |
| `delete_task` | Permanently deletes a task. Requires `confirm: true`. |

## Sprints

| Tool | What it does |
| --- | --- |
| `create_sprint` | Creates a draft sprint. |
| `start_sprint` | Makes a draft sprint active. Only one can be active. |
| `complete_sprint` | Completes the active sprint and moves unfinished tasks to the backlog or another sprint. |
| `update_sprint` | Renames a sprint or changes its goal or dates. |
| `delete_sprint` | Deletes a draft or completed sprint. Requires `confirm: true`. |

## Projects

| Tool | What it does |
| --- | --- |
| `create_project` | Creates a project with a name and key. |
| `update_project` | Changes name, description, colour, starred or archived state. |
| `delete_project` | Deletes a project and everything in it. Requires `confirmKey` matching the project key. |

## Resources

Resources are read-only documents a client can attach to a conversation.

| URI | Content |
| --- | --- |
| `devboard://workspace` | The workspace summary. |
| `devboard://projects/{key}` | One project overview. |
| `devboard://tasks/{key}` | One task in full. |

## Prompts

Prompts are ready-made workflows. In most clients they appear as slash commands.

| Prompt | Use it to |
| --- | --- |
| `plan_sprint` | Propose the next sprint from the backlog, optionally for a goal. |
| `daily_standup` | Summarise progress, blockers and what's next. |
| `triage_backlog` | Suggest priorities, estimates and clean-ups for backlog tasks. |
| `work_on_next_task` | Let the assistant claim the next task, do it and hand it over for review. |

## Example conversation

> **Tip** "Look at the backlog for CORE, create a sprint called *Sprint 5* with the five highest priority tasks, and start it."

The assistant will typically call `list_tasks`, `create_sprint`, `update_task` for each task, and `start_sprint`.
