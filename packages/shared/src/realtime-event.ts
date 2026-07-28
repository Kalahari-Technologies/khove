/**
 * Realtime event contract — shared by the backend emitter (socket.io) and the
 * frontend `use-realtime` client. The single source of truth for event shapes.
 */
export type RealtimeEvent =
  | { type: "task.created"; taskId: string }
  | { type: "task.updated"; taskId: string }
  | { type: "task.deleted"; taskId: string }
  | { type: "calendar.synced"; tasksCreated: number; tasksUpdated: number; entriesCreated: number }
  | { type: "calendar.disconnected" }
  | { type: "refresh" };
