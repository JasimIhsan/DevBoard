DevBoard includes a built-in **Model Context Protocol (MCP) server**. MCP is an open standard that lets AI assistants such as Claude, Gemini and Cursor use external tools. Once connected, you can ask an assistant things like:

- "What should I work on next in CORE?"
- "Break this feature into tasks and add them to the next sprint."
- "Summarise this sprint's progress for my standup."
- "Pick up the next task, implement it, and move it to review."

## What the AI can do

| Area | Examples |
| --- | --- |
| **Read** | List projects, search and filter tasks, read a task with its comments, get a workspace summary. |
| **Plan** | Create tasks in bulk, create, start and complete sprints. |
| **Work** | Start a task, add comments and subtasks, submit for review, mark done. |
| **Manage** | Create, rename, star, archive or delete projects. |

The full list is in [Tools, resources & prompts](/docs/mcp-tools).

## How it works

The MCP server is a thin layer over DevBoard's own API, so every rule you see in the app applies to AI too: archived projects are read-only, only one sprint can be active, and invalid input is rejected with a clear message.

There are two ways to connect:

| Transport | Best for | Address |
| --- | --- | --- |
| **HTTP** (Streamable HTTP) | Claude Code, Gemini CLI, Cursor, VS Code and most modern clients. | `{{APP_URL}}/api/mcp` |
| **stdio** | Clients that launch a local process, if you run DevBoard from the source code. | `npm run --silent mcp` |

## Safe by design

- Destructive tools (`delete_task`, `delete_project`, `delete_sprint`) need an explicit confirmation argument.
- An optional **API key** protects the HTTP endpoint. See [MCP security](/docs/mcp-security).
- Tool results use small, structured summaries so assistants don't waste context.

> **Tip** Start with a read-only request such as "list my projects" to confirm the connection works.

## Connect in one minute

The quickest way: open **Connect AI (MCP)** in the sidebar (or press `⌘K` and search "connect"). It shows this server's address and ready-to-copy snippets for Claude Code, Claude Desktop, Gemini CLI, Cursor, VS Code and other clients, with a **Test connection** button.

Prefer reading first? Continue to [Connect a client](/docs/mcp-setup).
