import { PrismaClient } from "@prisma/client";
import { getEnv } from "./env-file";

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not configured. Open DevBoard in a browser to set it, or add it to .env.");
    this.name = "DatabaseNotConfiguredError";
  }
}

/** Process environment first, then `.env` on disk, so a URL saved from the setup dialog works without a restart. */
export const getDatabaseUrl = () => getEnv("DATABASE_URL");

export const prismaLog = (process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]) as ("warn" | "error")[];

type Cached = { url: string; client: PrismaClient };
const g = globalThis as unknown as { prismaCached?: Cached };

/** One client per process, rebuilt if DATABASE_URL changes (the setup dialog can change it at runtime). */
function getClient(): PrismaClient {
  const url = getDatabaseUrl();
  if (!url) throw new DatabaseNotConfiguredError();
  const cached = g.prismaCached;
  if (cached?.url === url) return cached.client;
  if (cached) void cached.client.$disconnect().catch(() => {});
  const client = new PrismaClient({ datasourceUrl: url, log: prismaLog });
  g.prismaCached = { url, client };
  return client;
}

/** Lazy: nothing connects until the first query, so the app can boot (and show the setup dialog) with no database. */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
