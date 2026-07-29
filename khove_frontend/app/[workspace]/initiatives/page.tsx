import { redirect } from "next/navigation";
import { serverTRPC } from "@/lib/trpc/server";
import { InitiativesClient } from "./initiatives-client";

export default async function InitiativesPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  const base = await serverTRPC();
  const ws = await base.workspace.getBySlug.query({ slug }).catch(() => null);
  if (!ws) redirect("/login");

  const trpc = await serverTRPC(ws.id);
  const threads = await trpc.thread.list.query({});

  return (
    <InitiativesClient
      workspaceId={ws.id}
      threads={threads.map((t) => ({
        id: t.id,
        title: t.title,
        summary: t.summary,
        targetDate: t.targetDate ? t.targetDate.toISOString() : null,
        startedAt: t.startedAt ? t.startedAt.toISOString() : null,
        health: t.health,
        links: t.links.map((l) => ({
          kind: l.kind,
          title: l.title,
          refUrl: l.refUrl,
          refId: l.refId,
          createdAt: l.createdAt.toISOString(),
        })),
      }))}
    />
  );
}
