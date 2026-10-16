import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { getDatabaseUrl } from "@/lib/db";
import { getDbStatus, isSameOrigin } from "@/lib/setup";

export const dynamic = "force-dynamic";

/**
 * Apply the bundled Prisma migrations (`prisma migrate deploy`) to the configured database.
 * Only runs while the schema is missing, so it can't be used to touch a working database.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Cross-origin request refused." }, { status: 403 });
  const status = await getDbStatus();
  if (status.state !== "unmigrated") return NextResponse.json({ error: `Nothing to do: database is ${status.state}.` }, { status: 409 });

  // A plain path, not require.resolve: the bundler would rewrite that into an externals stub.
  const cli = join(process.cwd(), "node_modules", "prisma", "build", "index.js");
  if (!existsSync(cli)) return NextResponse.json({ error: "The prisma CLI isn't installed. Run `npx prisma migrate deploy` from the project folder." }, { status: 501 });

  const result = await new Promise<{ code: number | null; output: string }>((resolve) => {
    execFile(
      process.execPath,
      [cli, "migrate", "deploy"],
      { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: getDatabaseUrl(), NO_COLOR: "1", FORCE_COLOR: "0" }, timeout: 120_000, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => resolve({ code: err ? ((err as { code?: number | null }).code ?? 1) : 0, output: `${stdout}\n${stderr}`.replace(/\x1b\[[0-9;]*m/g, "").trim() }),
    );
  });

  const output = result.output.slice(-4000);
  if (result.code !== 0) return NextResponse.json({ error: "Migration failed.", output }, { status: 500 });
  return NextResponse.json({ ok: true, output });
}
