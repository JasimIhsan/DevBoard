import { ProjectsManager } from "@/components/projects/projects-manager";
import { getProjectsOverview } from "@/lib/data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Projects" };

export default async function ProjectsPage() {
  return <ProjectsManager projects={await getProjectsOverview()} />;
}
