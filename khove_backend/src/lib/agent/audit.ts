import type { Prisma } from "@prisma/client";
import { db } from "@backend/lib/db";

/**
 * Append an immutable audit record. Every agent action transition and every
 * explicit destructive op writes one (governance: read auto / write approval /
 * delete explicit — all audited). Best-effort: never throws into the caller.
 */
export async function writeAudit(input: {
  workspaceId: string;
  actorType: "USER" | "AGENT";
  actorId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorType: input.actorType,
        actorId: input.actorId,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        metadata: input.metadata ?? {},
      },
    });
  } catch (err) {
    console.error("[audit] failed to write", input.action, err);
  }
}
