import type { AgentActionType } from "@prisma/client";

/**
 * A proposed action's buttons — the concrete verb for approving it (so the user
 * sees "Request a review", not a vague "Approve"), plus its polarity so the UI can
 * style go-ahead vs. caution vs. decline. This is the agent describing WHAT approving
 * actually does; it's returned alongside every proposal and rendered verbatim.
 */
export interface ActionButtons {
  /** The go-ahead button label — the real action that runs on approve. */
  approveLabel: string;
  /** "go" = constructive/positive; "caution" = valid but flags a problem. */
  approveTone: "go" | "caution";
  /** The decline button label. */
  rejectLabel: string;
}

const SPEC: Record<AgentActionType, ActionButtons> = {
  // Calendar / focus
  BLOCK_FOCUS_TIME: { approveLabel: "Block the time", approveTone: "go", rejectLabel: "Not now" },
  RESCHEDULE_EVENT: { approveLabel: "Reschedule it", approveTone: "go", rejectLabel: "Keep it" },
  RSVP_NUDGE: { approveLabel: "Send reminder", approveTone: "go", rejectLabel: "Skip" },
  CREATE_EVENT: { approveLabel: "Add to calendar", approveTone: "go", rejectLabel: "Not now" },
  SUGGEST_THREAD: { approveLabel: "Create the thread", approveTone: "go", rejectLabel: "Not now" },
  // GitHub PR Shepherd
  NUDGE_REVIEWER: { approveLabel: "Send the nudge", approveTone: "go", rejectLabel: "Skip" },
  REQUEST_REVIEW: { approveLabel: "Request a review", approveTone: "go", rejectLabel: "Not now" },
  FLAG_PR: { approveLabel: "Flag this PR", approveTone: "caution", rejectLabel: "Ignore" },
  // Delivery intelligence
  FLAG_RISK: { approveLabel: "Acknowledge risk", approveTone: "caution", rejectLabel: "Ignore" },
};

const FALLBACK: ActionButtons = { approveLabel: "Approve", approveTone: "go", rejectLabel: "Reject" };

/** The button spec for a proposal type (safe fallback for any unmapped type). */
export function actionButtons(type: AgentActionType): ActionButtons {
  return SPEC[type] ?? FALLBACK;
}
