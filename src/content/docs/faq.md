Quick answers to common questions.

## General

### Why is my board empty?

The board shows only the **active sprint**. Open the Backlog, add tasks to a sprint and click **Start sprint**.

### Where did my task go after I created it?

New tasks go to the backlog unless you chose a sprint. Open the project's **Backlog** page to find it.

### Why can't I start a second sprint?

A project can have one active sprint. Complete the current one first.

### Why can't I add tasks to a project?

It is probably **archived**. Open the project and use **Restore** on the banner.

### Can I change a project key?

No. Task keys are built from it. Create a new project and move work with CSV if you need a different key.

### Is my data private?

Data stays in your own PostgreSQL database. There is no sign-in, so protect access to the app itself.

## App

### I see "Request failed (500)" after updating the code

Restart the dev server. After a database schema change, Prisma needs `npx prisma generate` (or `npx prisma migrate dev`) and a fresh `npm run dev`.

### The install button doesn't appear

Install prompts need a production build served over HTTPS or localhost: run `npm run build && npm start`.

## MCP

### My client says it cannot connect

- Check DevBoard is reachable: open `{{APP_URL}}` in a browser.
- Confirm the URL ends in `/api/mcp`.
- A `401` means `MCP_API_KEY` is set and the header is missing or wrong.
- A `403` means a browser origin was blocked; add it to `MCP_ALLOWED_ORIGINS`.

### Claude Desktop shows invalid JSON or a server error

Run the server directly without the npm banner: use `node_modules/.bin/tsx scripts/mcp-stdio.ts` or `npm run --silent mcp`, and use absolute paths in the config.

### The assistant can't find my project

Ask it to run `list_projects` first. Archived projects are hidden from search; ask it to open the project by key.

### The assistant says a task is read-only

Archived projects reject new tasks and sprints. Restore the project in the app.
