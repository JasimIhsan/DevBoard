import { AppShell } from "@/components/shell/app-shell";
import { getProjects } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const projects = await getProjects();
  return <AppShell projects={projects}>{children}</AppShell>;
}
