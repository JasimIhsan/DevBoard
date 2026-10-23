import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { assertWritable, badRequest, notFound } from "@/lib/api-utils";
import { createTask, ensureDefaultColumns } from "@/lib/tasks";
import { importTasksSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

/**
 * POST /api/tasks/import
 * Bulk-creates tasks. A row's `column` is matched (case-insensitively) against the project's board columns;
 * rows with no column land in the backlog. An unknown column name rejects the whole import, nothing is created.
 */
export async function POST(req: NextRequest) {
  const parsed = importTasksSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const { projectKey, tasks } = parsed.data;

  const project = await db.project.findUnique({ where: { key: projectKey.toUpperCase() }, select: { id: true, key: true } });
  if (!project) return notFound("Project not found");
  const blocked = await assertWritable(project.key);
  if (blocked) return blocked;

  const columns = await ensureDefaultColumns(db, project.id);
  const byName = new Map(columns.map((c) => [c.name.toLowerCase(), c.id]));
  const unknown = [...new Set(tasks.map((t) => t.column?.trim()).filter((n): n is string => !!n && !byName.has(n.toLowerCase())))];
  if (unknown.length) {
    return NextResponse.json({ error: `Unknown column${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}. Columns in ${project.key}: ${columns.map((c) => c.name).join(", ")}.` }, { status: 400 });
  }

  const keys: string[] = [];
  for (const { column, ...t } of tasks) {
    const columnId = column?.trim() ? byName.get(column.trim().toLowerCase()) ?? null : null;
    const task = await createTask({ ...t, projectKey: project.key, columnId });
    keys.push(`${project.key}-${task.taskNumber}`);
  }

  return NextResponse.json({ created: keys.length, keys }, { status: 201 });
}
