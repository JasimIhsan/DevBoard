The web app talks to a JSON REST API under `/api`. MCP tools use the same endpoints, so you can also call them from scripts.

> **Warning** The REST API has no authentication. See [MCP security](/docs/mcp-security).

All bodies are JSON. Errors look like `{ "error": "message" }` with a status of `400` (invalid input), `404` (not found) or `409` (conflict, such as writing to an archived project).

## Projects

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/projects` | List projects. |
| `POST` | `/api/projects` | Create a project (`name`, `key`, optional `description`, `color`). |
| `GET` | `/api/projects/:key` | Project with its columns and tasks (archived tasks included, marked with `archivedAt`). |
| `PATCH` | `/api/projects/:key` | Edit; set `archived` or `starred`. |
| `DELETE` | `/api/projects/:key` | Delete the project and its data. |
| `GET`, `POST` | `/api/projects/:key/columns` | List or add board columns (`name`, `category`: `TODO`, `IN_PROGRESS`, `DONE`). |
| `PATCH`, `DELETE` | `/api/projects/:key/columns/:columnId` | Rename, change category, move (`direction`), or delete (`?moveTo=<columnId>`). |
| `POST` | `/api/projects/:key/columns/:columnId/archive` | Archive every task in a Done column. |

## Tasks

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/tasks` | List and search (`projectKey`, `q`, `status`, `columnId` or `none` for the backlog, `archived=include|only`, `limit`). Archived tasks are left out by default. |
| `POST` | `/api/tasks` | Create a task. Goes to the backlog unless `columnId` is given. |
| `GET` | `/api/tasks/:id` | Task with subtasks, comments and activity. `:id` may be a key like `CORE-12`. |
| `PATCH` | `/api/tasks/:id` | Update fields. `columnId` moves it (null = backlog); `archived: true/false` archives or restores a done task. |
| `DELETE` | `/api/tasks/:id` | Delete. |
| `PATCH` | `/api/tasks/:id/reorder` | Drop into a column between neighbours: `{ columnId, prevTaskId, nextTaskId }`. |
| `POST`, `PATCH`, `DELETE` | `/api/tasks/:id/subtasks` | Manage subtasks. |
| `POST`, `DELETE` | `/api/tasks/:id/comments` | Manage comments. |
| `POST` | `/api/tasks/import` | Bulk import: `{ projectKey, tasks: [...] }`. Each task may have a `column` name. |

## Example

```bash
curl -s "{{APP_URL}}/api/tasks?projectKey=CORE&status=IN_PROGRESS"
```

```bash
curl -s -X POST {{APP_URL}}/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"projectKey":"CORE","title":"Write release notes","priority":"P2"}'
```

## MCP endpoint

`POST /api/mcp` speaks the MCP JSON-RPC protocol. Use an MCP client rather than calling it by hand. See [Connect a client](/docs/mcp-setup).
