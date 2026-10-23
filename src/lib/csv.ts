import { PRIORITIES, TASK_TYPES } from "./constants";
import type { Priority, TaskType } from "./types";

/** Column order for the CSV template. Header matching is case/space-insensitive. */
export const CSV_COLUMNS = ["title", "description", "type", "priority", "column", "labels", "estimate", "due_date"] as const;

export const CSV_TEMPLATE = [
  CSV_COLUMNS.join(","),
  `"Add rate limiting to public API","Return 429 with Retry-After header",FEATURE,P1,To Do,"api, security",3,2026-11-01`,
  `"Fix flaky login test","Fails on CI about 1 in 5 runs",BUG,P0,In Progress,ci,1,`,
  `"Upgrade Prisma to v7",,CHORE,P3,,"deps",2,`,
  `"Evaluate edge caching for dashboard","Spike: measure p95 before/after",SPIKE,P2,,perf,,2026-11-15`,
].join("\n");

export interface CsvTaskRow {
  title: string;
  description?: string;
  type?: TaskType;
  priority?: Priority;
  /** Board column name; empty means Backlog. */
  column?: string;
  labels?: string[];
  estimate?: number | null;
  dueDate?: string | null;
}

export interface CsvParseResult {
  rows: CsvTaskRow[];
  /** Human-readable problems, each prefixed with the 1-based data line number. */
  errors: string[];
  /** Headers found in the file that were ignored. */
  unknownColumns: string[];
}

/** RFC-4180-ish CSV tokenizer: quoted fields, escaped quotes, newlines inside quotes, CRLF. */
export function tokenizeCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      rows.push(row); row = [];
    } else field += c;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

const normalizeHeader = (h: string) => h.trim().toLowerCase().replace(/[\s-]+/g, "_");
const HEADER_ALIASES: Record<string, (typeof CSV_COLUMNS)[number]> = {
  title: "title", name: "title", task: "title", summary: "title",
  description: "description", desc: "description", details: "description",
  type: "type", kind: "type",
  priority: "priority", prio: "priority",
  column: "column", status: "column", state: "column", list: "column",
  labels: "labels", label: "labels", tags: "labels",
  estimate: "estimate", points: "estimate", story_points: "estimate",
  due_date: "due_date", due: "due_date", deadline: "due_date",
};

/** Older files used fixed statuses; map them onto the default column names. */
const LEGACY_STATUS: Record<string, string> = {
  backlog: "", todo: "To Do", to_do: "To Do", open: "To Do",
  in_progress: "In Progress", doing: "In Progress", inprogress: "In Progress",
  in_review: "In Review", review: "In Review", inreview: "In Review",
  done: "Done", closed: "Done", complete: "Done", completed: "Done",
};

function parseDate(v: string): string | null | "invalid" {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  const d = m ? new Date(`${v}T12:00:00`) : new Date(v);
  return Number.isNaN(d.getTime()) ? "invalid" : d.toISOString();
}

export function parseTasksCsv(text: string): CsvParseResult {
  const table = tokenizeCsv(text);
  const errors: string[] = [];
  if (table.length === 0) return { rows: [], errors: ["The file is empty"], unknownColumns: [] };

  const headers = table[0].map(normalizeHeader);
  const map = headers.map((h) => HEADER_ALIASES[h]);
  const unknownColumns = headers.filter((h, i) => h && !map[i]);
  if (!map.includes("title")) return { rows: [], errors: ['Missing a "title" column'], unknownColumns };

  const rows: CsvTaskRow[] = [];
  table.slice(1).forEach((cells, idx) => {
    const line = idx + 1;
    const get = (col: (typeof CSV_COLUMNS)[number]) => {
      const i = map.indexOf(col);
      return i === -1 ? "" : (cells[i] ?? "").trim();
    };
    const title = get("title");
    if (!title) return errors.push(`Row ${line}: title is required`);
    if (title.length > 200) return errors.push(`Row ${line}: title is longer than 200 characters`);

    const row: CsvTaskRow = { title };
    const description = get("description");
    if (description) row.description = description;

    const type = get("type").toUpperCase();
    if (type) {
      if (!(TASK_TYPES as readonly string[]).includes(type)) return errors.push(`Row ${line}: unknown type "${get("type")}" (use ${TASK_TYPES.join(", ")})`);
      row.type = type as TaskType;
    }
    const priority = get("priority").toUpperCase();
    if (priority) {
      if (!(PRIORITIES as readonly string[]).includes(priority)) return errors.push(`Row ${line}: unknown priority "${get("priority")}" (use ${PRIORITIES.join(", ")})`);
      row.priority = priority as Priority;
    }
    const column = get("column");
    if (column) {
      const legacy = LEGACY_STATUS[normalizeHeader(column)];
      const name = legacy !== undefined ? legacy : column;
      if (name) row.column = name.slice(0, 40);
    }

    const labels = get("labels").split(/[,;|]/).map((l) => l.trim().toLowerCase()).filter(Boolean);
    if (labels.some((l) => l.length > 24)) return errors.push(`Row ${line}: labels must be 24 characters or fewer`);
    if (labels.length > 8) return errors.push(`Row ${line}: at most 8 labels`);
    if (labels.length) row.labels = labels;

    const estimate = get("estimate");
    if (estimate) {
      const n = Number(estimate);
      if (!Number.isInteger(n) || n < 0 || n > 100) return errors.push(`Row ${line}: estimate must be a whole number from 0 to 100`);
      row.estimate = n;
    }
    const due = parseDate(get("due_date"));
    if (due === "invalid") return errors.push(`Row ${line}: due_date "${get("due_date")}" is not a date (use YYYY-MM-DD)`);
    if (due) row.dueDate = due;

    rows.push(row);
  });

  return { rows, errors, unknownColumns };
}

/** Groups rows by column name, Backlog first, preserving first-seen column order. */
export function groupByColumn(rows: CsvTaskRow[]) {
  const groups = new Map<string, CsvTaskRow[]>([["", []]]);
  for (const r of rows) {
    const k = r.column ?? "";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  return [...groups.entries()].filter(([, list]) => list.length > 0).map(([column, list]) => ({ column, tasks: list }));
}
