import { readFile } from "node:fs/promises";
import path from "node:path";
import { DOCS, slugify, type DocMeta } from "./docs-shared";

export { DOCS, DOC_GROUPS } from "./docs-shared";

export type { DocMeta } from "./docs-shared";
export interface DocHeading { id: string; text: string; level: 2 | 3 }
export interface Doc extends DocMeta { body: string; headings: DocHeading[] }

/** `##` / `###` headings outside fenced code blocks, for the "On this page" list. */
export function extractHeadings(body: string): DocHeading[] {
  const out: DocHeading[] = [];
  let fenced = false;
  for (const line of body.split("\n")) {
    if (/^```/.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    const m = /^(#{2,3})\s+(.+?)\s*$/.exec(line);
    if (m) {
      const text = m[2].replace(/[`*_]/g, "");
      out.push({ id: slugify(text), text, level: m[1].length as 2 | 3 });
    }
  }
  return out;
}

export async function getDoc(slug: string): Promise<Doc | null> {
  const meta = DOCS.find((d) => d.slug === slug);
  if (!meta) return null;
  const body = await readFile(path.join(process.cwd(), "src/content/docs", `${slug}.md`), "utf8");
  return { ...meta, body, headings: extractHeadings(body) };
}
