import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { badRequest, notFound } from "@/lib/api-utils";
import { calculateOrderIndex, needsRebalance, rebalancedIndexes } from "@/lib/ordering";
import { serializeTask, taskInclude } from "@/lib/serialize";
import { reorderSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/tasks/:id/reorder  { newStatus, prevTaskId, nextTaskId }
 * Positions the task between its new neighbours and updates exactly one row
 * (plus a one-off column re-space if float precision is exhausted).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const parsed = reorderSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const { newStatus, prevTaskId, nextTaskId } = parsed.data;

  const task = await db.task.findUnique({ where: { id: taskId }, select: { id: true, projectId: true, sprintId: true, status: true } });
  if (!task) return notFound("Task not found");

  const neighbourIds = [prevTaskId, nextTaskId].filter((x): x is string => !!x);
  const neighbours = neighbourIds.length
    ? await db.task.findMany({
        where: { id: { in: neighbourIds }, projectId: task.projectId },
        select: { id: true, orderIndex: true },
      })
    : [];
  const prev = neighbours.find((n) => n.id === prevTaskId);
  const next = neighbours.find((n) => n.id === nextTaskId);
  if ((prevTaskId && !prev) || (nextTaskId && !next)) return notFound("Neighbour task not found");

  let prevIdx = prev?.orderIndex ?? null;
  let nextIdx = next?.orderIndex ?? null;

  if (needsRebalance(prevIdx, nextIdx)) {
    const lane = await db.task.findMany({
      where: { projectId: task.projectId, sprintId: task.sprintId, status: newStatus, id: { not: task.id } },
      orderBy: { orderIndex: "asc" },
      select: { id: true },
    });
    const fresh = rebalancedIndexes(lane.length);
    await db.$transaction(lane.map((t, i) => db.task.update({ where: { id: t.id }, data: { orderIndex: fresh[i] } })));
    const idxOf = (id?: string | null) => {
      const i = lane.findIndex((t) => t.id === id);
      return i === -1 ? null : fresh[i];
    };
    prevIdx = idxOf(prevTaskId);
    nextIdx = idxOf(nextTaskId);
  }

  const statusChanged = newStatus !== task.status;
  const updated = await db.task.update({
    where: { id: task.id },
    data: {
      status: newStatus,
      orderIndex: calculateOrderIndex(prevIdx, nextIdx),
      ...(statusChanged
        ? {
            completedAt: newStatus === "DONE" ? new Date() : null,
            activities: { create: { kind: "STATUS_CHANGED", detail: `Status ${task.status} → ${newStatus}` } },
          }
        : {}),
    },
    include: taskInclude,
  });
  return NextResponse.json(serializeTask(updated));
}
