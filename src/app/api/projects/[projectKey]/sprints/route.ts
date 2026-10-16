import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { assertWritable, badRequest, notFound } from "@/lib/api-utils";
import { serializeSprint } from "@/lib/serialize";
import { nextOrderIndex } from "@/lib/tasks";
import { createSprintSchema, sprintActionSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ projectKey: string }> };

const getProject = async (key: string) => db.project.findUnique({ where: { key: key.toUpperCase() }, select: { id: true } });

export async function GET(_req: NextRequest, { params }: Ctx) {
  const project = await getProject((await params).projectKey);
  if (!project) return notFound("Project not found");
  const sprints = await db.sprint.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "asc" } });
  return NextResponse.json(sprints.map(serializeSprint));
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const parsed = createSprintSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const project = await getProject((await params).projectKey);
  if (!project) return notFound("Project not found");
  const blocked = await assertWritable((await params).projectKey);
  if (blocked) return blocked;
  const sprint = await db.sprint.create({
    data: {
      projectId: project.id,
      name: parsed.data.name,
      goal: parsed.data.goal || null,
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
      endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
    },
  });
  return NextResponse.json(serializeSprint(sprint), { status: 201 });
}

/** Sprint lifecycle: start (DRAFT→ACTIVE), complete (ACTIVE→COMPLETED), update, delete. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const parsed = sprintActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const input = parsed.data;
  const project = await getProject((await params).projectKey);
  if (!project) return notFound("Project not found");
  if (input.action !== "delete") {
    const blocked = await assertWritable((await params).projectKey);
    if (blocked) return blocked;
  }
  const sprint = await db.sprint.findFirst({ where: { id: input.sprintId, projectId: project.id } });
  if (!sprint) return notFound("Sprint not found");
  const conflict = (error: string) => NextResponse.json({ error }, { status: 409 });

  switch (input.action) {
    case "start": {
      if (sprint.status !== "DRAFT") return conflict("Only draft sprints can be started");
      const active = await db.sprint.findFirst({ where: { projectId: project.id, status: "ACTIVE" } });
      if (active) return conflict(`"${active.name}" is already active — complete it first`);
      const start = input.startDate ? new Date(input.startDate) : new Date();
      const end = input.endDate ? new Date(input.endDate) : new Date(start.getTime() + 14 * 86_400_000);
      const [updated] = await db.$transaction([
        db.sprint.update({ where: { id: sprint.id }, data: { status: "ACTIVE", startDate: start, endDate: end } }),
        db.task.updateMany({ where: { sprintId: sprint.id, status: "BACKLOG" }, data: { status: "TODO" } }),
      ]);
      return NextResponse.json(serializeSprint(updated));
    }

    case "complete": {
      if (sprint.status !== "ACTIVE") return conflict("Only the active sprint can be completed");
      const target = input.moveUnfinishedTo ?? null;
      if (target) {
        const t = await db.sprint.findFirst({ where: { id: target, projectId: project.id, status: { not: "COMPLETED" } } });
        if (!t || t.id === sprint.id) return badRequest(new Error("target"));
      }
      const unfinished = await db.task.findMany({
        where: { sprintId: sprint.id, status: { not: "DONE" } },
        orderBy: [{ status: "asc" }, { orderIndex: "asc" }],
        select: { id: true },
      });
      const updated = await db.$transaction(async (tx) => {
        const status = target ? "TODO" : "BACKLOG";
        for (const t of unfinished) {
          const orderIndex = await nextOrderIndex(tx, { projectId: project.id, sprintId: target, status });
          await tx.task.update({
            where: { id: t.id },
            data: {
              sprintId: target,
              status,
              orderIndex,
              activities: { create: { kind: "SPRINT_CHANGED", detail: `Carried over from ${sprint.name}` } },
            },
          });
        }
        return tx.sprint.update({ where: { id: sprint.id }, data: { status: "COMPLETED", completedAt: new Date() } });
      });
      return NextResponse.json({ sprint: serializeSprint(updated), movedTasks: unfinished.length });
    }

    case "update": {
      const updated = await db.sprint.update({
        where: { id: sprint.id },
        data: {
          ...(input.name ? { name: input.name } : {}),
          ...(input.goal !== undefined ? { goal: input.goal || null } : {}),
          ...(input.startDate !== undefined ? { startDate: input.startDate ? new Date(input.startDate) : null } : {}),
          ...(input.endDate !== undefined ? { endDate: input.endDate ? new Date(input.endDate) : null } : {}),
        },
      });
      return NextResponse.json(serializeSprint(updated));
    }

    case "delete": {
      if (sprint.status === "ACTIVE") return conflict("Complete the active sprint instead of deleting it");
      await db.$transaction([
        db.task.updateMany({ where: { sprintId: sprint.id, status: { not: "DONE" } }, data: { status: "BACKLOG" } }),
        db.sprint.delete({ where: { id: sprint.id } }),
      ]);
      return NextResponse.json({ ok: true });
    }
  }
}
