"use client";

import { Children, isValidElement, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";
import { AlertTriangle, Check, Copy, Info, Lightbulb } from "lucide-react";
import { slugify } from "@/lib/docs-shared";
import { cn } from "@/lib/utils";

const text = (node: ReactNode): string =>
  Children.toArray(node).map((c) => (typeof c === "string" || typeof c === "number" ? String(c) : isValidElement(c) ? text((c.props as { children?: ReactNode }).children) : "")).join("");

function CodeBlock({ children }: { children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text(children).replace(/\n$/, "")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }, () => {});
  };
  return (
    <div className="group/code relative">
      <pre>{children}</pre>
      <button type="button" onClick={copy} aria-label="Copy code" className="absolute top-2 right-2 grid size-7 place-items-center rounded-md border bg-background/80 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/code:opacity-100 max-lg:opacity-100">
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}

const CALLOUTS = {
  tip: { icon: Lightbulb, cls: "border-emerald-500/40 bg-emerald-500/5" },
  note: { icon: Info, cls: "border-sky-500/40 bg-sky-500/5" },
  warning: { icon: AlertTriangle, cls: "border-amber-500/50 bg-amber-500/5" },
} as const;

function Blockquote({ children }: { children: ReactNode }) {
  // `> **Tip** …` / `> **Note** …` / `> **Warning** …` render as callouts; anything else is a plain quote.
  const label = text(children).trim().split(/[\s:.]/)[0].toLowerCase() as keyof typeof CALLOUTS;
  const c = CALLOUTS[label];
  if (!c) return <blockquote>{children}</blockquote>;
  const Icon = c.icon;
  return (
    <div role="note" className={cn("not-prose flex gap-3 rounded-lg border p-3 text-sm [&_p]:m-0 [&_p+p]:mt-2", c.cls)}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

const heading = (Tag: "h2" | "h3") =>
  function Heading({ children }: { children?: ReactNode }) {
    const id = slugify(text(children));
    return <Tag id={id}><a href={`#${id}`} className="no-underline hover:underline">{children}</a></Tag>;
  };

export function DocsMarkdown({ children }: { children: string }) {
  return (
    <div className="docs-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h2: heading("h2"),
          h3: heading("h3"),
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          blockquote: ({ children }) => <Blockquote>{children}</Blockquote>,
          table: ({ children }) => <div className="table-wrap"><table>{children}</table></div>,
          a: ({ href = "", children }) => (href.startsWith("/") ? <Link href={href}>{children}</Link> : <a href={href} target="_blank" rel="noreferrer">{children}</a>),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
