import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { badRequest } from "@/lib/api-utils";
import { recentPutSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

/**
 * Recent items, shared by every device (the app has no accounts, so this is one global list).
 * Reserved row id "__cleared" remembers when the list was last cleared, so a device that was offline
 * can't bring old items back by syncing later.
 */
const CLEARED = "__cleared";
const MAX = 60;
const MAX_FUTURE_MS = 60_000; // clamp timestamps from devices with a wrong clock

async function snapshot() {
  const [rows, cleared] = await Promise.all([
    db.recentItem.findMany({ where: { id: { not: CLEARED } }, orderBy: { visitedAt: "desc" }, take: MAX }),
    db.recentItem.findUnique({ where: { id: CLEARED } }),
  ]);
  return {
    entries: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      projectKey: r.projectKey ?? undefined,
      taskKey: r.taskKey ?? undefined,
      title: r.title ?? undefined,
      taskType: r.taskType ?? undefined,
      ts: r.visitedAt.getTime(),
    })),
    clearedAt: cleared?.visitedAt.getTime() ?? 0,
  };
}

export async function GET() {
  return NextResponse.json(await snapshot());
}

/** Upsert a batch. For an id that already exists the newest visit time wins; the list is then trimmed to the newest 60. */
export async function PUT(req: NextRequest) {
  const parsed = recentPutSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);

  await db.$transaction(async (tx) => {
    const clearedAt = (await tx.recentItem.findUnique({ where: { id: CLEARED } }))?.visitedAt.getTime() ?? 0;
    const now = Date.now();
    for (const e of parsed.data) {
      if (e.ts <= clearedAt) continue;
      // The column is a timezone-less timestamp that Prisma reads as UTC; normalise explicitly so the session timezone can't shift it.
      const visitedAt = new Date(Math.min(e.ts, now + MAX_FUTURE_MS));
      await tx.$executeRaw`
        INSERT INTO "RecentItem" ("id", "kind", "projectKey", "taskKey", "title", "taskType", "visitedAt")
        VALUES (${e.id}, ${e.kind}, ${e.projectKey ?? null}, ${e.taskKey ?? null}, ${e.title ?? null}, ${e.taskType ?? null}::"TaskType", (${visitedAt.toISOString()}::timestamptz AT TIME ZONE 'UTC'))
        ON CONFLICT ("id") DO UPDATE SET
          "kind" = EXCLUDED."kind",
          "projectKey" = EXCLUDED."projectKey",
          "taskKey" = EXCLUDED."taskKey",
          "title" = COALESCE(EXCLUDED."title", "RecentItem"."title"),
          "taskType" = COALESCE(EXCLUDED."taskType", "RecentItem"."taskType"),
          "visitedAt" = GREATEST("RecentItem"."visitedAt", EXCLUDED."visitedAt")`;
    }
    await tx.$executeRaw`
      DELETE FROM "RecentItem"
      WHERE "id" <> ${CLEARED}
        AND "id" NOT IN (SELECT "id" FROM "RecentItem" WHERE "id" <> ${CLEARED} ORDER BY "visitedAt" DESC LIMIT ${MAX})`;
  });
  return NextResponse.json(await snapshot());
}

export async function DELETE() {
  const now = new Date();
  await db.$transaction([
    db.recentItem.deleteMany(),
    db.recentItem.create({ data: { id: CLEARED, kind: "meta", visitedAt: now } }),
  ]);
  return NextResponse.json({ entries: [], clearedAt: now.getTime() });
}
