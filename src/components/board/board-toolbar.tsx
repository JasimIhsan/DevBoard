"use client";

import { useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { PRIORITIES, PRIORITY_META, TASK_TYPES, TYPE_META } from "@/lib/constants";
import type { TaskDTO } from "@/lib/types";

export interface Filters { q: string; priority: string; type: string; label: string }
export const emptyFilters: Filters = { q: "", priority: "all", type: "all", label: "all" };

export const applyFilters = (tasks: TaskDTO[], f: Filters) => {
  const q = f.q.trim().toLowerCase();
  return tasks.filter(
    (t) =>
      (!q || t.title.toLowerCase().includes(q) || t.key.toLowerCase().includes(q)) &&
      (f.priority === "all" || t.priority === f.priority) &&
      (f.type === "all" || t.type === f.type) &&
      (f.label === "all" || t.labels.includes(f.label)),
  );
};

export function BoardToolbar({ filters, onChange, labels }: { filters: Filters; onChange: (f: Filters) => void; labels: string[] }) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const dirty = JSON.stringify(filters) !== JSON.stringify(emptyFilters);
  const [showMore, setShowMore] = useState(false);
  const more = showMore ? "flex" : "hidden sm:flex";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-40 flex-1 sm:max-w-64">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={filters.q} onChange={(e) => set({ q: e.target.value })} placeholder="Filter tasks…" className="h-8 pl-8" />
      </div>
      <Button variant={showMore || dirty ? "secondary" : "outline"} size="icon-sm" className="sm:hidden" aria-label="Toggle filters" onClick={() => setShowMore((v) => !v)}><SlidersHorizontal /></Button>
      <Select value={filters.priority} onValueChange={(priority) => set({ priority })}>
        <SelectTrigger className={`w-40 max-sm:min-w-36 max-sm:flex-1 ${more}`}><SelectValue placeholder="Priority" /></SelectTrigger>
        <SelectContent><SelectItem value="all">Any priority</SelectItem>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{PRIORITY_META[p].label}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={filters.type} onValueChange={(type) => set({ type })}>
        <SelectTrigger className={`w-32 max-sm:min-w-36 max-sm:flex-1 ${more}`}><SelectValue placeholder="Type" /></SelectTrigger>
        <SelectContent><SelectItem value="all">Any type</SelectItem>{TASK_TYPES.map((t) => <SelectItem key={t} value={t}>{TYPE_META[t].label}</SelectItem>)}</SelectContent>
      </Select>
      {labels.length > 0 && (
        <Select value={filters.label} onValueChange={(label) => set({ label })}>
          <SelectTrigger className={`w-32 max-sm:min-w-36 max-sm:flex-1 ${more}`}><SelectValue placeholder="Label" /></SelectTrigger>
          <SelectContent><SelectItem value="all">Any label</SelectItem>{labels.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
        </Select>
      )}
      {dirty && <Button variant="ghost" onClick={() => onChange(emptyFilters)}><X />Clear</Button>}
    </div>
  );
}
