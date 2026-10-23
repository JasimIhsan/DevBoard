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
import { CSV_COLUMNS, CSV_TEMPLATE, groupByColumn, parseTasksCsv } from "@/lib/csv";
import { PRIORITY_META } from "@/lib/constants";
import type { ColumnDTO } from "@/lib/types";
import { PriorityBadge, TypeIcon } from "@/components/task/badges";

interface ImportResult { created: number; keys: string[] }

export function ImportCsvDialog({ projectKey, columns, open, onOpenChange }: { projectKey: string; columns: ColumnDTO[]; open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        {open && <Body projectKey={projectKey} columns={columns} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function Body({ projectKey, columns, onDone }: { projectKey: string; columns: ColumnDTO[]; onDone: () => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const parsed = useMemo(() => (text.trim() ? parseTasksCsv(text) : null), [text]);
  const groups = useMemo(() => (parsed ? groupByColumn(parsed.rows) : []), [parsed]);
  const columnByName = useMemo(() => new Map(columns.map((c) => [c.name.toLowerCase(), c])), [columns]);
  const unknown = groups.filter((g) => g.column && !columnByName.has(g.column.toLowerCase())).map((g) => g.column);

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
      toast.success(`Imported ${r.created} task${r.created === 1 ? "" : "s"} into ${projectKey}`);
      qc.invalidateQueries({ queryKey: qk.board(projectKey) });
      onDone();
    },
    onError: (e) => toast.error(`Import failed: ${e.message}`),
  });

  const canImport = !!parsed && parsed.rows.length > 0 && parsed.errors.length === 0 && unknown.length === 0 && !importMut.isPending;

  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Import tasks from CSV</DialogTitle>
        <DialogDescription>
          Rows with a <span className="font-mono">column</span> name go straight onto that board column ({columns.map((c) => c.name).join(", ")}). Rows without one land in the backlog.
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
      {unknown.length > 0 && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
          Unknown column{unknown.length === 1 ? "" : "s"}: {unknown.join(", ")}. Use one of: {columns.map((c) => c.name).join(", ")}, or leave it empty for the backlog.
        </p>
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
            {groups.map(({ column, tasks }) => {
              const known = column ? columnByName.get(column.toLowerCase()) : undefined;
              return (
                <section key={column || "backlog"} className="rounded-lg border bg-muted/20">
                  <header className="flex items-center gap-2 px-3 py-1.5 text-sm">
                    <span className="font-semibold">{known?.name ?? (column || "Backlog")}</span>
                    {column && !known && <Badge variant="outline" className="border-destructive/40 text-destructive">Unknown column</Badge>}
                    <span className="ml-auto text-xs text-muted-foreground">{tasks.length}</span>
                  </header>
                  <ul className="divide-y border-t">
                    {tasks.map((t, i) => (
                      <li key={i} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                        <TypeIcon type={t.type ?? "FEATURE"} />
                        <span className="min-w-0 flex-1 truncate">{t.title}</span>
                        {t.estimate != null && <span className="rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground">{t.estimate}</span>}
                        <PriorityBadge priority={t.priority ?? "P2"} />
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">Priority defaults to {PRIORITY_META.P2.label}.</p>
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
