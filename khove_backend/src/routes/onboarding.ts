import { Router } from "express";
import { requireUser } from "@backend/lib/auth";
import { db } from "@backend/lib/db";

const router = Router();

// POST /api/onboarding — set personal-workspace slug + gradient
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

    const personalWorkspace = await db.workspace.findFirst({
      where: { ownerId: user.id, isPersonal: true },
    });
    if (!personalWorkspace) {
      return res.status(404).json({ error: "Personal workspace not found" });
    }

    await db.workspace.update({
      where: { id: personalWorkspace.id },
      data: { slug, ...(gradient && { gradient }) },
    });

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
