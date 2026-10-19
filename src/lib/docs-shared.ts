/** Client-safe docs helpers (the loader in docs.ts uses fs and is server-only). */
export function slugify(text: string): string {
  return text.toLowerCase().replace(/`/g, "").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
}

export interface DocNavGroup { group: string; items: { slug: string; title: string }[] }

export interface DocMeta { slug: string; title: string; description: string; group: string }

/** Navigation order. Each entry maps to `src/content/docs/<slug>.md`. */
export const DOCS: DocMeta[] = [
  { group: "Getting started", slug: "welcome", title: "Welcome", description: "What DevBoard is and how the docs are organised." },
  { group: "Getting started", slug: "quickstart", title: "Quickstart", description: "Create a project, plan a sprint and ship your first task in five minutes." },
  { group: "Getting started", slug: "concepts", title: "Core concepts", description: "A glossary of every term used in DevBoard." },
  { group: "Features", slug: "projects", title: "Projects", description: "Create, star, archive and delete projects." },
  { group: "Features", slug: "tasks", title: "Tasks", description: "Fields, subtasks, comments and activity." },
  { group: "Features", slug: "board", title: "Kanban board", description: "Columns, drag and drop, and filters." },
  { group: "Features", slug: "backlog-sprints", title: "Backlog & sprints", description: "Plan work and run time-boxed sprints." },
  { group: "Features", slug: "import-csv", title: "Import from CSV", description: "Bring many tasks in at once." },
  { group: "Features", slug: "dashboard", title: "Dashboard & all-projects board", description: "See everything across projects." },
  { group: "Features", slug: "todos", title: "To-dos", description: "A quick personal checklist, one tap away." },
  { group: "Features", slug: "search-shortcuts", title: "Search, Recent & shortcuts", description: "Move around quickly." },
  { group: "Features", slug: "install-app", title: "Install as an app", description: "Use DevBoard on macOS, Windows, Android and iOS." },
  { group: "MCP for AI", slug: "mcp-overview", title: "MCP overview", description: "Let AI assistants manage your tasks." },
  { group: "MCP for AI", slug: "mcp-setup", title: "Connect a client", description: "Claude, Gemini, Cursor and other MCP clients." },
  { group: "MCP for AI", slug: "mcp-tools", title: "Tools, resources & prompts", description: "Everything an AI can call." },
  { group: "MCP for AI", slug: "mcp-security", title: "MCP security", description: "API key, origins and safe use." },
  { group: "Reference", slug: "rest-api", title: "REST API", description: "The HTTP endpoints behind the app." },
  { group: "Reference", slug: "faq", title: "FAQ & troubleshooting", description: "Answers to common questions." },
];

export const DOC_GROUPS: DocNavGroup[] = [...new Set(DOCS.map((d) => d.group))].map((group) => ({ group, items: DOCS.filter((d) => d.group === group) }));

/** For the command palette: page title plus group so searches like "mcp" or "sprint" find pages. */
export const DOC_LINKS = DOCS.map((d) => ({ slug: d.slug, title: d.title, search: `${d.title} ${d.group} ${d.description}`.toLowerCase() }));
