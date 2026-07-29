import { serverTRPC } from "@/lib/trpc/server";
import { IntegrationSubnav } from "@/components/integrations/integration-subnav";

// Wraps the Jira surface with real sub-navigation. The tabs only appear once Jira
// is connected (before that, the dashboard shows the connect prompt full-bleed).
export default async function JiraLayout({
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
    connected = !!(await trpc.integration.get.query({ provider: "JIRA" }).catch(() => null));
  }

  const b = `/${slug}/jira`;
  return (
    <div className="flex h-full flex-col">
      {connected && (
        <IntegrationSubnav
          tabs={[
            { label: "Dashboard", href: b },
            { label: "Board", href: `${b}/board` },
            { label: "List", href: `${b}/list` },
          ]}
        />
      )}
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
