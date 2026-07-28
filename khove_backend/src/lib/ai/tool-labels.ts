/**
 * Friendly, past-tense labels for the AI's tool calls — shown in the chat's live
 * "process" trail (e.g. `checkAvailability` → "Checked availability"). Kept in the
 * backend (emitted in the stream) so no cross-package runtime import is needed.
 */
export const TOOL_LABELS: Record<string, string> = {
  // Tasks
  createTask: "Created a task",
  listTasks: "Checked your tasks",
  updateTask: "Updated a task",
  deleteTask: "Removed a task",
  // Calendar
  listUpcomingEvents: "Checked your calendar",
  createCalendarEvent: "Created an event",
  checkAvailability: "Checked availability",
  detectScheduleConflicts: "Looked for conflicts",
  findFocusTime: "Found focus time",
  suggestReschedule: "Worked out a reschedule",
  // GitHub
  listRepositories: "Listed repositories",
  listPullRequests: "Listed pull requests",
  getPullRequest: "Opened a pull request",
  listIssues: "Listed issues",
  createGitHubIssue: "Created an issue",
  getRepoActivity: "Checked repo activity",
  // Threads
  listThreads: "Listed threads",
  getThread: "Opened a thread",
  createThread: "Created a thread",
};

/** Label for a tool name, humanizing unknown names as a fallback. */
export function labelForTool(name: string): string {
  if (TOOL_LABELS[name]) return TOOL_LABELS[name];
  const words = name.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
