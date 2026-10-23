import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { badRequest, notFound } from "@/lib/api-utils";
import { calculateOrderIndex, needsRebalance, rebalancedIndexes } from "@/lib/ordering";
import { serializeTask, taskInclude } from "@/lib/serialize";
import { statusFor } from "@/lib/tasks";
import { reorderSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/tasks/:id/reorder  { columnId, prevTaskId, nextTaskId }
 * Drops the task into a board column between its new neighbours and updates exactly one row
 * (plus a one-off column re-space if float precision is exhausted).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const parsed = reorderSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const { columnId, prevTaskId, nextTaskId } = parsed.data;

  const task = await db.task.findUnique({ where: { id: taskId }, select: { id: true, projectId: true, status: true, columnId: true, archivedAt: true, column: { select: { name: true } } } });
  if (!task) return notFound("Task not found");
  const column = await db.boardColumn.findFirst({ where: { id: columnId, projectId: task.projectId } });
  if (!column) return NextResponse.json({ error: "That column doesn't exist in this project." }, { status: 400 });

  const neighbourIds = [prevTaskId, nextTaskId].filter((x): x is string => !!x);
  const neighbours = neighbourIds.length
    ? await db.task.findMany({ where: { id: { in: neighbourIds }, projectId: task.projectId }, select: { id: true, orderIndex: true } })
    : [];
  const prev = neighbours.find((n) => n.id === prevTaskId);
  const next = neighbours.find((n) => n.id === nextTaskId);
  if ((prevTaskId && !prev) || (nextTaskId && !next)) return notFound("Neighbour task not found");

  let prevIdx = prev?.orderIndex ?? null;
  let nextIdx = next?.orderIndex ?? null;

  if (needsRebalance(prevIdx, nextIdx)) {
    const lane = await db.task.findMany({ where: { projectId: task.projectId, columnId, id: { not: task.id } }, orderBy: { orderIndex: "asc" }, select: { id: true } });
    const fresh = rebalancedIndexes(lane.length);
    await db.$transaction(lane.map((t, i) => db.task.update({ where: { id: t.id }, data: { orderIndex: fresh[i] } })));
    const idxOf = (id?: string | null) => {
      const i = lane.findIndex((t) => t.id === id);
      return i === -1 ? null : fresh[i];
    };
    prevIdx = idxOf(prevTaskId);
    nextIdx = idxOf(nextTaskId);
  }

  const status = statusFor(column);
  const columnChanged = column.id !== task.columnId;
  const updated = await db.task.update({
    where: { id: task.id },
    data: {
      columnId: column.id,
      status,
      orderIndex: calculateOrderIndex(prevIdx, nextIdx),
      ...(status !== "DONE" ? { archivedAt: null } : {}),
      ...(task.status !== status ? { completedAt: status === "DONE" ? new Date() : null } : {}),
      ...(columnChanged ? { activities: { create: { kind: "STATUS_CHANGED", detail: `Moved ${task.column?.name ?? "Backlog"} → ${column.name}` } } } : {}),
    },
    include: taskInclude,
  });
  return NextResponse.json(serializeTask(updated));
}
