"use client";

import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/client";
import { clearProjectFlags, setProjectFlags } from "@/lib/project-flags";
import type { ProjectDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Toggles a project's star. Optimistic: the sidebar regroups immediately; rolled back if the request fails. */
export function useToggleStar() {
  const router = useRouter();
  return async (project: Pick<ProjectDTO, "key" | "name" | "starred">) => {
    const starred = !project.starred;
    setProjectFlags(project.key, { starred });
    try {
      await api(`/api/projects/${project.key}`, { method: "PATCH", json: { starred } });
      router.refresh();
    } catch (e) {
      clearProjectFlags(project.key);
      toast.error((e as Error).message);
    }
  };
}

export function StarButton({ project, className }: { project: Pick<ProjectDTO, "key" | "name" | "starred">; className?: string }) {
  const toggle = useToggleStar();
  return (
    <button
      type="button"
      aria-label={project.starred ? `Unstar ${project.name}` : `Star ${project.name}`}
      aria-pressed={project.starred}
      title={project.starred ? "Unstar" : "Star"}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); void toggle(project); }}
      className={cn("grid size-6 place-items-center rounded text-muted-foreground hover:text-foreground", className)}
    >
      <Star className={cn("size-3.5", project.starred && "fill-amber-400 text-amber-400")} />
    </button>
  );
}
