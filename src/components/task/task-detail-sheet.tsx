"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, GitBranch, History, Loader2, MessageSquare, Pencil, Plus, Trash2, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api, qk, useBoard, useTask, useTaskActions } from "@/lib/client";
import { ALL_STATUSES, PRIORITIES, PRIORITY_META, STATUS_META, TASK_TYPES, TYPE_META } from "@/lib/constants";
import type { Priority, TaskDetailDTO, TaskStatus, TaskType } from "@/lib/types";
import { useUi } from "@/components/ui-state";
import { recordRecent } from "@/lib/recent";
import { useConfirm } from "@/components/confirm-dialog";
import { Markdown } from "./markdown";
import { StatusDot, TypeIcon } from "./badges";

export function TaskDetailSheet() {
  const { openTaskKey, closeTask } = useUi();
  const { data: task, isLoading, error } = useTask(openTaskKey);
  return (
    <Sheet open={!!openTaskKey} onOpenChange={(v) => !v && closeTask()}>
      {/* The data-[side=right] selectors must match the sheet's own (w-3/4, sm:max-w-sm) or they lose on specificity. */}
      <SheetContent side="right" className="gap-0 overflow-y-auto p-0 scroll-thin data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
        <SheetTitle className="sr-only">{task?.title ?? "Task"}</SheetTitle>
        <SheetDescription className="sr-only">Task details</SheetDescription>
        {isLoading && <div className="space-y-4 p-6"><Skeleton className="h-6 w-40" /><Skeleton className="h-10 w-full" /><Skeleton className="h-40 w-full" /></div>}
        {error && <p className="p-6 text-sm text-destructive">{(error as Error).message}</p>}
        {task && <Detail key={task.id} task={task} onClose={closeTask} />}
      </SheetContent>
    </Sheet>
  );
}

function Detail({ task, onClose }: { task: TaskDetailDTO; onClose: () => void }) {
  const qc = useQueryClient();
  const { update, remove } = useTaskActions();
  const confirm = useConfirm();
  const { data: board } = useBoard(task.projectKey);
  const sprints = (board?.sprints ?? []).filter((s) => s.status !== "COMPLETED" || s.id === task.sprintId);

  useEffect(() => recordRecent({ id: `task:${task.key}`, kind: "task", projectKey: task.projectKey, taskKey: task.key, title: task.title, taskType: task.type }), [task.key, task.projectKey, task.title, task.type]);
  const [title, setTitle] = useState(task.title);
  const [editingDesc, setEditingDesc] = useState(false);
  const [desc, setDesc] = useState(task.description);
  const [branch, setBranch] = useState(task.branchName ?? "");
  const [pr, setPr] = useState(task.prUrl ?? "");
  const [labels, setLabels] = useState(task.labels.join(", "));
  const save = (patch: Parameters<typeof update.mutate>[0]["patch"]) => update.mutate({ task, patch });

  const copy = (text: string, what: string) => navigator.clipboard.writeText(text).then(() => toast.success(`Copied ${what}`));
  const refresh = () => {
    qc.invalidateQueries({ queryKey: qk.task(task.key) });
    qc.invalidateQueries({ queryKey: qk.board(task.projectKey) });
  };

  const subtaskMut = useMutation({
    mutationFn: (v: { method: "POST" | "PATCH" | "DELETE"; json?: unknown; id?: string }) =>
      api(`/api/tasks/${task.id}/subtasks${v.method === "DELETE" ? `?id=${v.id}` : ""}`, { method: v.method, json: v.json }),
    onMutate: async (v) => {
      if (v.method !== "PATCH") return;
      const patch = v.json as { id: string; done: boolean };
      qc.setQueryData<TaskDetailDTO>(qk.task(task.key), (t) => t && { ...t, subtasks: t.subtasks.map((s) => (s.id === patch.id ? { ...s, done: patch.done } : s)) });
    },
    onSuccess: (_d, v) => { if (v.method === "POST") toast.success("Subtask added"); else if (v.method === "DELETE") toast.success("Subtask removed"); },
    onSettled: refresh,
    onError: (e) => toast.error(e.message),
  });
  const [newSub, setNewSub] = useState("");

  const commentMut = useMutation({
    mutationFn: (v: { body?: string; deleteId?: string }) =>
      v.deleteId ? api(`/api/tasks/${task.id}/comments?id=${v.deleteId}`, { method: "DELETE" }) : api(`/api/tasks/${task.id}/comments`, { method: "POST", json: { body: v.body } }),
    onSuccess: (_d, v) => toast.success(v.deleteId ? "Comment deleted" : "Comment added"),
    onSettled: refresh,
    onError: (e) => toast.error(e.message),
  });
  const [comment, setComment] = useState("");

  const done = task.subtasks.filter((s) => s.done).length;
  const checkout = `git checkout -b ${task.branchName ?? ""}`;

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/95 px-4 py-3 pr-12 backdrop-blur">
        <TypeIcon type={task.type} />
        <button className="shrink-0 whitespace-nowrap font-mono text-xs text-muted-foreground hover:text-foreground" onClick={() => copy(task.key, task.key)} title="Copy key">{task.key}</button>
        <span className="ml-auto flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
          {update.isPending && <Loader2 className="size-3 animate-spin" />}
          Updated {formatDistanceToNow(new Date(task.updatedAt), { addSuffix: true })}
        </span>
        <Button size="icon-sm" variant="ghost" aria-label="Delete task" onClick={async () => {
            const ok = await confirm({
              title: `Delete ${task.key}?`,
              description: <>This permanently deletes <b>{task.title}</b> along with its subtasks, comments and history. It can&apos;t be undone.</>,
              confirmLabel: "Delete task",
              destructive: true,
            });
            if (ok) remove.mutate(task, { onSuccess: onClose });
          }}>
          <Trash2 className="text-destructive" />
        </Button>
      </header>

      <div className="grid gap-6 p-4 sm:p-6">
        <Textarea
          value={title}
          rows={1}
          onChange={(e) => setTitle(e.target.value.replace(/\n/g, " "))}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
          onBlur={() => title.trim() && title !== task.title && save({ title: title.trim() })}
          className="min-h-0 resize-none border-transparent bg-transparent px-1 py-1 text-xl leading-snug font-semibold shadow-none field-sizing-content focus-visible:border-input md:text-xl"
          aria-label="Title"
        />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Meta label="Status">
            <Select value={task.status} onValueChange={(v) => save({ status: v as TaskStatus })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{ALL_STATUSES.map((s) => <SelectItem key={s} value={s}><StatusDot status={s} />{STATUS_META[s].label}</SelectItem>)}</SelectContent>
            </Select>
          </Meta>
          <Meta label="Priority">
            <Select value={task.priority} onValueChange={(v) => save({ priority: v as Priority })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{PRIORITY_META[p].label}</SelectItem>)}</SelectContent>
            </Select>
          </Meta>
          <Meta label="Type">
            <Select value={task.type} onValueChange={(v) => save({ type: v as TaskType })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{TASK_TYPES.map((t) => <SelectItem key={t} value={t}>{TYPE_META[t].label}</SelectItem>)}</SelectContent>
            </Select>
          </Meta>
          <Meta label="Sprint">
            <Select value={task.sprintId ?? "none"} onValueChange={(v) => save({ sprintId: v === "none" ? null : v })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Backlog</SelectItem>
                {sprints.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Meta>
          <Meta label="Estimate (pts)">
            <Input type="number" min={0} max={100} defaultValue={task.estimate ?? ""} onBlur={(e) => { const v = e.target.value === "" ? null : Number(e.target.value); if (v !== task.estimate) save({ estimate: v }); }} />
          </Meta>
          <Meta label="Due date">
            <Input type="date" defaultValue={task.dueDate?.slice(0, 10) ?? ""} onChange={(e) => save({ dueDate: e.target.value ? new Date(`${e.target.value}T12:00:00`).toISOString() : null })} />
          </Meta>
        </div>

        <Section icon={<GitBranch className="size-4" />} title="Development">
          <div className="grid gap-2">
            <div className="flex gap-2">
              <Input value={branch} onChange={(e) => setBranch(e.target.value)} onBlur={() => branch !== (task.branchName ?? "") && save({ branchName: branch || null })} placeholder="feat/branch-name" className="font-mono text-xs" />
              <Button variant="outline" size="icon" aria-label="Copy checkout command" disabled={!task.branchName} onClick={() => copy(checkout, "git command")}><Copy /></Button>
            </div>
            {task.branchName && <code className="overflow-x-auto rounded bg-muted px-2 py-1.5 font-mono text-[11px] text-muted-foreground">{checkout}</code>}
            <div className="flex gap-2">
              <Input value={pr} onChange={(e) => setPr(e.target.value)} onBlur={() => pr !== (task.prUrl ?? "") && save({ prUrl: pr || null })} placeholder="https://github.com/org/repo/pull/123" className="text-xs" />
              {task.prUrl && <Button variant="outline" size="icon" aria-label="Open pull request" asChild><a href={task.prUrl} target="_blank" rel="noreferrer"><ExternalLink /></a></Button>}
            </div>
          </div>
        </Section>

        <Section
          icon={<Pencil className="size-4" />}
          title="Description"
          action={
            editingDesc ? (
              <Button size="xs" onClick={() => { if (desc !== task.description) save({ description: desc }); setEditingDesc(false); }}><Check />Save</Button>
            ) : (
              <Button size="xs" variant="ghost" onClick={() => { setDesc(task.description); setEditingDesc(true); }}>Edit</Button>
            )
          }
        >
          {editingDesc ? (
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={10} className="font-mono text-xs" autoFocus />
          ) : task.description ? (
            <Markdown>{task.description}</Markdown>
          ) : (
            <button className="text-sm text-muted-foreground hover:text-foreground" onClick={() => { setDesc(""); setEditingDesc(true); }}>Add a description…</button>
          )}
        </Section>

        <Section icon={<Check className="size-4" />} title={`Subtasks${task.subtasks.length ? ` · ${done}/${task.subtasks.length}` : ""}`}>
          {task.subtasks.length > 0 && <Progress value={(done / task.subtasks.length) * 100} className="mb-3 h-1.5" />}
          <ul className="grid gap-1">
            {task.subtasks.map((s) => (
              <li key={s.id} className="group flex items-center gap-2 rounded px-1 py-1 hover:bg-muted/50">
                <Checkbox checked={s.done} onCheckedChange={(v) => subtaskMut.mutate({ method: "PATCH", json: { id: s.id, done: v === true } })} />
                <span className={s.done ? "text-sm text-muted-foreground line-through" : "text-sm"}>{s.title}</span>
                <button className="ml-auto opacity-0 transition group-hover:opacity-100 max-lg:opacity-60" aria-label="Remove subtask" onClick={() => subtaskMut.mutate({ method: "DELETE", id: s.id })}><X className="size-3.5 text-muted-foreground" /></button>
              </li>
            ))}
          </ul>
          <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!newSub.trim()) return; subtaskMut.mutate({ method: "POST", json: { title: newSub } }); setNewSub(""); }}>
            <Input value={newSub} onChange={(e) => setNewSub(e.target.value)} placeholder="Add a subtask" className="h-8 text-sm" />
            <Button type="submit" size="icon-sm" variant="outline" aria-label="Add subtask"><Plus /></Button>
          </form>
        </Section>

        <Section icon={<span className="text-xs">#</span>} title="Labels">
          <Input value={labels} onChange={(e) => setLabels(e.target.value)} onBlur={() => { const next = labels.split(",").map((l) => l.trim().toLowerCase()).filter(Boolean); if (next.join() !== task.labels.join()) save({ labels: next }); }} placeholder="api, security" className="text-sm" />
        </Section>

        <Section icon={<MessageSquare className="size-4" />} title={`Comments${task.comments.length ? ` · ${task.comments.length}` : ""}`}>
          <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); if (!comment.trim()) return; commentMut.mutate({ body: comment }); setComment(""); }}>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Leave a note…" onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") e.currentTarget.form?.requestSubmit(); }} />
            <Button type="submit" size="sm" className="justify-self-end" disabled={!comment.trim() || commentMut.isPending}>Comment</Button>
          </form>
          <ul className="mt-3 grid gap-3">
            {task.comments.map((c) => (
              <li key={c.id} className="group rounded-lg border bg-card/50 p-3">
                <div className="mb-1 flex items-center text-[11px] text-muted-foreground">
                  {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                  <button className="ml-auto opacity-0 group-hover:opacity-100 max-lg:opacity-60" aria-label="Delete comment" onClick={() => commentMut.mutate({ deleteId: c.id })}><Trash2 className="size-3" /></button>
                </div>
                <Markdown>{c.body}</Markdown>
              </li>
            ))}
          </ul>
        </Section>

        <Section icon={<History className="size-4" />} title="Activity">
          <ol className="grid gap-2 border-l pl-4">
            {task.activities.map((a) => (
              <li key={a.id} className="relative text-xs text-muted-foreground">
                <span className="absolute -left-[1.3rem] top-1.5 size-1.5 rounded-full bg-border" />
                {a.detail} · {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
              </li>
            ))}
          </ol>
        </Section>
      </div>
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>{children}</div>;
}

function Section({ icon, title, action, children }: { icon: React.ReactNode; title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {icon}{title}<span className="ml-auto">{action}</span>
      </div>
      {children}
    </section>
  );
}
