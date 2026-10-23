import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { badRequest } from "@/lib/api-utils";
import { DEFAULT_COLUMNS } from "@/lib/constants";
import { ORDER_STEP } from "@/lib/ordering";
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
      // Every project starts with To Do, In Progress and Done; more columns can be added from the board.
      columns: { create: DEFAULT_COLUMNS.map((c, i) => ({ name: c.name, category: c.category, orderIndex: (i + 1) * ORDER_STEP })) },
    },
  });
  return NextResponse.json(serializeProject(project), { status: 201 });
}
