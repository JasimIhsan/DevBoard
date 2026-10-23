"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, qk, useBoard } from "@/lib/client";
import { CATEGORY_META, PRIORITIES, PRIORITY_META, TASK_TYPES, TYPE_META } from "@/lib/constants";
import { createTaskSchema } from "@/lib/validators";
import type { Priority, ProjectDTO, TaskDTO, TaskType } from "@/lib/types";
import { useUi } from "@/components/ui-state";
import { useResolvedRecent } from "@/components/shell/recent-menu";

export function CreateTaskDialog({ projects }: { projects: ProjectDTO[] }) {
  const { createTask, closeCreateTask, openTask } = useUi();
  const open = createTask !== null;
  return (
    <Dialog open={open} onOpenChange={(v) => !v && closeCreateTask()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        {open && <Form key={JSON.stringify(createTask)} projects={projects} onDone={(t) => { closeCreateTask(); if (t) openTask(t.key); }} />}
      </DialogContent>
    </Dialog>
  );
}

function Form({ projects, onDone }: { projects: ProjectDTO[]; onDone: (t?: TaskDTO) => void }) {
  const { createTask: opts } = useUi();
  const qc = useQueryClient();
  // Which project to preselect: the one you're in (a project page or a column's "+"), otherwise the one you worked in last.
  const recent = useResolvedRecent(projects);
  const [projectKey, setProjectKey] = useState(() => (opts?.projectKey && projects.some((p) => p.key === opts.projectKey!.toUpperCase()) ? opts.projectKey.toUpperCase() : recent[0]?.project.key ?? projects[0]?.key ?? ""));
  const { data: board } = useBoard(projectKey);
  const columns = board?.columns ?? [];

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<TaskType>("FEATURE");
  const [priority, setPriority] = useState<Priority>("P2");
  const [whereChoice, setWhereChoice] = useState<string | undefined>(opts?.columnId === undefined ? undefined : opts.columnId ?? "backlog");
  const [estimate, setEstimate] = useState("");
  const [due, setDue] = useState("");
  const [labels, setLabels] = useState("");
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => titleRef.current?.focus(), []);

  // New tasks go to the backlog unless the caller (a column's "+") or the user picked a board column.
  const fromCategory = opts?.category ? columns.find((c) => c.category === opts.category)?.id : undefined;
  const where = whereChoice ?? fromCategory ?? "backlog";

  const create = useMutation({
    mutationFn: (json: unknown) => api<TaskDTO>("/api/tasks", { method: "POST", json }),
    onSuccess: (t) => {
      toast.success(`Created ${t.key}`);
      qc.invalidateQueries({ queryKey: qk.board(t.projectKey) });
      onDone(t);
    },
    onError: (e) => setError(e.message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      projectKey,
      title,
      description: description || undefined,
      type,
      priority,
      columnId: where === "backlog" ? null : where,
      estimate: estimate ? Number(estimate) : null,
      dueDate: due ? new Date(`${due}T12:00:00`).toISOString() : null,
      labels: labels.split(",").map((l) => l.trim().toLowerCase()).filter(Boolean),
    };
    const parsed = createTaskSchema.safeParse(payload);
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    setError(null);
    create.mutate(parsed.data);
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>New task</DialogTitle>
        <DialogDescription>A branch name is generated for you. Markdown is supported in the description.</DialogDescription>
      </DialogHeader>

      {projects.length > 1 && (
        <Field label="Project">
          <Select value={projectKey} onValueChange={(v) => { setProjectKey(v); setWhereChoice(undefined); }}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{projects.map((p) => <SelectItem key={p.key} value={p.key}>{p.key} · {p.name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
      )}

      <Field label="Title">
        <Input ref={titleRef} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs to be done?" maxLength={200} />
      </Field>
      <Field label="Description">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Context, acceptance criteria, links… (Markdown)" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <Select value={type} onValueChange={(v) => setType(v as TaskType)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{TASK_TYPES.map((t) => <SelectItem key={t} value={t}>{TYPE_META[t].label}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Priority">
          <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{PRIORITY_META[p].label}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Add to">
          <Select value={where} onValueChange={setWhereChoice}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="backlog">Backlog</SelectItem>
              {columns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} · {CATEGORY_META[c.category].label.toLowerCase()}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Estimate (points)">
          <Input type="number" min={0} max={100} inputMode="numeric" value={estimate} onChange={(e) => setEstimate(e.target.value)} placeholder="e.g. 3" />
        </Field>
        <Field label="Due date">
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
      </div>
      <Field label="Labels">
        <Input value={labels} onChange={(e) => setLabels(e.target.value)} placeholder="api, security (comma separated)" />
      </Field>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => onDone()}>Cancel</Button>
        <Button type="submit" disabled={create.isPending || !title.trim()}>
          {create.isPending && <Loader2 className="animate-spin" />} Create task
        </Button>
      </DialogFooter>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
