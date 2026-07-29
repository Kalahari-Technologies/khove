import { serverTRPC } from "@/lib/trpc/server";
import { IntegrationSubnav } from "@/components/integrations/integration-subnav";

// Wraps the GitHub surface with real sub-navigation. Tabs appear once connected.
export default async function GithubLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  let connected = false;
  const base = await serverTRPC();
  const ws = await base.workspace.getBySlug.query({ slug }).catch(() => null);
  if (ws) {
    const trpc = await serverTRPC(ws.id);
    connected = !!(await trpc.integration.get.query({ provider: "GITHUB" }).catch(() => null));
  }

  const b = `/${slug}/github`;
  return (
    <div className="flex h-full flex-col">
      {connected && (
        <IntegrationSubnav
          tabs={[
            { label: "Dashboard", href: b },
            { label: "Pull requests", href: `${b}/prs` },
            { label: "Issues", href: `${b}/issues` },
          ]}
        />
      )}
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
