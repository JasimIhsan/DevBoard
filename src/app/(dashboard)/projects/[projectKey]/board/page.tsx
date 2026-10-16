import { notFound } from "next/navigation";
import { KanbanBoard } from "@/components/board/kanban-board";
import { getProjectBoard } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/projects/[projectKey]/board">) {
  return { title: `${(await params).projectKey.toUpperCase()} Board` };
}

export default async function BoardPage({ params }: PageProps<"/projects/[projectKey]/board">) {
  const { projectKey } = await params;
  const data = await getProjectBoard(projectKey);
  if (!data) notFound();
  return <KanbanBoard projectKey={data.project.key} initialData={data} />;
}
