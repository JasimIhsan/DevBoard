/** First-run setup (server-only): is the database configured, reachable and migrated? */
import { PrismaClient } from "@prisma/client";
import { db, getDatabaseUrl, prismaLog } from "./db";
import { ENV_FILE, envFileWritable, getEnv } from "./env-file";

export type DbState = "ok" | "missing" | "unreachable" | "unmigrated";

export interface DbStatus {
  state: DbState;
  /** Why the database is unreachable, in one line. */
  message?: string;
  /** The configured URL with the password hidden, for display only. */
  display?: string;
}

export interface SetupStatus {
  db: DbStatus;
  env: { writable: boolean; file: string };
  mcp: { configured: boolean };
}

/** `postgresql://user:•••@host:5432/db` */
export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = "•••";
    return decodeURIComponent(u.toString());
  } catch {
    return url.replace(/:\/\/([^:@/]+):[^@]*@/, "://$1:•••@");
  }
}

/** Prisma error text minus the "Invalid `prisma.x()` invocation" boilerplate, one line, capped. */
export function describeDbError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  const lines = raw.split("\n").map((l) => l.trim()).filter((l) => l && !/^Invalid `.*` invocation/.test(l));
  return (lines.at(-1) ?? "Unknown database error").slice(0, 300);
}

const MIGRATED_SQL = `SELECT to_regclass('public."Project"') IS NOT NULL AS migrated`;

export function isPostgresUrl(url: string): boolean {
  return /^postgres(ql)?:\/\/\S+$/i.test(url.trim());
}

/** Try a URL without touching the app's own client. */
export async function testDatabaseUrl(url: string): Promise<{ ok: true; migrated: boolean } | { ok: false; message: string }> {
  const client = new PrismaClient({ datasourceUrl: url, log: prismaLog });
  try {
    const rows = await client.$queryRawUnsafe<{ migrated: boolean }[]>(MIGRATED_SQL);
    return { ok: true, migrated: rows[0]?.migrated === true };
  } catch (e) {
    return { ok: false, message: describeDbError(e) };
  } finally {
    void client.$disconnect().catch(() => {});
  }
}

export async function getDbStatus(): Promise<DbStatus> {
  const url = getDatabaseUrl();
  if (!url) return { state: "missing" };
  const display = redactUrl(url);
  try {
    const rows = await db.$queryRawUnsafe<{ migrated: boolean }[]>(MIGRATED_SQL);
    return rows[0]?.migrated ? { state: "ok" } : { state: "unmigrated", display };
  } catch (e) {
    return { state: "unreachable", message: describeDbError(e), display };
  }
}

export async function getSetupStatus(): Promise<SetupStatus> {
  return {
    db: await getDbStatus(),
    env: { writable: envFileWritable(), file: ENV_FILE },
    mcp: { configured: Boolean(getEnv("MCP_API_KEY")) },
  };
}

/**
 * Settings endpoints may only be called by DevBoard's own pages, never by another site through the user's browser.
 * Non-browser clients (curl, scripts) send neither header and pass, like the rest of the unauthenticated REST API.
 */
export function isSameOrigin(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}
