/**
 * Read and update the project's `.env` file (server-only).
 *
 * DevBoard lets you set `DATABASE_URL` and `MCP_API_KEY` from the UI. Those land here, in `.env` next to
 * package.json, and `getEnv()` reads them straight from disk so they apply without restarting the app.
 */
import { accessSync, constants, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const ENV_FILE = join(process.cwd(), ".env");

/** Minimal dotenv parser: `KEY=value`, optional `export`, single/double quotes, `#` comments. */
export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      const q = value[0];
      value = value.slice(1, -1);
      if (q === '"') value = value.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    } else {
      value = value.replace(/\s+#.*$/, "").trim();
    }
    out[m[1]] = value;
  }
  return out;
}

let cache: { mtimeMs: number; checkedAt: number; values: Record<string, string> } | null = null;

/** Values in `.env` on disk. Re-read when the file changes (checked at most once a second). */
export function readEnvFile(): Record<string, string> {
  const now = Date.now();
  if (cache && now - cache.checkedAt < 1000) return cache.values;
  try {
    const mtimeMs = statSync(ENV_FILE).mtimeMs;
    if (cache && cache.mtimeMs === mtimeMs) {
      cache.checkedAt = now;
      return cache.values;
    }
    const values = parseEnv(readFileSync(ENV_FILE, "utf8"));
    cache = { mtimeMs, checkedAt: now, values };
    return values;
  } catch {
    cache = { mtimeMs: -1, checkedAt: now, values: {} };
    return cache.values;
  }
}

/** The live value of a setting: the process environment wins, then `.env` on disk. Empty strings count as unset. */
export function getEnv(name: string): string | undefined {
  return process.env[name] || readEnvFile()[name] || undefined;
}

const quote = (v: string) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;

/** Add or replace keys in `.env`, keeping every other line (comments included) as it is. */
export function upsertEnv(values: Record<string, string>): void {
  let text = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
  for (const [key, value] of Object.entries(values)) {
    const re = new RegExp(`^[ \\t]*(?:export[ \\t]+)?${key}[ \\t]*=.*$`, "m");
    const line = `${key}=${quote(value)}`;
    if (re.test(text)) text = text.replace(re, line);
    else text = (text && !text.endsWith("\n") ? text + "\n" : text) + line + "\n";
    // Same process: make the new value visible immediately, not only after a restart.
    process.env[key] = value;
  }
  writeFileSync(ENV_FILE, text, "utf8");
  cache = null;
}

/** Can this process write `.env`? False on read-only hosts (Vercel and similar), where settings come from the dashboard. */
export function envFileWritable(): boolean {
  if (process.env.VERCEL || process.env.DEVBOARD_LOCK_ENV) return false;
  try {
    accessSync(existsSync(ENV_FILE) ? ENV_FILE : dirname(ENV_FILE), constants.W_OK);
    return true;
  } catch {
    return false;
  }
}
