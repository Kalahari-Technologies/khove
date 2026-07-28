import { Router } from "express";
import { requireUser } from "@backend/lib/auth";
import { streamAIConversation } from "@backend/lib/ai";
import { requireWorkspaceMembership } from "@backend/lib/workspace/resolve";

const router = Router();

// POST /api/chat — AI conversation, streamed as newline-delimited JSON (NDJSON).
// Each line is a ChatStreamEvent: meta | step | text | reasoning | blocked |
// error | done. Streamed via fetch reader on the client (EventSource can't send
// the Clerk bearer header).
router.post("/", async (req, res) => {
  try {
    const user = await requireUser(req);
    const { message, conversationId, workspaceId } = (req.body ?? {}) as {
      message?: string;
      conversationId?: string;
      workspaceId?: string;
    };

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return res.status(400).json({ error: "Message is required" });
    }
    if (message.length > 4000) {
      return res.status(400).json({ error: "Message too long (max 4000 characters)" });
    }
    if (!workspaceId) {
      return res.status(400).json({ error: "workspaceId is required" });
    }

    await requireWorkspaceMembership(workspaceId, user.id);

    res.status(200);
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    // Fire-and-forget line writer — a client disconnect must not abort the
    // finalize step (persistence still runs so the reply isn't lost).
    const write = (e: unknown) => {
      try { res.write(JSON.stringify(e) + "\n"); } catch { /* client gone */ }
    };

    await streamAIConversation(
      {
        userId: user.id,
        conversationId,
        newMessage: message.trim(),
        planTier: user.planTier,
        workspaceId,
        userName: user.name ?? user.email.split("@")[0],
      },
      write,
    );

    res.end();
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (error instanceof Error && error.message === "Not a member of this workspace") {
      return res.status(403).json({ error: "Forbidden" });
    }
    console.error("[/api/chat] Unhandled error:", error);
    if (!res.headersSent) return res.status(500).json({ error: "Internal server error" });
    try { res.write(JSON.stringify({ t: "error", message: "Internal server error" }) + "\n"); } catch { /* noop */ }
    return res.end();
  }
});

export default router;
