import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { badRequest, findTask, notFound } from "@/lib/api-utils";
import { commentSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ taskId: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const parsed = commentSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const task = await findTask((await params).taskId);
  if (!task) return notFound("Task not found");
  const c = await db.comment.create({ data: { taskId: task.id, body: parsed.data.body } });
  return NextResponse.json({ id: c.id, body: c.body, createdAt: c.createdAt.toISOString() }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const id = req.nextUrl.searchParams.get("id");
  const task = await findTask((await params).taskId);
  if (!task || !id) return notFound();
  await db.comment.deleteMany({ where: { id, taskId: task.id } });
  return NextResponse.json({ ok: true });
}
