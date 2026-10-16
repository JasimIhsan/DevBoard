import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { badRequest, findTask, notFound } from "@/lib/api-utils";
import { serializeTask, serializeTaskDetail, taskDetailInclude, taskInclude } from "@/lib/serialize";
import { nextOrderIndex } from "@/lib/tasks";
import { updateTaskSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ taskId: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { taskId } = await params;
  const found = await findTask(taskId);
  if (!found) return notFound("Task not found");
  const task = await db.task.findUniqueOrThrow({ where: { id: found.id }, include: taskDetailInclude });
  return NextResponse.json(serializeTaskDetail(task));
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { taskId } = await params;
  const parsed = updateTaskSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const input = parsed.data;

  const existing = await findTask(taskId);
  if (!existing) return notFound("Task not found");

  const data: Prisma.TaskUncheckedUpdateInput = {};
  const log: { kind: "STATUS_CHANGED" | "PRIORITY_CHANGED" | "SPRINT_CHANGED" | "UPDATED"; detail: string }[] = [];

  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;
  if (input.type !== undefined) data.type = input.type;
  if (input.branchName !== undefined) data.branchName = input.branchName || null;
  if (input.prUrl !== undefined) data.prUrl = input.prUrl || null;
  if (input.labels !== undefined) data.labels = input.labels;
  if (input.estimate !== undefined) data.estimate = input.estimate;
  if (input.dueDate !== undefined) data.dueDate = input.dueDate ? new Date(input.dueDate) : null;
  if (input.title !== undefined && input.title !== existing.title) log.push({ kind: "UPDATED", detail: "Title changed" });

  if (input.priority !== undefined && input.priority !== existing.priority) {
    data.priority = input.priority;
    log.push({ kind: "PRIORITY_CHANGED", detail: `Priority ${existing.priority} → ${input.priority}` });
  }

  let status = existing.status;
  let sprintId = existing.sprintId;

  if (input.sprintId !== undefined && input.sprintId !== existing.sprintId) {
    if (input.sprintId) {
      const sprint = await db.sprint.findFirst({ where: { id: input.sprintId, projectId: existing.projectId } });
      if (!sprint) return badRequest(new Error("sprint"));
      sprintId = sprint.id;
      if (status === "BACKLOG" && sprint.status === "ACTIVE") status = "TODO";
      log.push({ kind: "SPRINT_CHANGED", detail: `Added to ${sprint.name}` });
    } else {
      sprintId = null;
      status = "BACKLOG";
      log.push({ kind: "SPRINT_CHANGED", detail: "Moved to backlog" });
    }
    data.sprintId = sprintId;
  }

  if (input.status !== undefined && input.status !== existing.status) status = input.status;
  if (status !== existing.status) {
    data.status = status;
    data.completedAt = status === "DONE" ? new Date() : null;
    log.push({ kind: "STATUS_CHANGED", detail: `Status ${existing.status} → ${status}` });
  }

  const laneChanged = status !== existing.status || sprintId !== existing.sprintId;

  const task = await db.$transaction(async (tx) => {
    if (laneChanged) data.orderIndex = await nextOrderIndex(tx, { projectId: existing.projectId, sprintId, status });
    return tx.task.update({
      where: { id: existing.id },
      data: { ...data, ...(log.length ? { activities: { create: log } } : {}) },
      include: taskInclude,
    });
  });
  return NextResponse.json(serializeTask(task));
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { taskId } = await params;
  const existing = await findTask(taskId);
  if (!existing) return notFound("Task not found");
  await db.task.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}
