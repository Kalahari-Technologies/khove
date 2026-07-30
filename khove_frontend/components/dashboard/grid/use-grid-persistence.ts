"use client";

import { useCallback, useEffect, useRef } from "react";
import type { WidgetConfig } from "@khove/shared";
import { trpc } from "@/lib/trpc/client";

/**
 * Debounced, optimistic persistence of a dashboard's widget layout. The caller
 * owns the in-memory `widgets` array (so drag/resize feel instant); this batches
 * the resulting writes to `dashboard.update` and invalidates the cached record.
 */
export function useGridPersistence(dashboardId: string) {
  const utils = trpc.useUtils();
  const mutation = trpc.dashboard.update.useMutation({
    onSuccess: () => {
      utils.dashboard.get.invalidate({ id: dashboardId });
      utils.dashboard.list.invalidate();
    },
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(
    (widgets: WidgetConfig[]) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        mutation.mutate({ id: dashboardId, widgets });
      }, 400);
    },
    // mutation identity is stable across renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dashboardId],
  );

  // Flush any pending save on unmount.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return { save, saving: mutation.isPending };
}
