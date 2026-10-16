"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { differenceInCalendarDays, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Archive, ArchiveRestore, CalendarDays, ChevronDown, ChevronRight, Columns3, ListTodo, Loader2, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { api, qk } from "@/lib/client";
import { PROJECT_COLORS } from "@/lib/constants";
import type { ProjectOverview } from "@/lib/data";
import type { ProjectDTO } from "@/lib/types";
import { updateProjectSchema } from "@/lib/validators";
import { cn } from "@/lib/utils";
import { useUi } from "@/components/ui-state";
import { ProjectTile } from "@/components/shell/project-tile";
import { StarButton } from "@/components/shell/star-button";
import { useArchiveProject } from "./use-archive";

export function ProjectsManager({ projects }: { projects: ProjectOverview[] }) {
  const { setCreateProjectOpen } = useUi();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<ProjectOverview | null>(null);
  const [deleting, setDeleting] = useState<ProjectOverview | null>(null);
  const [archiving, setArchiving] = useState<ProjectOverview | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const archive = useArchiveProject();

  const needle = q.trim().toLowerCase();
  const shown = useMemo(() => (needle ? projects.filter((p) => `${p.project.key} ${p.project.name} ${p.project.description ?? ""}`.toLowerCase().includes(needle)) : projects), [projects, needle]);
  const live = useMemo(() => shown.filter((p) => !p.project.archived), [shown]);
  const archivedList = useMemo(() => shown.filter((p) => p.project.archived), [shown]);
  const activeAll = useMemo(() => projects.filter((p) => !p.project.archived), [projects]);
  const totals = useMemo(() => ({ tasks: activeAll.reduce((n, p) => n + p.total, 0), sprints: activeAll.filter((p) => p.sprint).length }), [activeAll]);
  const archivedOpen = showArchived || needle.length > 0; // searching reveals matches inside the archive too

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="mr-auto">
            <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
            <p className="text-sm text-muted-foreground">{activeAll.length} project{activeAll.length === 1 ? "" : "s"} · {totals.tasks} tasks · {totals.sprints} active sprint{totals.sprints === 1 ? "" : "s"}</p>
          </div>
          <div className="relative min-w-40 flex-1 sm:max-w-64 sm:flex-none">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects…" className="pl-8" />
          </div>
          <Button onClick={() => setCreateProjectOpen(true)}><Plus />New project</Button>
        </div>

        {live.length === 0 && archivedList.length === 0 ? (
          <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">{projects.length === 0 ? "No projects yet. Create your first one." : "No projects match your search."}</p>
        ) : (
          <ul className="grid gap-3">
            {live.map((p) => <ProjectCard key={p.project.id} p={p} onEdit={() => setEditing(p)} onDelete={() => setDeleting(p)} onArchive={() => setArchiving(p)} onRestore={() => void archive(p.project, false)} />)}
          </ul>
        )}

        {archivedList.length > 0 && (
          <section aria-label="Archived projects" className="pt-2">
            <button type="button" aria-expanded={archivedOpen} onClick={() => setShowArchived((v) => !v)} className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
              {archivedOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              <Archive className="size-3.5" />Archived ({archivedList.length})
            </button>
            {archivedOpen && (
              <ul className="mt-3 grid gap-3">
                {archivedList.map((p) => <ProjectCard key={p.project.id} p={p} onEdit={() => setEditing(p)} onDelete={() => setDeleting(p)} onArchive={() => setArchiving(p)} onRestore={() => void archive(p.project, false)} />)}
              </ul>
            )}
          </section>
        )}
      </div>

      {editing && <EditDialog key={editing.project.id} project={editing.project} onClose={() => setEditing(null)} />}
      {deleting && <DeleteDialog key={deleting.project.id} p={deleting} onClose={() => setDeleting(null)} />}
      {archiving && <ArchiveDialog key={archiving.project.id} p={archiving} onClose={() => setArchiving(null)} />}
    </div>
  );
}

function ProjectCard({ p, onEdit, onDelete, onArchive, onRestore }: { p: ProjectOverview; onEdit: () => void; onDelete: () => void; onArchive: () => void; onRestore: () => void }) {
  const { project, sprint } = p;
  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
  const daysLeft = sprint?.endDate ? differenceInCalendarDays(new Date(sprint.endDate), new Date()) : null;
  return (
    <li className={cn("rounded-xl border bg-card/50 p-4", project.archived && "opacity-75")}>
      <div className="flex items-start gap-3">
        <ProjectTile project={project} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2">
            <Link href={`/projects/${project.key}/board`} className="truncate font-medium hover:underline">{project.name}</Link>
            <span className="rounded bg-muted px-1.5 font-mono text-xs text-muted-foreground">{project.key}</span>
            {project.archived && <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 text-xs text-amber-300">Archived</span>}
          </div>
          <p className={cn("mt-0.5 text-sm", project.description ? "text-muted-foreground" : "text-muted-foreground/60")}>{project.description || "No description"}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!project.archived && <StarButton project={project} className="size-8" />}
          {project.archived && <Button variant="outline" size="sm" onClick={onRestore}><ArchiveRestore />Restore</Button>}
          <Button asChild variant="outline" size="sm" className="max-sm:hidden"><Link href={`/projects/${project.key}/board`}><Columns3 />Board</Link></Button>
          <Button asChild variant="outline" size="sm" className="max-sm:hidden"><Link href={`/projects/${project.key}/backlog`}><ListTodo />Backlog</Link></Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Actions for ${project.name}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem asChild className="sm:hidden"><Link href={`/projects/${project.key}/board`}><Columns3 />Open board</Link></DropdownMenuItem>
              <DropdownMenuItem asChild className="sm:hidden"><Link href={`/projects/${project.key}/backlog`}><ListTodo />Open backlog</Link></DropdownMenuItem>
              <DropdownMenuItem onSelect={onEdit}><Pencil />Edit project</DropdownMenuItem>
              {project.archived ? (
                <DropdownMenuItem onSelect={onRestore}><ArchiveRestore />Restore project</DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={onArchive}><Archive />Archive project</DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={onDelete}><Trash2 />Delete project</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground"><span>{p.done}/{p.total} tasks done</span><span>{pct}%</span></div>
          <Progress value={pct} className="h-1.5" />
          <p className="mt-2 text-xs text-muted-foreground">{p.inFlight} in flight · {p.backlog} in backlog · {p.points} pts</p>
        </div>
        <div className="space-y-1 text-xs text-muted-foreground">
          <p className="flex items-center gap-1.5">
            <CalendarDays className="size-3.5" />
            {sprint ? <><span className="text-foreground">{sprint.name}</span> active{daysLeft !== null && <span className={daysLeft < 0 ? "text-red-400" : undefined}> · {daysLeft < 0 ? `${-daysLeft}d overdue` : `${daysLeft}d left`}</span>}</> : <>No active sprint · <Link className="underline" href={`/projects/${project.key}/backlog`}>plan one</Link></>}
          </p>
          <p>{p.sprintCount} sprint{p.sprintCount === 1 ? "" : "s"} · {p.lastActivity ? `last activity ${formatDistanceToNow(new Date(p.lastActivity), { addSuffix: true })}` : "no activity yet"}</p>
        </div>
      </div>
    </li>
  );
}

function EditDialog({ project, onClose }: { project: ProjectDTO; onClose: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [color, setColor] = useState(project.color);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (json: unknown) => api<ProjectDTO>(`/api/projects/${project.key}`, { method: "PATCH", json }),
    onSuccess: () => {
      toast.success(`Saved ${project.key}`);
      qc.invalidateQueries({ queryKey: qk.board(project.key) });
      router.refresh();
      onClose();
    },
    onError: (e) => setError(e.message),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const parsed = updateProjectSchema.safeParse({ name, description, color });
            if (!parsed.success) return setError(parsed.error.issues[0].message);
            setError(null);
            save.mutate(parsed.data);
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit project</DialogTitle>
            <DialogDescription>The key <b className="font-mono">{project.key}</b> can&apos;t change: every task number (like {project.key}-12) is built from it.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5"><Label className="text-xs text-muted-foreground">Name</Label><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label className="text-xs text-muted-foreground">Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this project for?" /></div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Color</Label>
            <div className="flex flex-wrap gap-2">
              {PROJECT_COLORS.map((c) => (
                <button key={c} type="button" aria-label={c} aria-pressed={color === c} onClick={() => setColor(c)} className={cn("size-6 rounded-full ring-offset-2 ring-offset-background", color === c && "ring-2 ring-foreground")} style={{ background: c }} />
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={save.isPending || !name.trim()}>{save.isPending && <Loader2 className="animate-spin" />}Save changes</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Deleting is permanent and cascades to sprints and tasks, so it needs the project key typed to confirm. */
function DeleteDialog({ p, onClose }: { p: ProjectOverview; onClose: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [typed, setTyped] = useState("");
  const { project } = p;
  const del = useMutation({
    mutationFn: () => api(`/api/projects/${project.key}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.removeQueries({ queryKey: qk.board(project.key) });
      toast.success(`Deleted ${project.name}`);
      router.refresh();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {project.name}?</DialogTitle>
          <DialogDescription>
            This permanently deletes the project with its <b>{p.total} task{p.total === 1 ? "" : "s"}</b> and <b>{p.sprintCount} sprint{p.sprintCount === 1 ? "" : "s"}</b>. It can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">Type <span className="font-mono text-foreground">{project.key}</span> to confirm</Label>
          <Input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={project.key} className="font-mono" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" disabled={typed.trim().toUpperCase() !== project.key || del.isPending} onClick={() => del.mutate()}>
            {del.isPending && <Loader2 className="animate-spin" />}Delete project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Archiving hides the project from navigation without deleting anything, so a light confirmation is enough. */
function ArchiveDialog({ p, onClose }: { p: ProjectOverview; onClose: () => void }) {
  const archive = useArchiveProject();
  const [busy, setBusy] = useState(false);
  const { project } = p;
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Archive {project.name}?</DialogTitle>
          <DialogDescription>
            It disappears from the sidebar, dashboard, all-projects board, search and Recent. Its {p.total} task{p.total === 1 ? "" : "s"} and {p.sprintCount} sprint{p.sprintCount === 1 ? "" : "s"} are kept, and you can restore it any time from the Archived list below.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={busy} onClick={async () => { setBusy(true); const ok = await archive(project, true); setBusy(false); if (ok) onClose(); }}>
            {busy ? <Loader2 className="animate-spin" /> : <Archive />}Archive project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
