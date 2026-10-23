import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { badRequest, findTask, notFound } from "@/lib/api-utils";
import { serializeTask, serializeTaskDetail, taskDetailInclude, taskInclude } from "@/lib/serialize";
import { nextOrderIndex, statusFor } from "@/lib/tasks";
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
  const log: { kind: "STATUS_CHANGED" | "PRIORITY_CHANGED" | "UPDATED"; detail: string }[] = [];

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

  // Moving between the backlog and board columns. `status` follows the column's category.
  let status = existing.status;
  let columnId = existing.columnId;
  let archivedAt = existing.archivedAt;
  if (input.columnId !== undefined && input.columnId !== existing.columnId) {
    const column = input.columnId ? await db.boardColumn.findFirst({ where: { id: input.columnId, projectId: existing.projectId } }) : null;
    if (input.columnId && !column) return NextResponse.json({ error: "That column doesn't exist in this project." }, { status: 400 });
    columnId = column?.id ?? null;
    status = statusFor(column);
    data.columnId = columnId;
    data.status = status;
    data.completedAt = status === "DONE" ? (existing.status === "DONE" ? existing.completedAt : new Date()) : null;
    if (status !== "DONE" && archivedAt) { archivedAt = null; data.archivedAt = null; } // only done tasks stay archived
    log.push({ kind: "STATUS_CHANGED", detail: `Moved ${existing.column?.name ?? "Backlog"} → ${column?.name ?? "Backlog"}` });
  }

  if (input.archived !== undefined) {
    if (input.archived) {
      if (status !== "DONE") return NextResponse.json({ error: "Only done tasks can be archived. Move it to a Done column first." }, { status: 409 });
      if (!archivedAt) { archivedAt = new Date(); data.archivedAt = archivedAt; log.push({ kind: "UPDATED", detail: "Archived" }); }
    } else if (archivedAt) {
      archivedAt = null;
      data.archivedAt = null;
      log.push({ kind: "UPDATED", detail: "Restored from archive" });
    }
  }

  const task = await db.$transaction(async (tx) => {
    if (columnId !== existing.columnId) data.orderIndex = await nextOrderIndex(tx, { projectId: existing.projectId, columnId });
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
