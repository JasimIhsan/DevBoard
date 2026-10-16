The MCP server can read and change all of your data, so decide who should be allowed to reach it.

## Local use (default)

When DevBoard runs on `localhost`, only programs on your own computer can reach the MCP endpoint. For personal use this is usually enough.

## The API key (required)

The MCP endpoint only answers requests that carry the API key. Until a key exists it refuses everything with `503` and a message saying so.

Open **MCP access** at the bottom of the sidebar and click **Generate key**. DevBoard stores it as `MCP_API_KEY` in the project's `.env` file and shows it once; copy it into your client's settings. Every request must then send it as `Authorization: Bearer <key>` (or an `x-api-key` header). Requests with a wrong or missing key receive `401 Unauthorized`.

**Rotate key** replaces it. Clients using the old key stop working until you update them.

You can also set it by hand where DevBoard runs (for example in `.env`) and restart:

```bash
MCP_API_KEY="$(openssl rand -hex 32)"
```

> **Note** Where the app can't write `.env` (read-only hosting such as Vercel, or `DEVBOARD_LOCK_ENV=1`), the dialog only shows instructions: set `MCP_API_KEY` in your hosting provider's environment settings.

## Allowed origins

Requests from web pages are blocked unless they come from DevBoard's own origin. This stops a malicious website from using your browser to call the endpoint. AI clients such as Claude Code and Cursor are not browsers and are not affected.

To allow another web app, list its origin:

```bash
MCP_ALLOWED_ORIGINS="https://my-tool.example.com,http://localhost:5173"
```

## Exposing DevBoard on a network

> **Warning** DevBoard has no sign-in. The app's normal REST API (`/api/*`) is **not** protected by `MCP_API_KEY`, only `/api/mcp` is, and anyone who can open the app can rotate the key from **MCP access**. If you deploy DevBoard beyond your own machine, protect the whole site with a VPN, reverse-proxy authentication or your hosting provider's access controls.

## Destructive actions

Deleting tasks, sprints and projects requires an explicit confirmation argument, and assistants are instructed to delete only when you ask. Treat any connected assistant like a teammate with full access:

- Review what it plans to do before approving tool calls, especially deletes.
- Use **archive** instead of delete when you want to be able to undo.
- Keep regular database backups.

## Checklist

- [ ] DevBoard is only reachable from trusted networks.
- [ ] The key was generated from **MCP access** (or set in the environment) and never committed.
- [ ] The key is stored in your client's secret settings, not shared in chats or commits.
