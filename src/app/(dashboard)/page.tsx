import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { AlertTriangle, CheckCircle2, CircleDot, Flame, Plus } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { DueChip, PriorityBadge, TypeIcon } from "@/components/task/badges";
import { getDashboard } from "@/lib/data";
import type { TaskDTO } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

const href = (t: TaskDTO) => `/projects/${t.projectKey}/board?task=${t.key}`;

function TaskRow({ t, right }: { t: TaskDTO; right?: React.ReactNode }) {
  return (
    <li>
      <Link href={href(t)} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50">
        <TypeIcon type={t.type} />
        <span className="shrink-0 font-mono text-xs text-muted-foreground">{t.key}</span>
        <span className="truncate">{t.title}</span>
        <span className="ml-auto flex shrink-0 items-center gap-2">{right}<PriorityBadge priority={t.priority} /></span>
      </Link>
    </li>
  );
}

function Card({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border bg-card/50 p-4 ${className ?? ""}`}>
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

export default async function DashboardPage() {
  const d = await getDashboard();
  const stats = [
    { label: "Open tasks", value: d.stats.openTasks, icon: CircleDot, tone: "text-sky-400" },
    { label: "In progress", value: d.stats.inProgress, icon: Flame, tone: "text-amber-400" },
    { label: "Open P0", value: d.stats.urgent, icon: AlertTriangle, tone: "text-red-400" },
    { label: "Done this week", value: d.stats.doneThisWeek, icon: CheckCircle2, tone: "text-emerald-400" },
  ];

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">{format(new Date(), "EEEE, MMMM d")}{d.stats.overdue > 0 && <span className="text-red-400"> · {d.stats.overdue} overdue</span>}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map(({ label, value, icon: Icon, tone }) => (
            <div key={label} className="rounded-xl border bg-card/50 p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className={`size-4 ${tone}`} />{label}</div>
              <div className="mt-2 text-3xl font-semibold tabular-nums">{value}</div>
            </div>
          ))}
        </div>

        <Card title="Active sprints">
          {d.sprints.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active sprints. Start one from a project backlog.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {d.sprints.map((s) => {
                const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
                return (
                  <Link key={s.sprint.id} href={`/projects/${s.project.key}/board`} className="block rounded-lg border p-3 transition-colors hover:border-foreground/25">
                    <div className="flex items-center gap-2">
                      <span className="grid size-5 place-items-center rounded text-[9px] font-bold text-white" style={{ background: s.project.color }}>{s.project.key.slice(0, 2)}</span>
                      <span className="font-medium">{s.project.name}</span>
                      <span className="text-sm text-muted-foreground">· {s.sprint.name}</span>
                      {s.daysLeft !== null && <span className={`ml-auto text-xs ${s.daysLeft < 0 ? "text-red-400" : "text-muted-foreground"}`}>{s.daysLeft < 0 ? `${-s.daysLeft}d overdue` : `${s.daysLeft}d left`}</span>}
                    </div>
                    {s.sprint.goal && <p className="mt-1 truncate text-xs text-muted-foreground">{s.sprint.goal}</p>}
                    <Progress value={pct} className="mt-3 h-1.5" />
                    <p className="mt-2 text-xs text-muted-foreground">{s.done}/{s.total} done · {s.inProgress} in flight · {s.pointsDone}/{s.points} pts · {pct}%</p>
                  </Link>
                );
              })}
            </div>
          )}
          {d.projectsWithoutSprint.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">No active sprint: {d.projectsWithoutSprint.map((p, i) => <span key={p.id}>{i > 0 && ", "}<Link className="underline" href={`/projects/${p.key}/backlog`}>{p.key}</Link></span>)}</p>
          )}
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="In progress across projects">
            {d.inProgress.length ? <ul>{d.inProgress.map((t) => <TaskRow key={t.id} t={t} />)}</ul> : <p className="text-sm text-muted-foreground">Nothing in progress — pick something up from a board.</p>}
          </Card>
          <Card title="Due soon & overdue">
            {d.dueSoon.length ? <ul>{d.dueSoon.map((t) => <TaskRow key={t.id} t={t} right={t.dueDate && <DueChip date={t.dueDate} />} />)}</ul> : <p className="text-sm text-muted-foreground">No deadlines in the next 7 days.</p>}
          </Card>
        </div>

        <Card title="Recently completed">
          {d.recentlyDone.length ? <ul>{d.recentlyDone.map((t) => <TaskRow key={t.id} t={t} right={t.completedAt && <span className="text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(t.completedAt), { addSuffix: true })}</span>} />)}</ul> : <p className="text-sm text-muted-foreground">Nothing completed in the last 7 days.</p>}
        </Card>

        {d.sprints.length === 0 && d.stats.openTasks === 0 && (
          <Button asChild><Link href="/"><Plus />Create your first project from the sidebar</Link></Button>
        )}
      </div>
    </div>
  );
}
