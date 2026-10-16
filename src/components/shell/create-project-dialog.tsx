"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/client";
import { PROJECT_COLORS } from "@/lib/constants";
import { createProjectSchema } from "@/lib/validators";
import { cn } from "@/lib/utils";
import type { ProjectDTO } from "@/lib/types";
import { useUi } from "@/components/ui-state";

export function CreateProjectDialog() {
  const { createProjectOpen, setCreateProjectOpen } = useUi();
  return (
    <Dialog open={createProjectOpen} onOpenChange={setCreateProjectOpen}>
      <DialogContent className="sm:max-w-md">{createProjectOpen && <Form onDone={() => setCreateProjectOpen(false)} />}</DialogContent>
    </Dialog>
  );
}

function Form({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (json: unknown) => api<ProjectDTO>("/api/projects", { method: "POST", json }),
    onSuccess: (p) => {
      toast.success(`Created project ${p.key}`);
      onDone();
      router.refresh();
      router.push(`/projects/${p.key}/backlog`);
    },
    onError: (e) => setError(e.message),
  });

  const onName = (v: string) => {
    setName(v);
    if (!keyTouched) setKey(v.replace(/[^a-zA-Z]/g, "").slice(0, 4).toUpperCase());
  };

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = createProjectSchema.safeParse({ name, key, description: description || undefined, color });
        if (!parsed.success) return setError(parsed.error.issues[0].message);
        setError(null);
        create.mutate(parsed.data);
      }}
    >
      <DialogHeader>
        <DialogTitle>New project</DialogTitle>
        <DialogDescription>The key prefixes task numbers, e.g. CORE-12.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-1.5"><Label className="text-xs text-muted-foreground">Name</Label><Input autoFocus value={name} onChange={(e) => onName(e.target.value)} placeholder="Payments Service" /></div>
      <div className="grid gap-1.5"><Label className="text-xs text-muted-foreground">Key</Label><Input value={key} onChange={(e) => { setKeyTouched(true); setKey(e.target.value.toUpperCase()); }} placeholder="PAY" maxLength={10} className="font-mono" /></div>
      <div className="grid gap-1.5"><Label className="text-xs text-muted-foreground">Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" /></div>
      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">Color</Label>
        <div className="flex gap-2">
          {PROJECT_COLORS.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)} aria-label={c} className={cn("size-6 rounded-full ring-offset-2 ring-offset-background", color === c && "ring-2 ring-foreground")} style={{ background: c }} />
          ))}
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={create.isPending || !name.trim() || !key}>Create project</Button>
      </DialogFooter>
    </form>
  );
}
