"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSprintActions } from "@/lib/client";
import type { SprintDTO, TaskDTO } from "@/lib/types";

const toIso = (d: string) => (d ? new Date(`${d}T12:00:00`).toISOString() : null);

export function CreateSprintDialog({ projectKey, open, onOpenChange, suggestedName }: { projectKey: string; open: boolean; onOpenChange: (v: boolean) => void; suggestedName: string }) {
  const { create } = useSprintActions(projectKey);
  const [name, setName] = useState(suggestedName);
  const [goal, setGoal] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate({ name, goal: goal || undefined }, { onSuccess: () => { onOpenChange(false); setGoal(""); } });
          }}
        >
          <DialogHeader><DialogTitle>New sprint</DialogTitle><DialogDescription>Created as a draft — start it when you&apos;re ready.</DialogDescription></DialogHeader>
          <div className="grid gap-1.5"><Label className="text-xs text-muted-foreground">Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
          <div className="grid gap-1.5"><Label className="text-xs text-muted-foreground">Goal</Label><Input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="What should this sprint achieve?" /></div>
          <DialogFooter><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={!name.trim() || create.isPending}>Create sprint</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function StartSprintDialog({ projectKey, sprint, taskCount, open, onOpenChange }: { projectKey: string; sprint: SprintDTO; taskCount: number; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { act } = useSprintActions(projectKey);
  const [start, setStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [end, setEnd] = useState(() => new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Start {sprint.name}</DialogTitle><DialogDescription>{taskCount} task{taskCount === 1 ? "" : "s"} will appear on the board.</DialogDescription></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5"><Label className="text-xs text-muted-foreground">Start</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label className="text-xs text-muted-foreground">End</Label><Input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={act.isPending || !start || !end} onClick={() => act.mutate({ sprintId: sprint.id, action: "start", startDate: toIso(start), endDate: toIso(end) }, { onSuccess: () => { onOpenChange(false); toast.success(`${sprint.name} started`); } })}>
            {act.isPending && <Loader2 className="animate-spin" />}Start sprint
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CompleteSprintDialog({ projectKey, sprint, tasks, otherSprints, open, onOpenChange }: { projectKey: string; sprint: SprintDTO; tasks: TaskDTO[]; otherSprints: SprintDTO[]; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { act } = useSprintActions(projectKey);
  const [target, setTarget] = useState("backlog");
  const done = tasks.filter((t) => t.status === "DONE").length;
  const open_ = tasks.length - done;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Complete {sprint.name}</DialogTitle>
          <DialogDescription>{done} completed · {open_} unfinished</DialogDescription>
        </DialogHeader>
        {open_ > 0 && (
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Move unfinished tasks to</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="backlog">Backlog</SelectItem>
                {otherSprints.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={act.isPending} onClick={() => act.mutate({ sprintId: sprint.id, action: "complete", moveUnfinishedTo: target === "backlog" ? null : target }, { onSuccess: () => { onOpenChange(false); toast.success(`${sprint.name} completed`); } })}>
            {act.isPending && <Loader2 className="animate-spin" />}Complete sprint
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
