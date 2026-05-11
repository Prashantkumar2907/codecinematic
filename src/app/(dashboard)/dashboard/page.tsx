import { redirect } from "next/navigation";

import { DashboardWorkspace } from "@/components/dashboard/dashboard-workspace";
import { getSession } from "@/lib/auth";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return <DashboardWorkspace userName={session.name} planCode={session.plan} seedDemoProject={session.isAdmin} />;
}
