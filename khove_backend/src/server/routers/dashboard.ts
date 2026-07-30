import { randomUUID } from "crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { MAX_DASHBOARDS_PER_USER, clampWidget, type WidgetConfig } from "@khove/shared";
import { router, workspaceProcedure, workspaceWriteProcedure } from "@backend/server/trpc";
import { db } from "@backend/lib/db";
import { publishWorkspaceEvent } from "@backend/lib/realtime";

// User-built dashboards: an ordered grid of widgets, per-user AND per-workspace.
// Capped at MAX_DASHBOARDS_PER_USER, with ≤1 default per (workspace, user).

const widgetSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  w: z.number().int(),
  h: z.number().int(),
  settings: z.record(z.unknown()).default({}),
});

/** Normalize a widgets array: clamp spans into the grid range. */
function sanitizeWidgets(widgets: z.infer<typeof widgetSchema>[]): WidgetConfig[] {
  return widgets.map((wd) => {
    const { w, h } = clampWidget(wd.w, wd.h);
    return { id: wd.id, type: wd.type as WidgetConfig["type"], w, h, settings: wd.settings ?? {} };
  });
}

/** The seed layout for a user's first/blank dashboard — a cross-tool starter. */
function starterWidgets(): WidgetConfig[] {
  return [
    { id: randomUUID(), type: "kpi.row", w: 12, h: 2, settings: { provider: "all", windowDays: 28 } },
    { id: randomUUID(), type: "cross.activity", w: 6, h: 4, settings: {} },
    { id: randomUUID(), type: "cross.gaps", w: 6, h: 4, settings: {} },
    { id: randomUUID(), type: "calendar.agenda", w: 6, h: 3, settings: {} },
    { id: randomUUID(), type: "agent.proposals", w: 6, h: 3, settings: {} },
  ];
}

const listSelect = {
  id: true,
  name: true,
  icon: true,
  order: true,
  isDefault: true,
  widgets: true,
  updatedAt: true,
} satisfies Prisma.DashboardSelect;

export const dashboardRouter = router({
  /** All of the current user's dashboards in this workspace (with widget counts). */
  list: workspaceProcedure.query(async ({ ctx }) => {
    const rows = await db.dashboard.findMany({
      where: { workspaceId: ctx.workspace.id, userId: ctx.user!.id },
      orderBy: { order: "asc" },
      select: listSelect,
    });
    return rows.map((d) => ({
      id: d.id,
      name: d.name,
      icon: d.icon,
      order: d.order,
      isDefault: d.isDefault,
      widgetCount: Array.isArray(d.widgets) ? (d.widgets as unknown[]).length : 0,
      updatedAt: d.updatedAt,
    }));
  }),

  /** A single dashboard incl. its full widget layout. 404 if not owned by the user. */
  get: workspaceProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const d = await db.dashboard.findFirst({
      where: { id: input.id, workspaceId: ctx.workspace.id, userId: ctx.user!.id },
    });
    if (!d) throw new TRPCError({ code: "NOT_FOUND", message: "Dashboard not found" });
    return {
      id: d.id,
      name: d.name,
      icon: d.icon,
      order: d.order,
      isDefault: d.isDefault,
      widgets: (Array.isArray(d.widgets) ? d.widgets : []) as unknown as WidgetConfig[],
      updatedAt: d.updatedAt,
    };
  }),

  /** Create a dashboard (≤4 per user/workspace). The first one becomes the default. */
  create: workspaceWriteProcedure
    .input(z.object({ name: z.string().min(1).max(60), icon: z.string().max(40).optional() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db.dashboard.findMany({
        where: { workspaceId: ctx.workspace.id, userId: ctx.user!.id },
        select: { order: true },
        orderBy: { order: "desc" },
      });
      if (existing.length >= MAX_DASHBOARDS_PER_USER) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `You can have at most ${MAX_DASHBOARDS_PER_USER} dashboards.`,
        });
      }
      const isFirst = existing.length === 0;
      const created = await db.dashboard.create({
        data: {
          workspaceId: ctx.workspace.id,
          userId: ctx.user!.id,
          name: input.name,
          icon: input.icon ?? null,
          order: (existing[0]?.order ?? -1) + 1,
          isDefault: isFirst,
          widgets: (isFirst ? starterWidgets() : []) as unknown as Prisma.InputJsonValue,
        },
      });
      await publishWorkspaceEvent(ctx.workspace.id, {
        type: "dashboard.created",
        dashboardId: created.id,
        userId: ctx.user!.id,
      }).catch(() => {});
      return { id: created.id };
    }),

  /** Update a dashboard — rename, reorder-widgets, resize, or re-order in the list. */
  update: workspaceWriteProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(60).optional(),
        icon: z.string().max(40).nullable().optional(),
        widgets: z.array(widgetSchema).optional(),
        order: z.number().int().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const owned = await db.dashboard.findFirst({
        where: { id: input.id, workspaceId: ctx.workspace.id, userId: ctx.user!.id },
        select: { id: true },
      });
      if (!owned) throw new TRPCError({ code: "NOT_FOUND", message: "Dashboard not found" });

      const data: Prisma.DashboardUpdateInput = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.icon !== undefined) data.icon = input.icon;
      if (input.order !== undefined) data.order = input.order;
      if (input.widgets !== undefined) {
        data.widgets = sanitizeWidgets(input.widgets) as unknown as Prisma.InputJsonValue;
      }
      await db.dashboard.update({ where: { id: input.id }, data });
      await publishWorkspaceEvent(ctx.workspace.id, {
        type: "dashboard.updated",
        dashboardId: input.id,
        userId: ctx.user!.id,
      }).catch(() => {});
      return { ok: true };
    }),

  /** Make one dashboard the landing default (clears the flag on the others). */
  setDefault: workspaceWriteProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const owned = await db.dashboard.findFirst({
      where: { id: input.id, workspaceId: ctx.workspace.id, userId: ctx.user!.id },
      select: { id: true },
    });
    if (!owned) throw new TRPCError({ code: "NOT_FOUND", message: "Dashboard not found" });
    await db.$transaction([
      db.dashboard.updateMany({
        where: { workspaceId: ctx.workspace.id, userId: ctx.user!.id, isDefault: true },
        data: { isDefault: false },
      }),
      db.dashboard.update({ where: { id: input.id }, data: { isDefault: true } }),
    ]);
    await publishWorkspaceEvent(ctx.workspace.id, {
      type: "dashboard.updated",
      dashboardId: input.id,
      userId: ctx.user!.id,
    }).catch(() => {});
    return { ok: true };
  }),

  /** Duplicate a dashboard (≤4), regenerating widget instance ids. */
  duplicate: workspaceWriteProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const src = await db.dashboard.findFirst({
      where: { id: input.id, workspaceId: ctx.workspace.id, userId: ctx.user!.id },
    });
    if (!src) throw new TRPCError({ code: "NOT_FOUND", message: "Dashboard not found" });
    const count = await db.dashboard.count({ where: { workspaceId: ctx.workspace.id, userId: ctx.user!.id } });
    if (count >= MAX_DASHBOARDS_PER_USER) {
      throw new TRPCError({ code: "FORBIDDEN", message: `You can have at most ${MAX_DASHBOARDS_PER_USER} dashboards.` });
    }
    const maxOrder = await db.dashboard.aggregate({
      where: { workspaceId: ctx.workspace.id, userId: ctx.user!.id },
      _max: { order: true },
    });
    const srcWidgets = (Array.isArray(src.widgets) ? src.widgets : []) as unknown as WidgetConfig[];
    const cloned = srcWidgets.map((w) => ({ ...w, id: randomUUID() }));
    const created = await db.dashboard.create({
      data: {
        workspaceId: ctx.workspace.id,
        userId: ctx.user!.id,
        name: `${src.name} (copy)`,
        icon: src.icon,
        order: (maxOrder._max.order ?? -1) + 1,
        isDefault: false,
        widgets: cloned as unknown as Prisma.InputJsonValue,
      },
    });
    await publishWorkspaceEvent(ctx.workspace.id, {
      type: "dashboard.created",
      dashboardId: created.id,
      userId: ctx.user!.id,
    }).catch(() => {});
    return { id: created.id };
  }),

  /** Delete a dashboard; if it was the default, promote the lowest-order remaining. */
  delete: workspaceWriteProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const target = await db.dashboard.findFirst({
      where: { id: input.id, workspaceId: ctx.workspace.id, userId: ctx.user!.id },
      select: { id: true, isDefault: true },
    });
    if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Dashboard not found" });
    await db.dashboard.delete({ where: { id: input.id } });
    if (target.isDefault) {
      const next = await db.dashboard.findFirst({
        where: { workspaceId: ctx.workspace.id, userId: ctx.user!.id },
        orderBy: { order: "asc" },
        select: { id: true },
      });
      if (next) await db.dashboard.update({ where: { id: next.id }, data: { isDefault: true } });
    }
    await publishWorkspaceEvent(ctx.workspace.id, {
      type: "dashboard.deleted",
      dashboardId: input.id,
      userId: ctx.user!.id,
    }).catch(() => {});
    return { ok: true };
  }),
});
