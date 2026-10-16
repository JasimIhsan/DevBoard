import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { DocsMarkdown } from "@/components/docs/docs-markdown";
import { DOCS, getDoc } from "@/lib/docs";

export function generateStaticParams() {
  return DOCS.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: PageProps<"/docs/[slug]">): Promise<Metadata> {
  const doc = await getDoc((await params).slug);
  return doc ? { title: `${doc.title} · DevBoard Docs`, description: doc.description } : {};
}

export default async function DocPage({ params }: PageProps<"/docs/[slug]">) {
  const doc = await getDoc((await params).slug);
  if (!doc) notFound();
  const i = DOCS.findIndex((d) => d.slug === doc.slug);
  const prev = DOCS[i - 1];
  const next = DOCS[i + 1];
  return (
    <div className="mx-auto flex max-w-5xl gap-10 px-4 py-8 sm:px-8">
      <article className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{doc.group}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{doc.title}</h1>
        <p className="mt-2 text-muted-foreground">{doc.description}</p>
        <div className="mt-6"><DocsMarkdown>{doc.body}</DocsMarkdown></div>
        <nav aria-label="Pagination" className="mt-12 grid gap-3 border-t pt-6 sm:grid-cols-2">
          {prev ? (
            <Link href={`/docs/${prev.slug}`} className="rounded-lg border p-3 transition-colors hover:bg-accent">
              <span className="flex items-center gap-1 text-xs text-muted-foreground"><ArrowLeft className="size-3" />Previous</span>
              <span className="text-sm font-medium">{prev.title}</span>
            </Link>
          ) : <span />}
          {next && (
            <Link href={`/docs/${next.slug}`} className="rounded-lg border p-3 text-right transition-colors hover:bg-accent">
              <span className="flex items-center justify-end gap-1 text-xs text-muted-foreground">Next<ArrowRight className="size-3" /></span>
              <span className="text-sm font-medium">{next.title}</span>
            </Link>
          )}
        </nav>
      </article>
      {doc.headings.length > 1 && (
        <aside className="hidden w-48 shrink-0 xl:block">
          <div className="sticky top-8">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">On this page</p>
            <ul className="space-y-1.5 border-l text-sm">
              {doc.headings.map((h) => (
                <li key={h.id}><a href={`#${h.id}`} className={`block text-muted-foreground hover:text-foreground ${h.level === 3 ? "pl-6" : "pl-3"}`}>{h.text}</a></li>
              ))}
            </ul>
          </div>
        </aside>
      )}
    </div>
  );
}
