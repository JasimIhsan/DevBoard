"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** A code snippet with a copy button that is always visible (easy to hit on a phone). */
export function CopyBlock({ code, className }: { code: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 1500); },
      () => toast.error("Couldn't copy. Select the text and copy it manually."),
    );
  };
  return (
    <div className={cn("relative", className)}>
      <pre className="scroll-thin overflow-x-auto rounded-lg border bg-muted p-3 pr-12 font-mono text-xs leading-relaxed whitespace-pre">{code}</pre>
      <button type="button" onClick={copy} aria-label="Copy to clipboard" className="absolute top-2 right-2 grid size-8 place-items-center rounded-md border bg-background/80 text-muted-foreground hover:text-foreground">
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </button>
    </div>
  );
}
