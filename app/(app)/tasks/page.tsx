import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function TasksPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const tasks = await db.task.findMany({
    where: { userId: user.id },
    include: { status: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const statusColors: Record<string, string> = {
    NOT_STARTED: "text-text-tertiary",
    IN_PROGRESS: "text-brand-primary",
    IN_REVIEW: "text-accent-amber",
    BLOCKED: "text-accent-rose",
    DONE: "text-accent-emerald",
    CANCELLED: "text-text-disabled line-through",
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <h1 className="text-base font-semibold text-text-primary">Tasks</h1>
          <p className="text-xs text-text-tertiary mt-0.5">
            {tasks.length} task{tasks.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-10 h-10 rounded-xl bg-bg-elevated flex items-center justify-center mb-4">
              <span className="text-lg">✓</span>
            </div>
            <p className="text-sm font-medium text-text-primary mb-1">No tasks yet</p>
            <p className="text-xs text-text-tertiary">
              Tasks you create via chat will appear here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {tasks.map((task) => (
              <li
                key={task.id}
                className="flex items-start gap-3 px-6 py-3.5 hover:bg-bg-elevated transition-colors duration-fast"
              >
                {/* Status dot */}
                <div
                  className="mt-0.5 w-2 h-2 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: task.status?.color ?? "#71717A",
                  }}
                />

                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-medium ${
                      task.status?.category
                        ? (statusColors[task.status.category] ?? "text-text-primary")
                        : "text-text-primary"
                    }`}
                  >
                    {task.title}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    {task.status && (
                      <span className="text-[11px] text-text-tertiary">
                        {task.status.name}
                      </span>
                    )}
                    <span className="text-[11px] text-text-disabled capitalize">
                      {task.source.toLowerCase()}
                    </span>
                    {task.dueDate && (
                      <span className="text-[11px] text-text-disabled">
                        Due {new Date(task.dueDate).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>

                {/* Priority badge */}
                <span
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${
                    task.priority === "URGENT"
                      ? "bg-accent-rose/10 text-accent-rose"
                      : task.priority === "HIGH"
                      ? "bg-accent-amber/10 text-accent-amber"
                      : "bg-bg-overlay text-text-disabled"
                  }`}
                >
                  {task.priority}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
