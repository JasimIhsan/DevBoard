Pick your client, copy the block, and replace the two values below. Every code block has a **copy** button.

## Your two values

| Placeholder | Replace with |
| --- | --- |
| `DEVBOARD_URL` | Where DevBoard runs. Local: `http://localhost:3000`. Hosted: your site, for example `https://your-app.vercel.app`. |
| `YOUR_KEY` | Your `MCP_API_KEY`. Only needed if you set one. See [MCP security](/docs/mcp-security). |

The MCP endpoint is always the URL **plus `/api/mcp`**, for example `http://localhost:3000/api/mcp`.

> **Tip** Make sure DevBoard is running before you connect (`npm run dev` locally). Run the commands below in a terminal, then **start a new session** in your client, because tools load when a session starts.

## Claude Code

Without an API key:

```bash
claude mcp add --transport http devboard http://localhost:3000/api/mcp
```

With an API key:

```bash
claude mcp add --transport http devboard http://localhost:3000/api/mcp \
  --header "Authorization: Bearer YOUR_KEY"
```

Available in every project on your machine (add `--scope user`):

```bash
claude mcp add --scope user --transport http devboard http://localhost:3000/api/mcp
```

Check it:

```bash
claude mcp list
```

You should see `devboard … ✔ Connected`. Remove it any time with `claude mcp remove devboard`.

## Claude Desktop

Claude Desktop starts MCP servers as local programs. Open **Settings → Developer → Edit Config** and add the block that matches your setup, then restart the app.

**DevBoard runs on your computer** (use absolute paths):

```json
{
  "mcpServers": {
    "devboard": {
      "command": "/absolute/path/to/DevBoard/node_modules/.bin/tsx",
      "args": ["/absolute/path/to/DevBoard/scripts/mcp-stdio.ts"],
      "env": { "DEVBOARD_URL": "http://localhost:3000" }
    }
  }
}
```

**DevBoard is hosted online** (needs Node.js; `mcp-remote` bridges to the HTTP endpoint):

```json
{
  "mcpServers": {
    "devboard": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://your-app.vercel.app/api/mcp", "--header", "Authorization:${AUTH}"],
      "env": { "AUTH": "Bearer YOUR_KEY" }
    }
  }
}
```

Leave out `"--header", "Authorization:${AUTH}"` and the `env` block if you have no API key.

> **Warning** Don't use `npm run mcp` in this config. npm prints a banner that breaks the protocol. Use the `tsx` command above, or `npm run --silent mcp`.

## Gemini CLI

Add this to `~/.gemini/settings.json` (merge it into the existing `mcpServers` if you have one):

```json
{
  "mcpServers": {
    "devboard": {
      "httpUrl": "http://localhost:3000/api/mcp",
      "headers": { "Authorization": "Bearer YOUR_KEY" }
    }
  }
}
```

Remove the `headers` line if you have no API key. Run `/mcp` inside Gemini CLI to see the tools.

## Cursor

Create `.cursor/mcp.json` in a project, or `~/.cursor/mcp.json` for all projects:

```json
{
  "mcpServers": {
    "devboard": {
      "url": "http://localhost:3000/api/mcp",
      "headers": { "Authorization": "Bearer YOUR_KEY" }
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
      "url": "http://localhost:3000/api/mcp",
      "headers": { "Authorization": "Bearer YOUR_KEY" }
    }
  }
}
```

## Windsurf, Cline, Zed and other clients

Most clients accept the same three facts. Look for "add MCP server" or an `mcp.json` file in the client's settings and enter:

| Field | Value |
| --- | --- |
| Transport / type | `http` (also called *Streamable HTTP*) |
| URL | `http://localhost:3000/api/mcp` |
| Header | `Authorization: Bearer YOUR_KEY` (only with an API key) |

If a client only supports local programs, use the stdio block from the Claude Desktop section.

> **Note** Client configuration formats change over time. If an option is rejected, check the client's MCP documentation for the current syntax and reuse the same URL and header.

## Test the connection

Ask your assistant: **"List my DevBoard projects."** It should call `list_projects` and show your project keys.

To try tools by hand, use the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector
```

Choose **Streamable HTTP**, paste the URL and click **Connect**.

Or check from the terminal that the endpoint answers (this lists the tools):

```bash
curl -s http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

A `401` means the key is missing or wrong. Add `-H "Authorization: Bearer YOUR_KEY"`.

## Settings

| Variable | Used by | Purpose |
| --- | --- | --- |
| `DEVBOARD_URL` | stdio | Where the app is running. Default `http://localhost:3000`. |
| `MCP_API_KEY` | HTTP | Require this key on every request. |
| `MCP_ALLOWED_ORIGINS` | HTTP | Comma-separated browser origins allowed to call the endpoint. |
| `DEVBOARD_INTERNAL_URL` | HTTP | Address the server uses to reach itself, if the default (the request's own address) doesn't work behind a proxy. |
