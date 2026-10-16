import { notFound } from "next/navigation";
import { BacklogView } from "@/components/backlog/backlog-view";
import { getProjectBoard } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/projects/[projectKey]/backlog">) {
  return { title: `${(await params).projectKey.toUpperCase()} Backlog` };
}

export default async function BacklogPage({ params }: PageProps<"/projects/[projectKey]/backlog">) {
  const { projectKey } = await params;
  const data = await getProjectBoard(projectKey);
  if (!data) notFound();
  return <BacklogView projectKey={data.project.key} initialData={data} />;
}
