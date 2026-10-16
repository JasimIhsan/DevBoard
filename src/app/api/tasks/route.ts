import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { assertWritable, badRequest, notFound } from "@/lib/api-utils";
import { serializeTask, taskInclude } from "@/lib/serialize";
import { createTask } from "@/lib/tasks";
import { createTaskSchema, statusEnum } from "@/lib/validators";

export const dynamic = "force-dynamic";

/** GET /api/tasks?projectKey=CORE&sprintId=...&status=TODO&q=rate&sort=recent&limit=20 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const where: Prisma.TaskWhereInput = {};

  const projectKey = sp.get("projectKey");
  // Searches and lists across projects ignore archived ones; asking for a specific project still works.
  where.project = projectKey ? { key: projectKey.toUpperCase() } : { archivedAt: null };

  const sprintId = sp.get("sprintId");
  if (sprintId === "none") where.sprintId = null;
  else if (sprintId) where.sprintId = sprintId;

  const status = statusEnum.safeParse(sp.get("status"));
  if (status.success) where.status = status.data;

  const q = sp.get("q")?.trim();
  if (q) {
    const m = /^([A-Za-z][A-Za-z0-9]*)-(\d+)$/.exec(q);
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { labels: { has: q.toLowerCase() } },
      ...(m ? [{ taskNumber: Number(m[2]), project: { key: m[1].toUpperCase() } }] : []),
      ...(/^\d+$/.test(q) ? [{ taskNumber: Number(q) }] : []),
    ];
  }

  const limit = Math.min(Number(sp.get("limit")) || 500, 1000);
  const tasks = await db.task.findMany({
    where,
    include: taskInclude,
    orderBy: sp.get("sort") === "recent" ? [{ updatedAt: "desc" }] : [{ status: "asc" }, { orderIndex: "asc" }],
    take: limit,
  });
  return NextResponse.json(tasks.map(serializeTask));
}

export async function POST(req: NextRequest) {
  const parsed = createTaskSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);

  const project = await db.project.findUnique({ where: { key: parsed.data.projectKey.toUpperCase() }, select: { id: true } });
  if (!project) return notFound("Project not found");
  const blocked = await assertWritable(parsed.data.projectKey);
  if (blocked) return blocked;

  if (parsed.data.sprintId) {
    const sprint = await db.sprint.findFirst({ where: { id: parsed.data.sprintId, projectId: project.id }, select: { id: true } });
    if (!sprint) return badRequest(new Error("sprint"));
  }

  const task = await createTask(parsed.data);
  return NextResponse.json(serializeTask(task), { status: 201 });
}
