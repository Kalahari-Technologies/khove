import type { EntityKind, IntegrationProvider, Prisma } from "@prisma/client";
import { db } from "@backend/lib/db";

/**
 * A first-class container (repo/project/sprint/epic/release/component/person) — the
 * context graph that gives work items meaning. Provider-agnostic, so GitHub and Jira
 * (and future adapters) populate the same table. See design §10.
 */
export interface EntityInput {
  provider: IntegrationProvider;
  kind: EntityKind;
  externalId: string;
  key?: string | null;
  name: string;
  url?: string | null;
  status?: string | null;
  parentExternalId?: string | null;
  metadata?: Prisma.InputJsonValue;
}

/** Upsert a batch of entities (idempotent on [workspaceId, provider, externalId]). */
export async function recordEntities(workspaceId: string, entities: EntityInput[]): Promise<void> {
  for (const e of entities) {
    await db.entity
      .upsert({
        where: { workspaceId_provider_externalId: { workspaceId, provider: e.provider, externalId: e.externalId } },
        create: {
          workspaceId,
          provider: e.provider,
          kind: e.kind,
          externalId: e.externalId,
          key: e.key ?? null,
          name: e.name,
          url: e.url ?? null,
          status: e.status ?? null,
          parentExternalId: e.parentExternalId ?? null,
          metadata: e.metadata ?? {},
        },
        update: {
          name: e.name,
          key: e.key ?? null,
          url: e.url ?? null,
          status: e.status ?? null,
          parentExternalId: e.parentExternalId ?? null,
          ...(e.metadata !== undefined && { metadata: e.metadata }),
        },
      })
      .catch(() => {});
  }
}
