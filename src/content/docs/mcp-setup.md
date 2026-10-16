Make sure DevBoard is running first (`npm run dev` or `npm start`). The examples assume it is at `http://localhost:3000`; change the address if yours differs.

You also need the **API key**: open **MCP access** at the bottom of the sidebar and click **Generate key** (see [MCP security](/docs/mcp-security)). Replace `YOUR_KEY` below with it. The HTTP endpoint refuses requests without it.

> **Note** Client configuration formats change over time. If an option below is rejected, check your client's MCP documentation for the current syntax and reuse the same URL and header.

## Claude Code

```bash
claude mcp add --transport http devboard http://localhost:3000/api/mcp \
  --header "Authorization: Bearer YOUR_KEY"
```

(The **MCP access** dialog shows this command with your key filled in.)

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

Run `/mcp` in Gemini CLI to list the tools.

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
      "url": "http://localhost:3000/api/mcp",
      "headers": { "Authorization": "Bearer YOUR_KEY" }
    }
  }
}
```

## Any other client

Any client that supports MCP over **Streamable HTTP** needs the URL `http://localhost:3000/api/mcp` and the `Authorization: Bearer YOUR_KEY` header. For stdio-only clients, run the command `npm run --silent mcp` from the project folder (or the direct `tsx` command shown above) and set `DEVBOARD_URL`; the stdio bridge talks to the REST API directly and needs no key.

## Test the connection

The MCP Inspector lets you try tools by hand:

```bash
npx @modelcontextprotocol/inspector
```

Choose **Streamable HTTP**, enter the URL, add an `Authorization` header with `Bearer YOUR_KEY` and click **Connect**.

## Settings

| Variable | Used by | Purpose |
| --- | --- | --- |
| `DEVBOARD_URL` | stdio | Where the app is running. Default `http://localhost:3000`. |
| `MCP_API_KEY` | HTTP | Required. Generated from **MCP access** in the sidebar, or set by hand. |
| `MCP_ALLOWED_ORIGINS` | HTTP | Comma-separated browser origins allowed to call the endpoint. |
| `DEVBOARD_INTERNAL_URL` | HTTP | Address the server uses to reach itself, if the default (the request's own address) doesn't work behind a proxy. |
