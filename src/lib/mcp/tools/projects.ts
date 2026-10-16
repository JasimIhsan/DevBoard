import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ApiFn } from "../api";
import { ApiError } from "../api";
import { guarded, upper } from "../helpers";

const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;
const WRITE_IDEMPOTENT = { ...WRITE, idempotentHint: true } as const;
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false } as const;
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #6366f1.");
const view = (p: any) => ({ key: p.key, name: p.name, description: p.description, color: p.color, starred: p.starred, archived: p.archived });

export function registerProjectTools(server: McpServer, api: ApiFn) {
  server.registerTool(
    "create_project",
    {
      title: "Create project",
      description: "Create a project. The key (2-10 letters/digits, starting with a letter, e.g. CORE) prefixes every task number (CORE-1, CORE-2…) and can never be changed. A first draft sprint is created automatically.",
      inputSchema: { name: z.string().min(1).max(80), key: z.string().regex(/^[A-Za-z][A-Za-z0-9]{1,9}$/, "2-10 letters/digits, starting with a letter."), description: z.string().max(300).optional(), color: color.optional() },
      annotations: WRITE,
    },
    guarded(async (a: { name: string; key: string; description?: string; color?: string }) => ({ created: view(await api("POST", "/api/projects", { ...a, key: upper(a.key) })) })),
  );

  server.registerTool(
    "update_project",
    {
      title: "Update project",
      description: "Rename a project, change its description or color, star it (pins it in the sidebar), or archive/restore it. Archived projects are hidden from boards, dashboard and search and accept no new tasks or sprints, but nothing is deleted. The key cannot change.",
      inputSchema: { projectKey: z.string(), name: z.string().min(1).max(80).optional(), description: z.string().max(300).nullable().optional(), color: color.optional(), starred: z.boolean().optional(), archived: z.boolean().optional() },
      annotations: WRITE_IDEMPOTENT,
    },
    guarded(async ({ projectKey, ...patch }: { projectKey: string; name?: string; description?: string | null; color?: string; starred?: boolean; archived?: boolean }) => {
      if (Object.keys(patch).length === 0) throw new ApiError(400, "Nothing to update: pass at least one field.");
      return { updated: view(await api("PATCH", `/api/projects/${upper(projectKey)}`, patch)) };
    }),
  );

  server.registerTool(
    "delete_project",
    {
      title: "Delete project (permanent)",
      description: "Permanently delete a project together with ALL its sprints and tasks. Cannot be undone. Prefer update_project with archived:true unless the user explicitly wants it gone. confirmKey must equal the project key.",
      inputSchema: { projectKey: z.string(), confirmKey: z.string().describe("Repeat the project key to confirm.") },
      annotations: DESTRUCTIVE,
    },
    guarded(async ({ projectKey, confirmKey }: { projectKey: string; confirmKey: string }) => {
      if (upper(projectKey) !== upper(confirmKey)) throw new ApiError(400, `confirmKey must equal the project key "${upper(projectKey)}".`);
      await api("DELETE", `/api/projects/${upper(projectKey)}`);
      return { deleted: upper(projectKey) };
    }),
  );
}
