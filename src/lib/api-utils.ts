import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { db } from "./db";
import { taskInclude } from "./serialize";

export function badRequest(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ") }, { status: 400 });
  }
  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}

export const notFound = (what = "Not found") => NextResponse.json({ error: what }, { status: 404 });

/**
 * Archived projects stay readable but take no new tasks, sprints or imports.
 * Returns a 409 response to send back, or null when the project is writable (or doesn't exist: callers 404 themselves).
 */
export async function assertWritable(projectKey: string) {
  const p = await db.project.findUnique({ where: { key: projectKey.toUpperCase() }, select: { archivedAt: true } });
  return p?.archivedAt ? NextResponse.json({ error: "Project is archived. Restore it to add tasks or sprints." }, { status: 409 }) : null;
}

/** Accepts either a task UUID or a human key like CORE-12. */
export async function findTask(idOrKey: string) {
  const m = /^([A-Za-z][A-Za-z0-9]*)-(\d+)$/.exec(idOrKey);
  if (m) {
    return db.task.findFirst({
      where: { taskNumber: Number(m[2]), project: { key: m[1].toUpperCase() } },
      include: taskInclude,
    });
  }
  return db.task.findUnique({ where: { id: idOrKey }, include: taskInclude });
}

export function slugBranch(key: string, title: string, type: string) {
  const prefix = type === "BUG" ? "fix" : type === "CHORE" ? "chore" : "feat";
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
  return `${prefix}/${key.toLowerCase()}-${slug}`;
}
