import { redirect } from "next/navigation";

export default async function ProjectIndex({ params }: PageProps<"/projects/[projectKey]">) {
  const { projectKey } = await params;
  redirect(`/projects/${projectKey}/board`);
}
