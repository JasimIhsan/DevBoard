import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { badRequest } from "@/lib/api-utils";
import { serializeTodo } from "@/lib/serialize";
import { createTodoSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";
const RANK = { LOW: 0, MEDIUM: 1, HIGH: 2 } as const;

/** Open to-dos first (highest priority, then newest), then finished ones (most recently completed first). */
export async function GET() {
  const todos = await db.todo.findMany();
  todos.sort((a, b) =>
    a.done !== b.done ? Number(a.done) - Number(b.done) : a.done ? (b.doneAt?.getTime() ?? 0) - (a.doneAt?.getTime() ?? 0) : RANK[b.priority] - RANK[a.priority] || b.createdAt.getTime() - a.createdAt.getTime(),
  );
  return NextResponse.json(todos.map(serializeTodo));
}

export async function POST(req: NextRequest) {
  const parsed = createTodoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const { title, dueDate, priority } = parsed.data;
  const todo = await db.todo.create({ data: { title, dueDate: dueDate ? new Date(dueDate) : null, ...(priority && { priority }) } });
  return NextResponse.json(serializeTodo(todo), { status: 201 });
}

/** `DELETE /api/todos?completed=1` clears every finished to-do. */
export async function DELETE(req: NextRequest) {
  if (req.nextUrl.searchParams.get("completed") !== "1") return NextResponse.json({ error: "Pass ?completed=1 to clear finished to-dos" }, { status: 400 });
  const res = await db.todo.deleteMany({ where: { done: true } });
  return NextResponse.json({ deleted: res.count });
}
