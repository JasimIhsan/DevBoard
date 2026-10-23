Every snippet below already uses this server's address, `{{APP_URL}}`, so you can copy and paste it as it is. Each code block has a **copy** button.

> **Tip** The fastest route is **Connect AI (MCP)** in the sidebar. It shows the same snippets, lets you paste an API key into them, and has a **Test connection** button.

After adding the server, **start a new session** in your client, because tools load when a session starts. Then ask: **"List my DevBoard projects."**

## Claude Code

```bash
claude mcp add --transport http devboard {{APP_URL}}/api/mcp
```

Available in every project on your machine (add `--scope user`):

```bash
claude mcp add --scope user --transport http devboard {{APP_URL}}/api/mcp
```

If the server uses an API key (see [MCP security](/docs/mcp-security)):

```bash
claude mcp add --transport http devboard {{APP_URL}}/api/mcp \
  --header "Authorization: Bearer YOUR_KEY"
```

Check it with `claude mcp list`. You should see `devboard … ✔ Connected`. Remove it any time with `claude mcp remove devboard`.

## Claude Desktop

Open **Settings → Developer → Edit Config** and add this. It needs [Node.js](https://nodejs.org). Restart Claude Desktop afterwards.

```json
{
  "mcpServers": {
    "devboard": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "{{APP_URL}}/api/mcp"]
    }
  }
}
```

With an API key:

```json
{
  "mcpServers": {
    "devboard": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "{{APP_URL}}/api/mcp", "--header", "Authorization:${AUTH}"],
      "env": { "AUTH": "Bearer YOUR_KEY" }
    }
  }
}
```

## Gemini CLI

Add this to `~/.gemini/settings.json` (merge it into the existing `mcpServers` if you have one):

```json
{
  "mcpServers": {
    "devboard": {
      "httpUrl": "{{APP_URL}}/api/mcp"
    }
  }
}
```

With an API key, add `"headers": { "Authorization": "Bearer YOUR_KEY" }` next to `httpUrl`. Run `/mcp` inside Gemini CLI to see the tools.

## Cursor

Create `.cursor/mcp.json` in a project, or `~/.cursor/mcp.json` for all projects:

```json
{
  "mcpServers": {
    "devboard": {
      "url": "{{APP_URL}}/api/mcp"
    }
  }
}
```

## VS Code

Create `.vscode/mcp.json`:

```json
{
  "servers": {
    "devboard": {
      "type": "http",
      "url": "{{APP_URL}}/api/mcp"
    }
  }
}
```

## Windsurf, Cline, Zed and other clients

Most clients accept the same three facts. Look for "add MCP server" or an `mcp.json` file in the client's settings and enter:

| Field | Value |
| --- | --- |
| Transport / type | `http` (also called *Streamable HTTP*) |
| URL | `{{APP_URL}}/api/mcp` |
| Header | `Authorization: Bearer YOUR_KEY` (only if the server has an API key) |

> **Note** Client configuration formats change over time. If an option is rejected, check the client's MCP documentation for the current syntax and reuse the same URL and header.

## Test the connection

Ask your assistant **"List my DevBoard projects"**, or use **Test connection** in the sidebar's **Connect AI (MCP)** dialog.

From a terminal, this lists the tools:

```bash
curl -s {{APP_URL}}/api/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

A `401` means the server has an API key and yours is missing or wrong. To try tools by hand, use the MCP Inspector: `npx @modelcontextprotocol/inspector`, choose **Streamable HTTP**, and paste the URL.

## Running DevBoard from source (stdio)

If you run DevBoard yourself from its source code, clients that only launch local programs can use the stdio server. Point it at your DevBoard address with `DEVBOARD_URL`:

```json
{
  "mcpServers": {
    "devboard": {
      "command": "/absolute/path/to/DevBoard/node_modules/.bin/tsx",
      "args": ["/absolute/path/to/DevBoard/scripts/mcp-stdio.ts"],
      "env": { "DEVBOARD_URL": "{{APP_URL}}" }
    }
  }
}
```

> **Warning** Don't use `npm run mcp` in a client config. npm prints a banner that breaks the protocol. Use the `tsx` command above, or `npm run --silent mcp`.

## Settings

| Variable | Used by | Purpose |
| --- | --- | --- |
| `DEVBOARD_URL` | stdio | Where the app is running. Default `http://localhost:3000`. |
| `MCP_API_KEY` | HTTP | Require this key on every request. |
| `MCP_ALLOWED_ORIGINS` | HTTP | Comma-separated browser origins allowed to call the endpoint. |
| `DEVBOARD_INTERNAL_URL` | HTTP | Address the server uses to reach itself, if the default (the request's own address) doesn't work behind a proxy. |
| `NEXT_PUBLIC_APP_URL` | Docs and snippets | Optional. The public address shown when it can't be read from the browser. |
