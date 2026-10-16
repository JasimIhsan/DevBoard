"use client";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, qk } from "@/lib/client";
import { clearProjectFlags, setProjectFlags } from "@/lib/project-flags";
import type { ProjectDTO } from "@/lib/types";

/**
 * Archive or restore a project. The sidebar updates instantly (optimistic flag); the cached board is invalidated too,
 * because it embeds the project and drives the "Archived" banner and the add buttons on its pages.
 */
export function useArchiveProject() {
  const router = useRouter();
  const qc = useQueryClient();
  return async (project: Pick<ProjectDTO, "key" | "name">, archived: boolean) => {
    setProjectFlags(project.key, { archived });
    try {
      await api(`/api/projects/${project.key}`, { method: "PATCH", json: { archived } });
      await qc.invalidateQueries({ queryKey: qk.board(project.key) });
      router.refresh();
      toast.success(archived ? `Archived ${project.name}` : `Restored ${project.name}`);
      return true;
    } catch (e) {
      clearProjectFlags(project.key);
      toast.error((e as Error).message);
      return false;
    }
  };
}
