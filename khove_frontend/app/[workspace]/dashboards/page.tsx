import { redirect } from "next/navigation";
import { serverTRPC } from "@/lib/trpc/server";

export default async function DashboardsIndex({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  const base = await serverTRPC();
  const ws = await base.workspace.getBySlug.query({ slug }).catch(() => null);
  if (!ws) redirect("/login");

  const trpc = await serverTRPC(ws.id);
  const list = await trpc.dashboard.list.query().catch(() => []);

  // Prefer the default dashboard, else the first.
  const target = list.find((d) => d.isDefault) ?? list[0];
  if (target) redirect(`/${slug}/dashboards/${target.id}`);

  // No dashboards yet — seed a starter one for members, then land on it.
  const canWrite = ws.currentRole !== "VIEWER";
  if (canWrite) {
    const created = await trpc.dashboard.create.mutate({ name: "Home" }).catch(() => null);
    if (created) redirect(`/${slug}/dashboards/${created.id}`);
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <p className="text-[14px] text-white/50">No dashboards yet.</p>
      <p className="text-[12px] text-white/30">Ask a workspace member to create one.</p>
    </div>
  );
}
