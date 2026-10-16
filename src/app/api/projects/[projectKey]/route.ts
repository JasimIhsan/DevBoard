import { NextResponse, type NextRequest } from "next/server";
import { getProjectBoard } from "@/lib/data";
import { badRequest, notFound } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { serializeProject } from "@/lib/serialize";
import { updateProjectSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ projectKey: string }> };

/** Everything a board/backlog view needs in one round trip. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const data = await getProjectBoard((await params).projectKey);
  return data ? NextResponse.json(data) : notFound("Project not found");
}

/**
 * Edit name, description, color, or archive/star state. The key is permanent: every task key (CORE-12) is built from it.
 * Archiving also clears the star; restoring does not bring it back. Starring an archived project is a conflict.
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const parsed = updateProjectSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const key = (await params).projectKey.toUpperCase();
  const existing = await db.project.findUnique({ where: { key }, select: { id: true, archivedAt: true, starredAt: true } });
  if (!existing) return notFound("Project not found");
  const { name, description, color, archived, starred } = parsed.data;
  if (starred === true && (archived === true || (existing.archivedAt && archived !== false))) {
    return NextResponse.json({ error: "Archived projects can't be starred. Restore it first." }, { status: 409 });
  }
  const now = new Date();
  const project = await db.project.update({
    where: { key },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description: description || null }),
      ...(color !== undefined && { color }),
      ...(archived !== undefined && { archivedAt: archived ? existing.archivedAt ?? now : null }),
      // Keep an existing starredAt when re-starring (idempotent, stable sidebar order).
      ...(archived === true ? { starredAt: null } : starred !== undefined ? { starredAt: starred ? existing.starredAt ?? now : null } : {}),
    },
  });
  return NextResponse.json(serializeProject(project));
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const res = await db.project.deleteMany({ where: { key: (await params).projectKey.toUpperCase() } });
  return res.count ? NextResponse.json({ ok: true }) : notFound("Project not found");
}
