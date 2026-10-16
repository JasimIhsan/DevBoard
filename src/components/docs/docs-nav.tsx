"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import type { DocNavGroup } from "@/lib/docs-shared";
import { cn } from "@/lib/utils";

type Groups = DocNavGroup[];

function Links({ groups, current }: { groups: Groups; current?: string }) {
  return (
    <>
      {groups.map(({ group, items }) => (
        <div key={group} className="mb-5">
          <div className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{group}</div>
          {items.map((d) => (
            <Link key={d.slug} href={`/docs/${d.slug}`} aria-current={current === d.slug ? "page" : undefined}
              className={cn("block rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent", current === d.slug ? "bg-accent font-medium text-foreground" : "text-muted-foreground")}>
              {d.title}
            </Link>
          ))}
        </div>
      ))}
    </>
  );
}

export function DocsNav({ groups }: { groups: Groups }) {
  const current = /^\/docs\/([^/]+)/.exec(usePathname())?.[1];
  const title = groups.flatMap((g) => g.items).find((d) => d.slug === current)?.title ?? "Documentation";
  return (
    <>
      <aside className="scroll-thin hidden w-60 shrink-0 overflow-y-auto border-r p-3 lg:block" aria-label="Documentation">
        <Links groups={groups} current={current} />
      </aside>
      <details key={current} className="group/mnav border-b lg:hidden">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm font-medium">
          Docs · {title}<ChevronDown className="ml-auto size-4 transition-transform group-open/mnav:rotate-180" />
        </summary>
        <div className="max-h-[60vh] overflow-y-auto px-3 pt-1"><Links groups={groups} current={current} /></div>
      </details>
    </>
  );
}
