import { AppShell } from "@/components/shell/app-shell";
import { SetupGate } from "@/components/setup/setup-gate";
import { getProjects } from "@/lib/data";
import { getSetupStatus } from "@/lib/setup";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  // No usable database yet (missing URL, unreachable, or migrations not applied): show the setup dialog instead of the app.
  const status = await getSetupStatus();
  if (status.db.state !== "ok") return <SetupGate status={status} />;

  const projects = await getProjects();
  return <AppShell projects={projects}>{children}</AppShell>;
}
