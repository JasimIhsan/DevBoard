Everything below is discovered automatically by MCP clients. You don't need to memorise it; it is here so you know what to ask for.

## Reading

| Tool | What it does |
| --- | --- |
| `list_projects` | Lists projects with keys, and whether they are starred or archived. A good first call. |
| `get_project` | One project's board columns (with task counts), backlog size and archived count. |
| `list_columns` | A project's board columns in order, with their type and task counts. |
| `list_tasks` | Filters tasks by project, column (or `backlog`), status, priority, type, label, search text or due date. Archived tasks only with `archived`. |
| `search_tasks` | Free-text search across all active projects, including task keys such as `CORE-12`. |
| `get_task` | Full detail of one task: description, subtasks, comments, activity and branch name. |
| `get_workspace_summary` | Everything in flight: tasks per column, backlog size, open P0 tasks, overdue and due-soon work. |
| `get_next_task` | Recommends the next task to pick up (highest priority waiting in a To Do column), and lists work already in progress. |

## Working on tasks

| Tool | What it does |
| --- | --- |
| `create_task` | Creates one task. Goes to the backlog unless a `column` is given (for example `To Do`). |
| `create_tasks` | Creates up to 50 tasks in one call. Unknown column names are rejected. |
| `update_task` | Changes title, description, type, priority, estimate, due date, labels, branch or PR link. |
| `move_task` | Moves a task to a board column by name, or back to the `backlog`. At the top or bottom. |
| `start_task` | Claims a task: moves it to the first In Progress column and returns what is needed to begin. |
| `submit_for_review` | Moves to a column whose name contains "review" (if the project has one), saving a PR link and summary comment. |
| `complete_task` | Moves to the first Done column, optionally with a closing comment. |
| `archive_task` | Archives a done task (hides it from the board), or restores it with `restore: true`. |
| `archive_done_tasks` | Archives every task in a project's Done columns in one call. |
| `add_comment` | Adds a Markdown comment. |
| `add_subtask` | Adds a checklist item. |
| `set_subtask_done` | Ticks or unticks a subtask by id or title. |
| `delete_task` | Permanently deletes a task. Requires `confirm: true`. |

## Columns

| Tool | What it does |
| --- | --- |
| `create_column` | Adds a board column with a name and a type (`TODO`, `IN_PROGRESS` or `DONE`). |
| `update_column` | Renames a column, changes its type, or moves it left or right. |
| `delete_column` | Deletes a column, moving its tasks to `moveTo`. Requires `confirm: true`. |

## Projects

| Tool | What it does |
| --- | --- |
| `create_project` | Creates a project with a name and key. It starts with To Do, In Progress and Done columns. |
| `update_project` | Changes name, description, colour, starred or archived state. |
| `delete_project` | Deletes a project and everything in it. Requires `confirmKey` matching the project key. |

## Resources

Resources are read-only documents a client can attach to a conversation.

| URI | Content |
| --- | --- |
| `devboard://workspace` | The workspace summary. |
| `devboard://projects/{key}` | A project's columns and tasks. |
| `devboard://tasks/{key}` | One task in full. |

## Prompts

Prompts are ready-made workflows. In most clients they appear as slash commands.

| Prompt | Use it to |
| --- | --- |
| `plan_board` | Choose which backlog tasks to move onto the board next. |
| `daily_standup` | Summarise progress, blockers and what's next. |
| `triage_backlog` | Suggest priorities, estimates and clean-ups for backlog tasks. |
| `work_on_next_task` | Let the assistant claim the next task, do it and hand it over for review. |

## Example conversation

> **Tip** "Look at the backlog for CORE and move the five highest priority tasks to the board."

The assistant will typically call `list_tasks` (column `backlog`) and then `move_task` for each chosen task.
