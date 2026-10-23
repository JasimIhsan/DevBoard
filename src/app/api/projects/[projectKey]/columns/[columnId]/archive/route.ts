import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { notFound } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

/** POST: archives every task in a Done column (hidden from the board, still Done, listed under the backlog). */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ projectKey: string; columnId: string }> }) {
  const { projectKey, columnId } = await params;
  const column = await db.boardColumn.findFirst({ where: { id: columnId, project: { key: projectKey.toUpperCase() } } });
  if (!column) return notFound("Column not found");
  if (column.category !== "DONE") return NextResponse.json({ error: "Only done columns can be archived." }, { status: 409 });

  const tasks = await db.task.findMany({ where: { columnId, archivedAt: null }, select: { id: true } });
  if (tasks.length === 0) return NextResponse.json({ archived: 0 });
  await db.$transaction([
    db.task.updateMany({ where: { id: { in: tasks.map((t) => t.id) } }, data: { archivedAt: new Date() } }),
    db.activity.createMany({ data: tasks.map((t) => ({ taskId: t.id, kind: "UPDATED" as const, detail: "Archived" })) }),
  ]);
  return NextResponse.json({ archived: tasks.length });
}
