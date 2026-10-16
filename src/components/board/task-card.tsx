"use client";

import { forwardRef, memo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowRightLeft, CheckSquare, GitBranch } from "lucide-react";
import { toast } from "sonner";
import type { TaskDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DueChip, LabelChip, PriorityBadge, TypeIcon } from "@/components/task/badges";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  task: TaskDTO;
  onOpen?: (task: TaskDTO) => void;
  onQuickMove?: (task: TaskDTO) => void;
  dragging?: boolean;
  overlay?: boolean;
  /** Project color, shown as a left edge so cards from different projects are tellable apart (central board). */
  accent?: string;
}

/** Presentational card — used in columns, the drag overlay and the mobile list. */
export const TaskCard = memo(forwardRef<HTMLDivElement, CardProps>(function TaskCard(
  { task, onOpen, onQuickMove, dragging, overlay, accent, className, style, ...rest },
  ref,
) {
  const done = task.status === "DONE";
  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      aria-label={`${task.key} ${task.title}`}
      onClick={() => onOpen?.(task)}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen?.(task); }}
      className={cn(
        "group relative cursor-grab select-none rounded-lg border bg-card p-3 text-left shadow-sm hover:border-foreground/25 focus-visible:outline-2 focus-visible:outline-ring",
        // The in-column original becomes an empty slot while its clone floats in the overlay.
        dragging && "border-dashed border-foreground/25 bg-transparent shadow-none [&>*]:invisible",
        overlay && "cursor-grabbing border-foreground/30 shadow-2xl ring-1 ring-foreground/10",
        className,
      )}
      style={accent ? { ...style, borderLeft: `3px solid ${accent}` } : style}
      {...rest}
    >
      <div className="flex items-center gap-1.5">
        <TypeIcon type={task.type} />
        <span className="font-mono text-[11px] text-muted-foreground">{task.key}</span>
        <PriorityBadge priority={task.priority} className="ml-auto" />
        {onQuickMove && (
          <button
            type="button"
            aria-label={`Move ${task.key}`}
            onClick={(e) => { e.stopPropagation(); onQuickMove(task); }}
            onPointerDown={(e) => e.stopPropagation()}
            className="-my-1 -mr-1 grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
          >
            <ArrowRightLeft className="size-4" />
          </button>
        )}
      </div>
      <p className={cn("mt-1.5 line-clamp-2 text-sm leading-snug", done && "text-muted-foreground line-through decoration-muted-foreground/50")}>{task.title}</p>

      {task.labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">{task.labels.slice(0, 3).map((l) => <LabelChip key={l} label={l} />)}{task.labels.length > 3 && <LabelChip label={`+${task.labels.length - 3}`} />}</div>
      )}

      <div className="mt-2.5 flex items-center gap-3 text-[11px] text-muted-foreground">
        {task.dueDate && <DueChip date={task.dueDate} done={done} />}
        {task.subtasksTotal > 0 && (
          <span className="inline-flex items-center gap-1"><CheckSquare className="size-3" />{task.subtasksDone}/{task.subtasksTotal}</span>
        )}
        {task.branchName && (
          <button
            type="button"
            title={`Copy: git checkout -b ${task.branchName}`}
            onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(`git checkout -b ${task.branchName}`).then(() => toast.success("Copied git checkout command")); }}
            onPointerDown={(e) => e.stopPropagation()}
            className="inline-flex min-w-0 items-center gap-1 hover:text-foreground"
          >
            <GitBranch className="size-3 shrink-0" /><span className="max-w-28 truncate font-mono">{task.branchName}</span>
          </button>
        )}
        {task.estimate != null && <span className="ml-auto rounded-full bg-muted px-1.5 font-medium">{task.estimate}</span>}
      </div>
    </div>
  );
}));


export const SortableTaskCard = memo(function SortableTaskCard({ task, onOpen }: { task: TaskDTO; onOpen: (t: TaskDTO) => void }) {
  // transition: null → neighbours move instantly as you drag over them; no easing, no settle.
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({ id: task.id, data: { type: "task" }, transition: null });
  return (
    <TaskCard
      ref={setNodeRef}
      task={task}
      onOpen={onOpen}
      dragging={isDragging}
      style={{ transform: CSS.Translate.toString(transform), touchAction: "manipulation" }}
      {...attributes}
      {...listeners}
    />
  );
});
