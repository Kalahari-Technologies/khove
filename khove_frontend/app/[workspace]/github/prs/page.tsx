import { redirect } from "next/navigation";
import { serverTRPC } from "@/lib/trpc/server";
import { ConnectNotice } from "@/components/integrations/connect-notice";
import { GithubItemsView } from "../github-items-view";

export default async function GithubPrsPage({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace: slug } = await params;
  const base = await serverTRPC();
  const ws = await base.workspace.getBySlug.query({ slug }).catch(() => null);
  if (!ws) redirect("/login");

  const trpc = await serverTRPC(ws.id);
  const connected = !!(await trpc.integration.get.query({ provider: "GITHUB" }).catch(() => null));
  if (!connected) return <ConnectNotice tool="GitHub" href={`/${slug}/github`} />;

  return <GithubItemsView kind="pr" />;
}
