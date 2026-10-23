"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProjectDTO } from "@/lib/types";
import { useArchiveProject } from "./use-archive";

/** Shown on an archived project's pages. Everything stays readable; new tasks, columns and imports are disabled. */
export function ArchivedBanner({ project }: { project: ProjectDTO }) {
  const archive = useArchiveProject();
  const [busy, setBusy] = useState(false);
  return (
    <div role="status" className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
      <Archive className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <b>{project.name}</b> is archived. You can still look around, but new tasks and columns are disabled.
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={async () => { setBusy(true); await archive(project, false); setBusy(false); }}
      >
        {busy ? <Loader2 className="animate-spin" /> : <ArchiveRestore />}Restore
      </Button>
    </div>
  );
}
