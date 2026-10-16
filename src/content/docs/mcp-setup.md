Make sure DevBoard is running first (`npm run dev` or `npm start`). The examples assume it is at `http://localhost:3000`; change the address if yours differs.

> **Note** Client configuration formats change over time. If an option below is rejected, check your client's MCP documentation for the current syntax and reuse the same URL and header.

## Claude Code

```bash
claude mcp add --transport http devboard http://localhost:3000/api/mcp
```

With an API key:

```bash
claude mcp add --transport http devboard http://localhost:3000/api/mcp \
  --header "Authorization: Bearer YOUR_KEY"
```

Run `/mcp` inside Claude Code to confirm `devboard` is connected.

## Claude Desktop

Claude Desktop launches local servers over **stdio**. Open *Settings → Developer → Edit Config* and add:

```json
{
  "mcpServers": {
    "devboard": {
      "command": "/absolute/path/to/Task-Manager/node_modules/.bin/tsx",
      "args": ["/absolute/path/to/Task-Manager/scripts/mcp-stdio.ts"],
      "env": { "DEVBOARD_URL": "http://localhost:3000" }
    }
  }
}
```

Restart Claude Desktop. Use absolute paths, and keep the app running.

> **Warning** Do not use `npm run mcp` in a client config. npm prints a banner to standard output, which breaks the protocol. Use `npm run --silent mcp` or the direct `tsx` command above.

## Gemini CLI

Add DevBoard to `~/.gemini/settings.json`:

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

Omit `headers` if you have not set an API key. Run `/mcp` in Gemini CLI to list the tools.

## Cursor

Create `.cursor/mcp.json` in your project, or `~/.cursor/mcp.json` globally:

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
      "url": "http://localhost:3000/api/mcp"
    }
  }
}
```

## Any other client

Any client that supports MCP over **Streamable HTTP** only needs the URL `http://localhost:3000/api/mcp`, plus an `Authorization: Bearer` header if you set a key. For stdio-only clients, run the command `npm run --silent mcp` from the project folder (or the direct `tsx` command shown above) and set `DEVBOARD_URL`.

## Test the connection

The MCP Inspector lets you try tools by hand:

```bash
npx @modelcontextprotocol/inspector
```

Choose **Streamable HTTP**, enter the URL and click **Connect**.

## Settings

| Variable | Used by | Purpose |
| --- | --- | --- |
| `DEVBOARD_URL` | stdio | Where the app is running. Default `http://localhost:3000`. |
| `MCP_API_KEY` | HTTP | Require this key on every request. |
| `MCP_ALLOWED_ORIGINS` | HTTP | Comma-separated browser origins allowed to call the endpoint. |
| `DEVBOARD_INTERNAL_URL` | HTTP | Address the server uses to reach itself, if the default (the request's own address) doesn't work behind a proxy. |
