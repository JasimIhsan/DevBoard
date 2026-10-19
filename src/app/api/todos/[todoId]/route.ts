import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { badRequest, notFound } from "@/lib/api-utils";
import { serializeTodo } from "@/lib/serialize";
import { updateTodoSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ todoId: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const parsed = updateTodoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const { title, done, dueDate } = parsed.data;
  const id = (await params).todoId;
  const existing = await db.todo.findUnique({ where: { id }, select: { done: true, doneAt: true } });
  if (!existing) return notFound("To-do not found");
  const todo = await db.todo.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
      // Completing stamps the time once; re-sending done:true keeps the original stamp (idempotent).
      ...(done !== undefined && { done, doneAt: done ? (existing.done ? existing.doneAt : new Date()) : null }),
    },
  });
  return NextResponse.json(serializeTodo(todo));
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const res = await db.todo.deleteMany({ where: { id: (await params).todoId } });
  return res.count ? NextResponse.json({ ok: true }) : notFound("To-do not found");
}
