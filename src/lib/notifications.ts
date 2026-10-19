import { db } from "./db";
import { pushConfigured, sendPush, type PushPayload } from "./push";

/**
 * Reminder engine. `buildNotifications` is pure (data in, notifications out) so it is easy to reason about and test;
 * `runNotifications` sends them and records what went out so repeated runs never repeat a notification.
 *
 * "Today" is the subscriber's own day (their device timezone), because due dates are saved as noon local time.
 */

export interface PendingNotification extends PushPayload {
  /** Dedupe key: a notification with this key is sent at most once (or once per `cooldownDays`). */
  key: string;
  cooldownDays?: number;
  /** Earliest local hour at which it makes sense to send. */
  fromHour: number;
}

export interface OpenTask { key: string; title: string; status: string; priority: string; dueDate: Date | null; projectKey: string; sprintId: string | null }
export interface OpenTodo { title: string; priority: string; dueDate: Date | null }
export interface ActiveSprint { id: string; name: string; projectKey: string; endDate: Date | null }
export interface ProjectActivity { key: string; name: string; lastActivity: Date; openTasks: number }
export interface Snapshot { tasks: OpenTask[]; todos: OpenTodo[]; sprints: ActiveSprint[]; projects: ProjectActivity[] }

export const QUIET_FROM = 7; // local hours in which notifications may be sent
export const QUIET_UNTIL = 21;

export const localDay = (d: Date, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
export const localHour = (d: Date, tz: string) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hour12: false }).format(d)) % 24;
const dayNumber = (day: string) => Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function list(items: string[], max = 3) {
  const shown = items.slice(0, max).join(" · ");
  return items.length > max ? `${shown} · +${items.length - max} more` : shown;
}

export function buildNotifications(s: Snapshot, now: Date, tz: string, staleDays = 3): PendingNotification[] {
  const today = localDay(now, tz);
  const dueDay = (d: Date | null) => (d ? localDay(d, tz) : null);
  const label = (t: OpenTask) => `${t.key} ${t.title}`;
  const out: PendingNotification[] = [];

  const tasksToday = s.tasks.filter((t) => dueDay(t.dueDate) === today);
  const todosToday = s.todos.filter((t) => dueDay(t.dueDate) === today);
  const tasksLate = s.tasks.filter((t) => { const d = dueDay(t.dueDate); return d !== null && d < today; });
  const todosLate = s.todos.filter((t) => { const d = dueDay(t.dueDate); return d !== null && d < today; });

  const counts = (tasks: unknown[], todos: unknown[]) => [tasks.length && plural(tasks.length, "task"), todos.length && plural(todos.length, "to-do")].filter(Boolean).join(" and ");

  if (tasksToday.length + todosToday.length > 0) {
    out.push({ key: `digest:${today}`, fromHour: QUIET_FROM, tag: "digest", url: tasksToday.length ? "/" : "/todos", title: `Due today: ${counts(tasksToday, todosToday)}`, body: list([...tasksToday.map(label), ...todosToday.map((t) => t.title)]) });
  }
  if (tasksLate.length + todosLate.length > 0) {
    out.push({ key: `overdue:${today}`, fromHour: QUIET_FROM, tag: "overdue", url: tasksLate.length ? "/" : "/todos", urgent: true, title: `Overdue: ${counts(tasksLate, todosLate)}`, body: list([...tasksLate.map(label), ...todosLate.map((t) => t.title)]) });
  }

  const p0 = s.tasks.filter((t) => t.priority === "P0");
  const high = s.todos.filter((t) => t.priority === "HIGH");
  if (p0.length + high.length > 0) {
    out.push({ key: `urgent:${today}`, fromHour: QUIET_FROM, tag: "urgent", url: p0.length ? "/" : "/todos", urgent: true, title: `Urgent: ${[p0.length && `${plural(p0.length, "P0 task")}`, high.length && `${plural(high.length, "high-priority to-do")}`].filter(Boolean).join(" and ")} pending`, body: list([...p0.map(label), ...high.map((t) => t.title)]) });
  }

  // Late afternoon: whatever was due today and is still open.
  if (tasksToday.length + todosToday.length > 0) {
    out.push({ key: `evening:${today}`, fromHour: 16, tag: "evening", url: tasksToday.length ? "/" : "/todos", title: `Still pending today: ${counts(tasksToday, todosToday)}`, body: list([...tasksToday.map(label), ...todosToday.map((t) => t.title)]) });
  }

  for (const sp of s.sprints) {
    const end = dueDay(sp.endDate);
    if (!end) continue;
    const left = dayNumber(end) - dayNumber(today);
    if (left > 1) continue;
    const open = s.tasks.filter((t) => t.sprintId === sp.id).length;
    out.push({
      key: `sprint:${sp.id}:${today}`, fromHour: QUIET_FROM, tag: `sprint-${sp.id}`, url: `/projects/${sp.projectKey}/board`,
      title: `${sp.projectKey} · ${sp.name} ${left < 0 ? `ended ${plural(-left, "day")} ago` : left === 0 ? "ends today" : "ends tomorrow"}`,
      body: open ? `${plural(open, "task")} still open. Complete the sprint or move work forward.` : "All tasks are done. Complete the sprint.",
    });
  }

  for (const p of s.projects) {
    const days = dayNumber(today) - dayNumber(localDay(p.lastActivity, tz));
    if (days < staleDays || p.openTasks === 0) continue;
    out.push({ key: `stale:${p.key}`, cooldownDays: staleDays, fromHour: 9, tag: `stale-${p.key}`, url: `/projects/${p.key}/board`, title: `${p.key} · ${p.name} has gone quiet`, body: `No activity for ${plural(days, "day")}. ${plural(p.openTasks, "task")} still open.` });
  }
  return out;
}

export async function loadSnapshot(): Promise<Snapshot> {
  const [tasks, todos, sprints, projects, byProject, comments] = await Promise.all([
    db.task.findMany({ where: { status: { not: "DONE" }, project: { archivedAt: null } }, select: { taskNumber: true, title: true, status: true, priority: true, dueDate: true, sprintId: true, project: { select: { key: true } } } }),
    db.todo.findMany({ where: { done: false }, select: { title: true, priority: true, dueDate: true } }),
    db.sprint.findMany({ where: { status: "ACTIVE", project: { archivedAt: null } }, select: { id: true, name: true, endDate: true, project: { select: { key: true } } } }),
    db.project.findMany({ where: { archivedAt: null }, select: { id: true, key: true, name: true, createdAt: true } }),
    db.task.groupBy({ by: ["projectId"], _max: { updatedAt: true } }),
    db.comment.findMany({ orderBy: { createdAt: "desc" }, take: 200, select: { createdAt: true, task: { select: { projectId: true } } } }),
  ]);
  const activeStatuses = new Set(["TODO", "IN_PROGRESS", "IN_REVIEW"]);
  const lastByProject = new Map<string, Date>();
  const bump = (id: string, d: Date | null | undefined) => { if (d && (!lastByProject.get(id) || d > lastByProject.get(id)!)) lastByProject.set(id, d); };
  byProject.forEach((g) => bump(g.projectId, g._max.updatedAt));
  comments.forEach((c) => bump(c.task.projectId, c.createdAt));
  const openByKey = new Map<string, number>();
  tasks.forEach((t) => { if (activeStatuses.has(t.status)) openByKey.set(t.project.key, (openByKey.get(t.project.key) ?? 0) + 1); });

  return {
    tasks: tasks.map((t) => ({ key: `${t.project.key}-${t.taskNumber}`, title: t.title, status: t.status, priority: t.priority, dueDate: t.dueDate, projectKey: t.project.key, sprintId: t.sprintId })),
    todos,
    sprints: sprints.map((s) => ({ id: s.id, name: s.name, projectKey: s.project.key, endDate: s.endDate })),
    projects: projects.map((p) => ({ key: p.key, name: p.name, lastActivity: lastByProject.get(p.id) ?? p.createdAt, openTasks: openByKey.get(p.key) ?? 0 })),
  };
}

export interface RunResult {
  configured: boolean;
  subscribers: number;
  sent: { key: string; title: string; body: string; delivered: number }[];
  skipped: number;
}

/**
 * Builds and sends everything that is due. `force` ignores quiet hours and the "already sent" log (for testing);
 * `dry` builds without sending or recording.
 */
export async function runNotifications(opts: { now?: Date; force?: boolean; dry?: boolean } = {}): Promise<RunResult> {
  const now = opts.now ?? new Date();
  const staleDays = Math.max(1, Number(process.env.NOTIFY_STALE_DAYS) || 3);
  const result: RunResult = { configured: pushConfigured(), subscribers: 0, sent: [], skipped: 0 };
  const subs = await db.pushSubscription.findMany();
  result.subscribers = subs.length;
  // A preview works before any device is registered (and without keys); a real run needs both.
  if (!opts.dry && (!result.configured || subs.length === 0)) return result;

  const snapshot = await loadSnapshot();
  const byTz = new Map<string, typeof subs>();
  subs.forEach((s) => byTz.set(s.timezone, [...(byTz.get(s.timezone) ?? []), s]));
  if (byTz.size === 0) byTz.set(process.env.NOTIFY_TIMEZONE || "UTC", []);

  for (const [tz, group] of byTz) {
    const hour = localHour(now, tz);
    if (!opts.force && (hour < QUIET_FROM || hour >= QUIET_UNTIL)) { result.skipped++; continue; }
    for (const n of buildNotifications(snapshot, now, tz, staleDays)) {
      const logKey = `${tz}|${n.key}`;
      if (!opts.force && hour < n.fromHour) { result.skipped++; continue; }
      if (!opts.force) {
        const prior = await db.notificationLog.findUnique({ where: { key: logKey } });
        const fresh = prior && (!n.cooldownDays || now.getTime() - prior.sentAt.getTime() < n.cooldownDays * 86_400_000);
        if (fresh) { result.skipped++; continue; }
      }
      if (opts.dry) { result.sent.push({ key: n.key, title: n.title, body: n.body, delivered: 0 }); continue; }
      const { key: _k, cooldownDays: _c, fromHour: _f, ...payload } = n;
      void _k; void _c; void _f;
      const delivered = (await Promise.all(group.map((s) => sendPush(s, payload)))).filter(Boolean).length;
      if (delivered > 0) await db.notificationLog.upsert({ where: { key: logKey }, create: { key: logKey, sentAt: now }, update: { sentAt: now } });
      result.sent.push({ key: n.key, title: n.title, body: n.body, delivered });
    }
  }
  await db.notificationLog.deleteMany({ where: { sentAt: { lt: new Date(now.getTime() - 30 * 86_400_000) } } }); // keep the log small
  return result;
}
