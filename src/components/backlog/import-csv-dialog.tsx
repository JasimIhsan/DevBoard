"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ClipboardCopy, Download, FileUp, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { api, qk } from "@/lib/client";
import { CSV_COLUMNS, CSV_TEMPLATE, groupBySprint, parseTasksCsv } from "@/lib/csv";
import { PRIORITY_META, SPRINT_STATUS_META, STATUS_META } from "@/lib/constants";
import type { SprintDTO } from "@/lib/types";
import { PriorityBadge, TypeIcon } from "@/components/task/badges";

interface ImportResult { created: number; keys: string[]; sprintsCreated: string[] }

export function ImportCsvDialog({ projectKey, sprints, open, onOpenChange }: { projectKey: string; sprints: SprintDTO[]; open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        {open && <Body projectKey={projectKey} sprints={sprints} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function Body({ projectKey, sprints, onDone }: { projectKey: string; sprints: SprintDTO[]; onDone: () => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const parsed = useMemo(() => (text.trim() ? parseTasksCsv(text) : null), [text]);
  const groups = useMemo(() => (parsed ? groupBySprint(parsed.rows) : []), [parsed]);
  const sprintByName = useMemo(() => new Map(sprints.map((s) => [s.name.toLowerCase(), s])), [sprints]);

  const readFile = (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    file.text().then(setText).catch(() => toast.error(`Couldn't read ${file.name}`));
  };

  const copyTemplate = () =>
    navigator.clipboard.writeText(CSV_TEMPLATE).then(() => {
      setCopied(true);
      toast.success("Copied CSV template");
      setTimeout(() => setCopied(false), 1500);
    }, () => toast.error("Clipboard unavailable — download the template instead"));

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([CSV_TEMPLATE], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "tasks-template.csv" });
    a.click();
    URL.revokeObjectURL(url);
  };

  const importMut = useMutation({
    mutationFn: () => api<ImportResult>("/api/tasks/import", { method: "POST", json: { projectKey, tasks: parsed?.rows ?? [] } }),
    onSuccess: (r) => {
      const sprintNote = r.sprintsCreated.length ? ` and created ${r.sprintsCreated.length} sprint${r.sprintsCreated.length === 1 ? "" : "s"} (${r.sprintsCreated.join(", ")})` : "";
      toast.success(`Imported ${r.created} task${r.created === 1 ? "" : "s"} into ${projectKey}${sprintNote}`);
      qc.invalidateQueries({ queryKey: qk.board(projectKey) });
      onDone();
    },
    onError: (e) => toast.error(`Import failed: ${e.message}`),
  });

  const canImport = !!parsed && parsed.rows.length > 0 && parsed.errors.length === 0 && !importMut.isPending;

  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Import tasks from CSV</DialogTitle>
        <DialogDescription>
          Rows with a <span className="font-mono">sprint</span> name go into that sprint (new names become draft sprints). Rows without one land in the backlog.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={copyTemplate}>{copied ? <Check /> : <ClipboardCopy />}Copy CSV template</Button>
        <Button size="sm" variant="ghost" onClick={downloadTemplate}><Download />Download</Button>
        <span className="ml-auto text-xs text-muted-foreground">Columns: {CSV_COLUMNS.join(", ")}</span>
      </div>

      <div
        className="grid gap-2 rounded-lg border border-dashed p-3"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); readFile(e.dataTransfer.files[0]); }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={(e) => { readFile(e.target.files?.[0]); e.target.value = ""; }} />
          <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}><FileUp />Choose CSV file</Button>
          <span className="text-xs text-muted-foreground">{fileName ?? "or drop a file here, or paste below"}</span>
        </div>
        <Textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setFileName(null); }}
          rows={6}
          placeholder={CSV_TEMPLATE.split("\n").slice(0, 2).join("\n")}
          className="font-mono text-xs"
          aria-label="CSV contents"
        />
      </div>

      {parsed && parsed.unknownColumns.length > 0 && (
        <p className="text-xs text-muted-foreground">Ignored columns: {parsed.unknownColumns.join(", ")}</p>
      )}
      {parsed && parsed.errors.length > 0 && (
        <ul className="max-h-32 overflow-y-auto rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
          {parsed.errors.slice(0, 20).map((e) => <li key={e}>{e}</li>)}
          {parsed.errors.length > 20 && <li>…and {parsed.errors.length - 20} more</li>}
        </ul>
      )}

      {groups.length > 0 && (
        <div className="grid gap-2">
          <p className="text-xs font-medium text-muted-foreground">Preview · {parsed!.rows.length} task{parsed!.rows.length === 1 ? "" : "s"}</p>
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {groups.map(({ sprint, tasks }) => {
              const existing = sprint ? sprintByName.get(sprint.toLowerCase()) : undefined;
              return (
                <section key={sprint || "backlog"} className="rounded-lg border bg-muted/20">
                  <header className="flex items-center gap-2 px-3 py-1.5 text-sm">
                    <span className="font-semibold">{sprint || "Backlog"}</span>
                    {sprint && (existing
                      ? <Badge variant="outline" className={SPRINT_STATUS_META[existing.status].className}>{SPRINT_STATUS_META[existing.status].label}</Badge>
                      : <Badge variant="outline">New draft sprint</Badge>)}
                    <span className="ml-auto text-xs text-muted-foreground">{tasks.length}</span>
                  </header>
                  <ul className="divide-y border-t">
                    {tasks.map((t, i) => (
                      <li key={i} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                        <TypeIcon type={t.type ?? "FEATURE"} />
                        <span className="min-w-0 flex-1 truncate">{t.title}</span>
                        {existing?.status === "ACTIVE" && t.status && t.status !== "BACKLOG" && <span className="text-xs text-muted-foreground">{STATUS_META[t.status].short}</span>}
                        {t.estimate != null && <span className="rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground">{t.estimate}</span>}
                        <PriorityBadge priority={t.priority ?? "P2"} />
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">Priority defaults to {PRIORITY_META.P2.label}. Status only applies inside an active sprint; everything else starts as Backlog.</p>
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button disabled={!canImport} onClick={() => importMut.mutate()}>
          {importMut.isPending && <Loader2 className="animate-spin" />}
          Import {parsed?.rows.length ? `${parsed.rows.length} task${parsed.rows.length === 1 ? "" : "s"}` : "tasks"}
        </Button>
      </DialogFooter>
    </div>
  );
}
