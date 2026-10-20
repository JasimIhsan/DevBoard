"use client";

import { useState } from "react";
import { addDays, format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Due dates are stored as noon local time, so they land on the same calendar day in every timezone offset up to ±12h. */
export const dayToIso = (day: Date | string) => new Date(`${typeof day === "string" ? day : format(day, "yyyy-MM-dd")}T12:00:00`).toISOString();
export const isoToDay = (iso: string) => format(new Date(iso), "yyyy-MM-dd");
export const todayIso = () => dayToIso(new Date());

/**
 * Calendar popover with quick picks (Today, Tomorrow, Next week). `children` is the trigger's content,
 * so the same picker can sit behind an icon, a chip or a text link.
 */
export function DatePicker({ value, onChange, label, allowClear, clearLabel = "No date", children, className, align = "end" }: {
  value: string | null;
  onChange: (iso: string | null) => void;
  label: string;
  allowClear?: boolean;
  clearLabel?: string;
  children: React.ReactNode;
  className?: string;
  align?: "start" | "center" | "end";
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? new Date(value) : undefined;
  const pick = (day: Date | null) => { onChange(day ? dayToIso(day) : null); setOpen(false); };
  const now = new Date();
  const quick = [
    { label: "Today", day: now },
    { label: "Tomorrow", day: addDays(now, 1) },
    { label: "Next week", day: addDays(now, 7) },
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={label} className={cn("inline-flex items-center", className)}>{children}</button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-auto p-0">
        <div className="flex flex-wrap gap-1.5 border-b p-2">
          {quick.map((q) => (
            <Button key={q.label} type="button" size="xs" variant={selected && format(selected, "yyyy-MM-dd") === format(q.day, "yyyy-MM-dd") ? "default" : "outline"} onClick={() => pick(q.day)}>{q.label}</Button>
          ))}
          {allowClear && <Button type="button" size="xs" variant="ghost" className="ml-auto text-muted-foreground" onClick={() => pick(null)}>{clearLabel}</Button>}
        </div>
        <Calendar mode="single" selected={selected} defaultMonth={selected} onSelect={(d) => d && pick(d)} autoFocus />
      </PopoverContent>
    </Popover>
  );
}
