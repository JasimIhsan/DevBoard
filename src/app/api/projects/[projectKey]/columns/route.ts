import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { assertWritable, badRequest, notFound } from "@/lib/api-utils";
import { ORDER_STEP } from "@/lib/ordering";
import { serializeColumn } from "@/lib/serialize";
import { ensureDefaultColumns } from "@/lib/tasks";
import { createColumnSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ projectKey: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const project = await db.project.findUnique({ where: { key: (await params).projectKey.toUpperCase() }, select: { id: true } });
  if (!project) return notFound("Project not found");
  return NextResponse.json((await ensureDefaultColumns(db, project.id)).map(serializeColumn));
}

/** POST { name, category } adds a column at the right end of the board. */
export async function POST(req: NextRequest, { params }: Ctx) {
  const parsed = createColumnSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const key = (await params).projectKey.toUpperCase();
  const project = await db.project.findUnique({ where: { key }, select: { id: true } });
  if (!project) return notFound("Project not found");
  const blocked = await assertWritable(key);
  if (blocked) return blocked;

  const columns = await ensureDefaultColumns(db, project.id);
  if (columns.some((c) => c.name.toLowerCase() === parsed.data.name.toLowerCase())) {
    return NextResponse.json({ error: `A column named "${parsed.data.name}" already exists.` }, { status: 409 });
  }
  if (columns.length >= 12) return NextResponse.json({ error: "A board can have at most 12 columns." }, { status: 409 });
  const last = columns.at(-1)?.orderIndex ?? 0;
  const column = await db.boardColumn.create({ data: { projectId: project.id, name: parsed.data.name, category: parsed.data.category, orderIndex: last + ORDER_STEP } });
  return NextResponse.json(serializeColumn(column), { status: 201 });
}
