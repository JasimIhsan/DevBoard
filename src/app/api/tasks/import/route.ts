import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { assertWritable, badRequest, notFound } from "@/lib/api-utils";
import { createTask } from "@/lib/tasks";
import { importTasksSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

/**
 * POST /api/tasks/import
 * Bulk-creates tasks. Rows with a sprint name are attached to that sprint (matched case-insensitively);
 * unknown sprint names become new DRAFT sprints. Rows without a sprint land in the backlog.
 */
export async function POST(req: NextRequest) {
  const parsed = importTasksSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const { projectKey, tasks } = parsed.data;

  const project = await db.project.findUnique({ where: { key: projectKey.toUpperCase() }, select: { id: true, key: true } });
  if (!project) return notFound("Project not found");
  // Must run before any sprint is created below: an import also creates the sprints it names.
  const blocked = await assertWritable(project.key);
  if (blocked) return blocked;

  const existing = await db.sprint.findMany({ where: { projectId: project.id }, select: { id: true, name: true } });
  const sprintIds = new Map(existing.map((s) => [s.name.toLowerCase(), s.id]));
  const sprintsCreated: string[] = [];

  for (const name of [...new Set(tasks.map((t) => t.sprint?.trim()).filter((n): n is string => !!n))]) {
    if (sprintIds.has(name.toLowerCase())) continue;
    const s = await db.sprint.create({ data: { projectId: project.id, name }, select: { id: true, name: true } });
    sprintIds.set(name.toLowerCase(), s.id);
    sprintsCreated.push(s.name);
  }

  const keys: string[] = [];
  for (const { sprint, ...t } of tasks) {
    const sprintId = sprint?.trim() ? sprintIds.get(sprint.trim().toLowerCase()) ?? null : null;
    const task = await createTask({ ...t, projectKey: project.key, sprintId });
    keys.push(`${project.key}-${task.taskNumber}`);
  }

  return NextResponse.json({ created: keys.length, keys, sprintsCreated }, { status: 201 });
}
