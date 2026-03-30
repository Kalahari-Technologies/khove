"use client";

import { createContext, useContext } from "react";
import type { WorkspaceRole } from "@prisma/client";

export interface WorkspaceContextValue {
  id: string;
  slug: string;
  name: string;
  isPersonal: boolean;
  role: WorkspaceRole;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
  workspace,
  children,
}: {
  workspace: WorkspaceContextValue;
  children: React.ReactNode;
}) {
  return (
    <WorkspaceContext.Provider value={workspace}>
      {children}
    </WorkspaceContext.Provider>
  );
}

/**
 * Access the current workspace from any client component.
 * Must be used within a WorkspaceProvider (i.e. under app/[workspace]/layout.tsx).
 */
export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return ctx;
}
