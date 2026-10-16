import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { badRequest, findTask, notFound } from "@/lib/api-utils";
import { ORDER_STEP } from "@/lib/ordering";
import { subtaskPatchSchema, subtaskSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ taskId: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const parsed = subtaskSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const task = await findTask((await params).taskId);
  if (!task) return notFound("Task not found");
  const last = await db.subtask.findFirst({ where: { taskId: task.id }, orderBy: { orderIndex: "desc" } });
  const sub = await db.subtask.create({
    data: { taskId: task.id, title: parsed.data.title, orderIndex: (last?.orderIndex ?? 0) + ORDER_STEP },
  });
  return NextResponse.json({ id: sub.id, title: sub.title, done: sub.done }, { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const parsed = subtaskPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const task = await findTask((await params).taskId);
  if (!task) return notFound("Task not found");
  const { id, ...data } = parsed.data;
  const res = await db.subtask.updateMany({ where: { id, taskId: task.id }, data });
  if (!res.count) return notFound("Subtask not found");
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const id = req.nextUrl.searchParams.get("id");
  const task = await findTask((await params).taskId);
  if (!task || !id) return notFound();
  await db.subtask.deleteMany({ where: { id, taskId: task.id } });
  return NextResponse.json({ ok: true });
}
