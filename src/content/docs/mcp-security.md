The MCP server can read and change all of your data, so decide who should be allowed to reach it.

## Local use (default)

When DevBoard runs on `localhost`, only programs on your own computer can reach the MCP endpoint. For personal use this is usually enough.

## Require an API key

Set `MCP_API_KEY` in the environment where DevBoard runs (for example in `.env`) and restart the app:

```bash
MCP_API_KEY="a-long-random-secret"
```

Every request must then send the key as `Authorization: Bearer <key>` (or an `x-api-key` header). Requests without it receive `401 Unauthorized`.

Generate a strong key with:

```bash
openssl rand -hex 32
```

## Allowed origins

Requests from web pages are blocked unless they come from DevBoard's own origin. This stops a malicious website from using your browser to call the endpoint. AI clients such as Claude Code and Cursor are not browsers and are not affected.

To allow another web app, list its origin:

```bash
MCP_ALLOWED_ORIGINS="https://my-tool.example.com,http://localhost:5173"
```

## Exposing DevBoard on a network

> **Warning** DevBoard has no sign-in. The app's normal REST API (`/api/*`) is **not** protected by `MCP_API_KEY`, only `/api/mcp` is. If you deploy DevBoard beyond your own machine, protect the whole site with a VPN, reverse-proxy authentication or your hosting provider's access controls.

## Destructive actions

Deleting tasks, sprints and projects requires an explicit confirmation argument, and assistants are instructed to delete only when you ask. Treat any connected assistant like a teammate with full access:

- Review what it plans to do before approving tool calls, especially deletes.
- Use **archive** instead of delete when you want to be able to undo.
- Keep regular database backups.

## Checklist

- [ ] DevBoard is only reachable from trusted networks.
- [ ] `MCP_API_KEY` is set if the app is reachable by anyone else.
- [ ] The key is stored in your client's secret settings, not shared in chats or commits.
