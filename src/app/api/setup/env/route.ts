import { NextResponse } from "next/server";
import { z } from "zod";
import { envFileWritable, upsertEnv } from "@/lib/env-file";
import { isPostgresUrl, isSameOrigin, testDatabaseUrl } from "@/lib/setup";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ DATABASE_URL: z.string().trim().min(1, "Enter a connection string.") });

/**
 * Save DATABASE_URL to `.env` after checking that it connects. Only DevBoard's own pages may call this,
 * and only while the app has no working database: once it does, the URL is managed outside the UI.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Cross-origin request refused." }, { status: 403 });
  if (!envFileWritable()) return NextResponse.json({ error: "This deployment can't write .env. Set DATABASE_URL in your hosting provider's environment settings instead." }, { status: 501 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const url = parsed.data.DATABASE_URL;
  if (!isPostgresUrl(url)) return NextResponse.json({ error: "Expected a PostgreSQL URL such as postgresql://user:password@localhost:5432/devboard" }, { status: 400 });

  const test = await testDatabaseUrl(url);
  if (!test.ok) return NextResponse.json({ error: `Couldn't connect: ${test.message}` }, { status: 400 });

  try {
    upsertEnv({ DATABASE_URL: url });
  } catch (e) {
    return NextResponse.json({ error: `Connected, but couldn't write .env: ${(e as Error).message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true, migrated: test.migrated });
}
