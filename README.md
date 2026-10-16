# DevBoard

A fast, single-user, Jira-style Kanban board for developers. No auth — it's built for personal use.

**Stack:** Next.js (App Router, React 19) · TypeScript · Tailwind CSS v4 · shadcn/ui (Radix) · PostgreSQL + Prisma 6 · TanStack Query · dnd-kit · Zod · cmdk

## Setup

```bash
npm install
createdb devboard                 # or: psql -c 'CREATE DATABASE devboard'
npm run dev                       # open http://localhost:3000
```

With no `DATABASE_URL` yet, the app opens on a **Connect a database** dialog: paste the connection string, it is tested, saved to `.env`, and the Prisma migrations are applied from the same dialog. `npm run db:seed` adds sample data (2 projects, sprints, tasks).

The manual route still works: `cp .env.example .env`, edit `DATABASE_URL`, then `npx prisma migrate dev`.

## Features

- **Dashboard** — stats, active-sprint progress across projects, in-progress work, due-soon/overdue, recently done.
- **Projects** (`/projects`) — manage every project in one place: progress, active sprint and activity at a glance; edit name, description and color (the key is permanent); delete with typed confirmation.
- **Star** — star a project (sidebar row or Projects page) to pin it in a **Starred** group at the top of the sidebar; starred projects sort first everywhere.
- **Archive** — hide a finished project without deleting it. Archived projects disappear from the sidebar, dashboard, all-projects board, search and Recent, and live under **Projects → Archived**. Their pages stay viewable with a banner and a Restore button; new tasks, sprints and CSV imports are blocked (the API returns 409). Archiving removes the star.
- **Recent** — a Jira-style sidebar flyout (searchable, grouped Today / Yesterday / Earlier) plus a short inline list of the boards, backlogs and tasks you opened or worked on, each shown with its project's icon. It is **stored on the server and shared by every device** that opens this app (there are no accounts, so it is one global list): it follows you from your computer to your phone, works offline from a local cache, and queues visits until you're back online.
- **All projects board** (`/board`) — one Kanban over the active sprints of every project: project-colored cards, project chips to show/hide projects, shared filters; drag a card between columns to change its status (cards sort by priority across projects).
- **Kanban board** (`/projects/KEY/board`) — dnd-kit drag & drop with optimistic updates on desktop (≥1024px);
  segmented column tabs with snap scrolling, quick-move bottom sheet and a floating “+” on mobile.
- **Backlog grooming** (`/projects/KEY/backlog`) — sprint sections, drag tasks between sprints/backlog,
  inline quick-add, start / complete (with carry-over) / delete sprints.
- **Task detail** (`?task=CORE-12`, linkable) — Markdown description, subtasks with progress, comments,
  activity log, labels, estimate, due date, PR link, auto-generated git branch + copy `git checkout -b`.
- **Command palette** — `⌘K` / `Ctrl+K`: jump to projects, search tasks by key or title, create task/project. Press `c` anywhere to create a task.
- **Filters** — text, priority, type, label.
- **Fractional indexing** — `orderIndex: Float`; a reorder updates exactly one row (`src/lib/ordering.ts`), with an automatic column re-space if float precision runs out.

## Documentation and MCP

- **In-app docs:** open **Help & docs** in the sidebar (or `/docs`). Short pages cover every feature; the Markdown sources live in `src/content/docs/`, and the page order is the `DOCS` list in `src/lib/docs-shared.ts`.
- **MCP server:** AI assistants (Claude, Gemini, Cursor, …) can read and manage tasks through 27 tools.
  - HTTP: `http://localhost:3000/api/mcp` (Streamable HTTP). Requires an API key: open **MCP access** in the sidebar to generate one (stored as `MCP_API_KEY` in `.env`); clients send it as `Authorization: Bearer <key>`.
  - stdio: `npm run --silent mcp` (set `DEVBOARD_URL` if the app is not on :3000).
  - Setup per client, the tool list and security notes: `/docs/mcp-overview`.

## API

| Route | Purpose |
| --- | --- |
| `GET/POST /api/tasks` | List (`projectKey`, `sprintId`, `status`, `q`, `sort`, `limit`) / create |
| `GET/PATCH/DELETE /api/tasks/:id` | `:id` is a UUID or a key such as `CORE-12` |
| `PATCH /api/tasks/:id/reorder` | `{ newStatus, prevTaskId, nextTaskId }` — single-row fractional reorder |
| `POST/PATCH/DELETE /api/tasks/:id/subtasks` | Checklist items |
| `POST/DELETE /api/tasks/:id/comments` | Notes |
| `GET/POST /api/projects` · `GET/DELETE /api/projects/:key` | Projects (`GET :key` returns project + sprints + tasks) |
| `GET/POST/PATCH /api/projects/:key/sprints` | Sprint lifecycle: `start`, `complete`, `update`, `delete` |

## Layout

```
prisma/schema.prisma, seed.ts
src/lib/        db, ordering, validators (Zod), serialize, data (server queries), client (TanStack hooks)
src/app/api/    route handlers
src/app/(dashboard)/   dashboard, board, backlog pages
src/components/ board, backlog, task, shell (sidebar, topbar, ⌘K), ui (shadcn)
```

## Install as an app (PWA)

DevBoard is an installable Progressive Web App: its own window or home-screen icon, launched like a native app.

| Platform | How |
| --- | --- |
| **Windows** | Chrome / Edge: the install icon in the address bar, or the **Install** button in the app's top bar |
| **macOS** | Chrome / Edge: same as Windows. Safari 17+: **File → Add to Dock** |
| **Android** | Chrome: **Install** in the top bar or ⋮ → Install app |
| **iOS / iPadOS** | Safari: Share → **Add to Home Screen** |

The top-bar download button opens a guide that picks your platform automatically and shows a one-click **Install now** where the browser allows it.

- Installing requires **HTTPS** (or `localhost` on desktop). To install on a phone, serve the app over HTTPS (a deployment, or a tunnel to your machine).
- The service worker (`public/sw.js`) is registered in **production builds only** (`npm run build && npm start`); `npm run dev` unregisters it so it never serves stale files. It caches static assets and an offline page, and never caches pages or `/api/*`.
- Icons are generated from one SVG: `node scripts/generate-icons.mjs`.
