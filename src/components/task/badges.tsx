import { Bug, FlaskConical, Sparkles, Wrench, CalendarClock } from "lucide-react";
import { PRIORITY_META, TYPE_META, STATUS_META } from "@/lib/constants";
import type { Priority, TaskStatus, TaskType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { format, isPast, isToday, differenceInCalendarDays } from "date-fns";

export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded border px-1.5 py-px font-mono text-[10px] font-semibold leading-4", PRIORITY_META[priority].className, className)}>
      {priority}
    </span>
  );
}

const TYPE_ICONS = { FEATURE: Sparkles, BUG: Bug, CHORE: Wrench, SPIKE: FlaskConical } as const;

export function TypeIcon({ type, className }: { type: TaskType; className?: string }) {
  const Icon = TYPE_ICONS[type];
  return <Icon aria-label={TYPE_META[type].label} className={cn("size-3.5 shrink-0", TYPE_META[type].className, className)} />;
}

export function StatusDot({ status, className }: { status: TaskStatus; className?: string }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", STATUS_META[status].dot, className)} />;
}

export function LabelChip({ label }: { label: string }) {
  return <span className="rounded bg-muted px-1.5 py-px text-[10px] text-muted-foreground">{label}</span>;
}

export function DueChip({ date, done }: { date: string; done?: boolean }) {
  const d = new Date(date);
  const overdue = !done && isPast(d) && !isToday(d);
  const soon = !done && !overdue && differenceInCalendarDays(d, new Date()) <= 2;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[10px]", overdue ? "text-red-400" : soon ? "text-amber-400" : "text-muted-foreground")}>
      <CalendarClock className="size-3" />
      {isToday(d) ? "Today" : format(d, "MMM d")}
    </span>
  );
}
