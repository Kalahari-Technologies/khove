import { Router } from "express";
import { requireUser } from "@backend/lib/auth";
import { runAIConversation } from "@backend/lib/ai";
import { requireWorkspaceMembership } from "@backend/lib/workspace/resolve";

const router = Router();

// POST /api/chat — AI conversation
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

    const result = await runAIConversation({
      userId: user.id,
      conversationId,
      newMessage: message.trim(),
      planTier: user.planTier,
      workspaceId,
      userName: user.name ?? user.email.split("@")[0],
    });

    if (result.blocked) {
      // 200 with blocked:true — never 4xx for usage limits.
      return res.json({ blocked: true, response: result.response });
    }
    if (result.error) {
      return res.status(500).json({ error: result.error, response: result.response });
    }
    return res.json({
      blocked: false,
      response: result.response,
      conversationId: result.conversationId,
      model: result.model,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (error instanceof Error && error.message === "Not a member of this workspace") {
      return res.status(403).json({ error: "Forbidden" });
    }
    console.error("[/api/chat] Unhandled error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
