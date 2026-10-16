import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { badRequest } from "@/lib/api-utils";
import { serializeProject } from "@/lib/serialize";
import { getProjects } from "@/lib/data";
import { createProjectSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getProjects());
}

export async function POST(req: NextRequest) {
  const parsed = createProjectSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const exists = await db.project.findUnique({ where: { key: parsed.data.key } });
  if (exists) return NextResponse.json({ error: `Key ${parsed.data.key} is already taken` }, { status: 409 });
  const project = await db.project.create({
    data: {
      ...parsed.data,
      // A fresh project gets a draft sprint so tasks can be planned straight away.
      sprints: { create: { name: "Sprint 1", status: "DRAFT" } },
    },
  });
  return NextResponse.json(serializeProject(project), { status: 201 });
}
