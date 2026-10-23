import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { assertWritable, badRequest, notFound } from "@/lib/api-utils";
import { calculateOrderIndex, needsRebalance, ORDER_STEP, rebalancedIndexes } from "@/lib/ordering";
import { serializeColumn } from "@/lib/serialize";
import { updateColumnSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ projectKey: string; columnId: string }> };

async function load(params: Ctx["params"]) {
  const { projectKey, columnId } = await params;
  const column = await db.boardColumn.findFirst({ where: { id: columnId, project: { key: projectKey.toUpperCase() } } });
  return column ? { column, key: projectKey.toUpperCase() } : null;
}

/**
 * PATCH { name?, category?, direction?, beforeColumnId? }: rename, change what the column means, shift it one place
 * left/right, or drop it before another column (null = last).
 * Changing the category re-labels the tasks in it (and stamps/clears their completion time).
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const parsed = updateColumnSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const found = await load(params);
  if (!found) return notFound("Column not found");
  const { column, key } = found;
  const blocked = await assertWritable(key);
  if (blocked) return blocked;
  const { name, category, direction, beforeColumnId } = parsed.data;

  const siblings = await db.boardColumn.findMany({ where: { projectId: column.projectId }, orderBy: { orderIndex: "asc" } });
  if (name && siblings.some((c) => c.id !== column.id && c.name.toLowerCase() === name.toLowerCase())) {
    return NextResponse.json({ error: `A column named "${name}" already exists.` }, { status: 409 });
  }

  // Drag and drop: where the column lands among the others (without itself).
  const others = siblings.filter((c) => c.id !== column.id);
  const dropIndex = beforeColumnId === undefined ? -1 : beforeColumnId === null ? others.length : others.findIndex((c) => c.id === beforeColumnId);
  if (beforeColumnId !== undefined && beforeColumnId !== null && dropIndex === -1) {
    return NextResponse.json({ error: "The column to place this one before doesn't exist." }, { status: 400 });
  }

  const updated = await db.$transaction(async (tx) => {
    if (category && category !== column.category) {
      const now = new Date();
      if (category === "DONE") {
        await tx.task.updateMany({ where: { columnId: column.id, completedAt: null }, data: { completedAt: now } });
        await tx.task.updateMany({ where: { columnId: column.id }, data: { status: "DONE" } });
      } else {
        // Leaving DONE: the tasks are no longer finished, so they can't stay archived either.
        await tx.task.updateMany({ where: { columnId: column.id }, data: { status: category, completedAt: null, archivedAt: null } });
      }
    }
    if (direction) {
      const i = siblings.findIndex((c) => c.id === column.id);
      const other = siblings[direction === "left" ? i - 1 : i + 1];
      if (other) {
        await tx.boardColumn.update({ where: { id: other.id }, data: { orderIndex: column.orderIndex } });
        await tx.boardColumn.update({ where: { id: column.id }, data: { orderIndex: other.orderIndex } });
      }
    }
    if (dropIndex !== -1) {
      const prev = others[dropIndex - 1]?.orderIndex ?? null;
      const next = others[dropIndex]?.orderIndex ?? null;
      if (needsRebalance(prev, next)) {
        // Float precision exhausted: re-space the whole board once.
        const order = [...others.slice(0, dropIndex), column, ...others.slice(dropIndex)];
        const fresh = rebalancedIndexes(order.length);
        for (const [i, c] of order.entries()) await tx.boardColumn.update({ where: { id: c.id }, data: { orderIndex: fresh[i] } });
      } else {
        await tx.boardColumn.update({ where: { id: column.id }, data: { orderIndex: calculateOrderIndex(prev, next) } });
      }
    }
    return tx.boardColumn.update({ where: { id: column.id }, data: { ...(name ? { name } : {}), ...(category ? { category } : {}) } });
  });
  return NextResponse.json(serializeColumn(updated));
}

/**
 * DELETE ?moveTo=<columnId>: removes a column. Its tasks (archived ones too) move to `moveTo`, which is required
 * when the column isn't empty. The last column of a board can't be deleted.
 */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const found = await load(params);
  if (!found) return notFound("Column not found");
  const { column, key } = found;
  const blocked = await assertWritable(key);
  if (blocked) return blocked;

  const siblings = await db.boardColumn.findMany({ where: { projectId: column.projectId, id: { not: column.id } }, orderBy: { orderIndex: "asc" } });
  if (siblings.length === 0) return NextResponse.json({ error: "A board needs at least one column." }, { status: 409 });

  const tasks = await db.task.findMany({ where: { columnId: column.id }, orderBy: { orderIndex: "asc" }, select: { id: true, status: true, completedAt: true } });
  const moveTo = req.nextUrl.searchParams.get("moveTo");
  const target = moveTo ? siblings.find((c) => c.id === moveTo) : null;
  if (moveTo && !target) return NextResponse.json({ error: "The column to move tasks into doesn't exist." }, { status: 400 });
  if (tasks.length > 0 && !target) {
    return NextResponse.json({ error: `This column has ${tasks.length} task${tasks.length === 1 ? "" : "s"}. Choose a column to move them to.` }, { status: 409 });
  }

  await db.$transaction(async (tx) => {
    if (target && tasks.length) {
      const last = await tx.task.findFirst({ where: { columnId: target.id }, orderBy: { orderIndex: "desc" }, select: { orderIndex: true } });
      const base = last?.orderIndex ?? 0;
      for (const [i, t] of tasks.entries()) {
        await tx.task.update({
          where: { id: t.id },
          data: {
            columnId: target.id,
            status: target.category,
            orderIndex: base + (i + 1) * ORDER_STEP,
            completedAt: target.category === "DONE" ? t.completedAt ?? new Date() : null,
            ...(target.category !== "DONE" ? { archivedAt: null } : {}),
            activities: { create: { kind: "STATUS_CHANGED", detail: `Moved ${column.name} → ${target.name} (column deleted)` } },
          },
        });
      }
    }
    await tx.boardColumn.delete({ where: { id: column.id } });
  });
  return NextResponse.json({ ok: true, moved: tasks.length });
}
