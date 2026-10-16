import type { ProjectDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: "size-5 rounded text-[9px]",
  md: "size-6 rounded text-[10px]",
  lg: "size-10 rounded-lg text-sm",
} as const;

/** A project's icon: its color with the first two letters of its key. Used everywhere a project is shown. */
export function ProjectTile({ project, size = "sm", className }: { project: Pick<ProjectDTO, "key" | "color" | "name">; size?: keyof typeof SIZES; className?: string }) {
  return (
    <span
      role="img"
      aria-label={project.name}
      className={cn("grid shrink-0 place-items-center font-bold text-white", SIZES[size], className)}
      style={{ background: project.color }}
    >
      {project.key.slice(0, 2)}
    </span>
  );
}
