The web app talks to a JSON REST API under `/api`. MCP tools use the same endpoints, so you can also call them from scripts.

> **Warning** The REST API has no authentication. See [MCP security](/docs/mcp-security).

All bodies are JSON. Errors look like `{ "error": "message" }` with a status of `400` (invalid input), `404` (not found) or `409` (conflict, such as writing to an archived project).

## Projects

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/projects` | List projects. |
| `POST` | `/api/projects` | Create a project (`name`, `key`, optional `description`, `color`). |
| `GET` | `/api/projects/:key` | Project with its sprints and tasks. |
| `PATCH` | `/api/projects/:key` | Edit; set `archived` or `starred`. |
| `DELETE` | `/api/projects/:key` | Delete the project and its data. |
| `POST`, `PATCH`, `DELETE` | `/api/projects/:key/sprints` | Create, start, complete, update or delete sprints. |

## Tasks

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/tasks` | List and search (`projectKey`, `q`, `status`, `sprintId`, `limit`). |
| `POST` | `/api/tasks` | Create a task. |
| `GET` | `/api/tasks/:id` | Task with subtasks, comments and activity. `:id` may be a key like `CORE-12`. |
| `PATCH` | `/api/tasks/:id` | Update fields. |
| `DELETE` | `/api/tasks/:id` | Delete. |
| `PATCH` | `/api/tasks/:id/reorder` | Move and reorder: `{ newStatus, prevTaskId, nextTaskId }`. |
| `POST`, `PATCH`, `DELETE` | `/api/tasks/:id/subtasks` | Manage subtasks. |
| `POST`, `DELETE` | `/api/tasks/:id/comments` | Manage comments. |
| `POST` | `/api/tasks/import` | Bulk import: `{ projectKey, tasks: [...] }`. |

## Example

```bash
curl -s {{APP_URL}}/api/tasks?projectKey=CORE&status=IN_PROGRESS
```

```bash
curl -s -X POST {{APP_URL}}/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"projectKey":"CORE","title":"Write release notes","priority":"P2"}'
```

## MCP endpoint

`POST /api/mcp` speaks the MCP JSON-RPC protocol. Use an MCP client rather than calling it by hand. See [Connect a client](/docs/mcp-setup).
