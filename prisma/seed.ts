import { PrismaClient, type Priority, type TaskStatus, type TaskType } from "@prisma/client";

const db = new PrismaClient();
const day = 86_400_000;
const daysFromNow = (n: number) => new Date(Date.now() + n * day);

interface SeedTask {
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  type: TaskType;
  branch: string;
  labels: string[];
  estimate: number;
  due?: number;
  inSprint?: boolean;
  subtasks?: [string, boolean][];
}

async function seedProject(
  p: { name: string; key: string; description: string; color: string },
  sprint: { name: string; goal: string },
  tasks: SeedTask[],
) {
  const project = await db.project.create({ data: { ...p, nextTaskNumber: 1 } });
  const active = await db.sprint.create({
    data: {
      projectId: project.id,
      name: sprint.name,
      goal: sprint.goal,
      status: "ACTIVE",
      startDate: daysFromNow(-5),
      endDate: daysFromNow(9),
    },
  });
  await db.sprint.create({
    data: { projectId: project.id, name: `${sprint.name.replace(/\d+$/, "")}${Number(sprint.name.match(/\d+$/)?.[0] ?? 1) + 1}`, goal: "Next up — draft", status: "DRAFT" },
  });

  const counters: Record<string, number> = {};
  let n = 1;
  for (const t of tasks) {
    const lane = `${t.inSprint === false ? "backlog" : "sprint"}:${t.status}`;
    counters[lane] = (counters[lane] ?? 0) + 1000;
    await db.task.create({
      data: {
        projectId: project.id,
        sprintId: t.inSprint === false ? null : active.id,
        taskNumber: n++,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        type: t.type,
        orderIndex: counters[lane],
        branchName: t.branch,
        labels: t.labels,
        estimate: t.estimate,
        dueDate: t.due !== undefined ? daysFromNow(t.due) : null,
        completedAt: t.status === "DONE" ? daysFromNow(-1) : null,
        subtasks: { create: (t.subtasks ?? []).map(([title, done], i) => ({ title, done, orderIndex: (i + 1) * 1000 })) },
        activities: { create: { kind: "CREATED", detail: "Task created" } },
      },
    });
  }
  await db.project.update({ where: { id: project.id }, data: { nextTaskNumber: n } });
}

async function main() {
  await db.project.deleteMany();

  await seedProject(
    { name: "Core Platform", key: "CORE", description: "Backend services, API and infrastructure", color: "#6366f1" },
    { name: "Sprint 12", goal: "Harden the API and ship webhook retries" },
    [
      {
        title: "Add rate limiting middleware to public API",
        description: "Use a **sliding window** limiter keyed by API token.\n\n- 100 req/min default\n- Return `429` with `Retry-After`\n- Redis-backed, fall back to in-memory in dev",
        status: "IN_PROGRESS", priority: "P0", type: "FEATURE", branch: "feat/core-1-api-rate-limiting",
        labels: ["api", "security"], estimate: 5, due: 2,
        subtasks: [["Design limiter interface", true], ["Redis adapter", false], ["Integration tests", false]],
      },
      {
        title: "Fix N+1 query in /v1/orders listing",
        description: "Orders endpoint issues one query per line item. Use `include` / dataloader.\n\n```sql\nEXPLAIN ANALYZE SELECT ...\n```",
        status: "IN_REVIEW", priority: "P1", type: "BUG", branch: "fix/core-2-orders-n-plus-one",
        labels: ["performance", "db"], estimate: 3, due: 1,
      },
      {
        title: "Migrate CI from Jenkins to GitHub Actions",
        description: "Port build, test and deploy stages. Cache `node_modules` and Docker layers.",
        status: "TODO", priority: "P2", type: "CHORE", branch: "chore/core-3-gha-migration",
        labels: ["ci", "devx"], estimate: 8,
        subtasks: [["Port test stage", false], ["Port deploy stage", false]],
      },
      {
        title: "Webhook delivery retries with exponential backoff",
        description: "Retry failed deliveries up to 6 times: 1m, 5m, 30m, 2h, 6h, 24h. Persist attempt log.",
        status: "DONE", priority: "P1", type: "FEATURE", branch: "feat/core-4-webhook-retries",
        labels: ["webhooks"], estimate: 5,
      },
      {
        title: "Spike: evaluate Postgres logical replication for analytics",
        description: "Compare logical replication vs. CDC (Debezium). Write up findings.",
        status: "BACKLOG", priority: "P3", type: "SPIKE", branch: "spike/core-5-logical-replication",
        labels: ["db", "research"], estimate: 3, inSprint: false,
      },
    ],
  );

  await seedProject(
    { name: "Web Client", key: "WEB", description: "Customer-facing React application", color: "#22c55e" },
    { name: "Sprint 7", goal: "Polish onboarding and improve accessibility" },
    [
      {
        title: "Redesign onboarding checklist component",
        description: "New checklist with progress ring and dismissible steps. Persist in `localStorage`.",
        status: "IN_PROGRESS", priority: "P1", type: "FEATURE", branch: "feat/web-1-onboarding-checklist",
        labels: ["ui", "onboarding"], estimate: 5, due: 4,
        subtasks: [["Progress ring SVG", true], ["Persist dismissed state", false]],
      },
      {
        title: "Fix keyboard focus trap in settings modal",
        description: "Tab escapes the modal on Safari. Audit all dialogs for `aria-modal` and focus return.",
        status: "TODO", priority: "P0", type: "BUG", branch: "fix/web-2-modal-focus-trap",
        labels: ["a11y", "bug"], estimate: 2, due: 1,
      },
      {
        title: "Reduce initial JS bundle below 180kB",
        description: "Split the charts bundle, lazy-load the editor, drop moment.js for date-fns.",
        status: "TODO", priority: "P2", type: "CHORE", branch: "chore/web-3-bundle-diet",
        labels: ["performance"], estimate: 5,
      },
      {
        title: "Dark mode for marketing pages",
        description: "Extend design tokens and test contrast ratios (WCAG AA).",
        status: "BACKLOG", priority: "P3", type: "FEATURE", branch: "feat/web-4-dark-marketing",
        labels: ["ui"], estimate: 3, inSprint: false,
      },
    ],
  );

  console.log("Seeded 2 projects, 2 active sprints, 2 draft sprints, 9 tasks.");
}

main().finally(() => db.$disconnect());
