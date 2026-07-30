import { redirect } from "next/navigation";
import type { WidgetConfig } from "@khove/shared";
import { serverTRPC } from "@/lib/trpc/server";
import { DashboardClient } from "../dashboard-client";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ workspace: string; id: string }>;
}) {
  const { workspace: slug, id } = await params;
  const base = await serverTRPC();
  const ws = await base.workspace.getBySlug.query({ slug }).catch(() => null);
  if (!ws) redirect("/login");

  const trpc = await serverTRPC(ws.id);
  const [dashboard, list] = await Promise.all([
    trpc.dashboard.get.query({ id }).catch(() => null),
    trpc.dashboard.list.query().catch(() => []),
  ]);
  if (!dashboard) redirect(`/${slug}/dashboards`);

  const canWrite = ws.currentRole !== "VIEWER";

  return (
    <DashboardClient
      workspaceId={ws.id}
      slug={slug}
      canWrite={canWrite}
      dashboard={{
        id: dashboard.id,
        name: dashboard.name,
        icon: dashboard.icon,
        isDefault: dashboard.isDefault,
        widgets: dashboard.widgets as WidgetConfig[],
      }}
      dashboards={list.map((d) => ({ id: d.id, name: d.name, isDefault: d.isDefault, widgetCount: d.widgetCount }))}
    />
  );
}
