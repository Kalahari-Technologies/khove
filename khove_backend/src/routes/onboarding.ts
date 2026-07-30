import { Router } from "express";
import { createClerkClient } from "@clerk/backend";
import { requireUser } from "@backend/lib/auth";
import { db } from "@backend/lib/db";
import { ensurePersonalWorkspace } from "@backend/lib/workspace/create-personal";

const router = Router();

const clerkBackend = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

// POST /api/onboarding — set personal-workspace slug + gradient, and mark the user
// as onboarded (a durable Clerk `publicMetadata.onboarded` flag — the single source
// of truth for "has finished onboarding", independent of whether the OAuth provider
// supplied a username). Ensures the personal workspace exists so onboarding never
// dead-ends waiting on the async user.created webhook.
router.post("/", async (req, res) => {
  try {
    const user = await requireUser(req);
    const { username, gradient } = (req.body ?? {}) as { username?: string; gradient?: string };

    if (!username || typeof username !== "string" || !username.trim()) {
      return res.status(400).json({ error: "Username is required" });
    }

    const slug = username.trim().toLowerCase();

    const existing = await db.workspace.findUnique({ where: { slug } });
    if (existing && existing.ownerId !== user.id) {
      return res.status(409).json({ error: "Username is already taken" });
    }

    // Idempotent — creates the personal workspace if the webhook hasn't yet.
    const personalWorkspace = await ensurePersonalWorkspace({
      id: user.id,
      name: user.name,
      email: user.email,
    });

    await db.workspace.update({
      where: { id: personalWorkspace.id },
      data: { slug, ...(gradient && { gradient }) },
    });

    // Mark onboarding complete (durable flag the /home gate reads). Best-effort —
    // the workspace is already set up, so don't fail the request on a Clerk hiccup.
    await clerkBackend.users
      .updateUserMetadata(user.clerkId, { publicMetadata: { onboarded: true } })
      .catch((e) => console.error("[/api/onboarding] set onboarded flag failed:", e));

    return res.json({ success: true, slug });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    console.error("[/api/onboarding] Error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
