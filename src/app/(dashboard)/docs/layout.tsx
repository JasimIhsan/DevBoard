import { DocsNav } from "@/components/docs/docs-nav";
import { DOC_GROUPS } from "@/lib/docs";

export default function DocsLayout({ children }: LayoutProps<"/docs">) {
  return (
    <div className="flex h-full flex-col lg:flex-row">
      <DocsNav groups={DOC_GROUPS} />
      <div className="scroll-thin min-w-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
