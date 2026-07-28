import { db } from "@backend/lib/db";
import { publishWorkspaceEvent } from "@backend/lib/realtime";
import { sendEmail, renderTemplate } from "@backend/lib/email";
import { env } from "@backend/env";

/**
 * Notification channels for proactive agent output. In-app is always on (realtime
 * refresh → the sidebar/planner feed re-renders). Email delivers a batched digest.
 * Slack is a documented stub — the interface is here so it can be added later
 * without touching callers.
 */
export interface DigestItem {
  title: string;
  detail: string;
}

export interface NotificationChannel {
  readonly name: string;
  notifyNewActions(workspaceId: string, items: DigestItem[]): Promise<void>;
}

/** In-app: nudge every workspace member's open client to refresh its feed. */
const inAppChannel: NotificationChannel = {
  name: "in-app",
  async notifyNewActions(workspaceId) {
    await publishWorkspaceEvent(workspaceId, { type: "refresh" }).catch(() => {});
  },
};

/** Email: a batched digest of newly-proposed actions to the workspace owner. */
const emailChannel: NotificationChannel = {
  name: "email",
  async notifyNewActions(workspaceId, items) {
    if (items.length === 0) return;
    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: { slug: true, name: true, owner: { select: { email: true, name: true } } },
    });
    if (!workspace?.owner?.email) return;

    const firstName = workspace.owner.name?.split(" ")[0] || workspace.owner.email.split("@")[0];
    const rows = items
      .map(
        (i) =>
          `<tr><td style="padding:8px 0;font-size:13px;color:#FAFAFA;font-weight:500;">${i.title}</td></tr>` +
          `<tr><td style="padding:0 0 12px 0;font-size:12px;color:#888;">${i.detail}</td></tr>`,
      )
      .join("");

    const html = renderTemplate("agent-digest", {
      first_name: firstName,
      workspace_name: workspace.name,
      action_count: String(items.length),
      action_rows: rows,
      review_url: `${env.FRONTEND_ORIGIN}/${workspace.slug}/agent`,
      current_year: new Date().getFullYear().toString(),
    });

    await sendEmail({
      to: workspace.owner.email,
      subject: `${items.length} suggestion${items.length === 1 ? "" : "s"} from Khove`,
      html,
    }).catch(() => {});
  },
};

// Slack: designed-for-later. Implementing this interface + registering it in
// CHANNELS is all it takes; no caller changes.
// const slackChannel: NotificationChannel = { name: "slack", async notifyNewActions() {} };

const CHANNELS: NotificationChannel[] = [inAppChannel, emailChannel];

/** Fan a new-actions notification out across all enabled channels. */
export async function notifyNewActions(workspaceId: string, items: DigestItem[]): Promise<void> {
  await Promise.all(CHANNELS.map((c) => c.notifyNewActions(workspaceId, items).catch(() => {})));
}
