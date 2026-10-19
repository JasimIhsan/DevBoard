// Runs during `vercel-build`: applies pending Prisma migrations before the app is built, so a deploy never goes
// live against an older schema. Only production builds touch the database (previews share it, so they skip).
import { spawnSync } from "node:child_process";

if (process.env.VERCEL_ENV !== "production") {
  console.log(`[migrate] skipped (VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}, not a production Vercel build)`);
  process.exit(0);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.log("[migrate] skipped: DATABASE_URL is not set");
  process.exit(0);
}

// Neon's pooled host ("-pooler") runs PgBouncer, which breaks the advisory locks migrations use. Use the direct host.
const direct = url.replace("-pooler", "");
console.log("[migrate] applying pending migrations…");
const run = spawnSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit", env: { ...process.env, DATABASE_URL: direct } });
if (run.status !== 0) console.error("[migrate] failed: the build is stopped so the app isn't deployed against an out-of-date schema.");
process.exit(run.status ?? 1);
