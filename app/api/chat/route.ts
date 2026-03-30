import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { runAIConversation } from "@/lib/ai";
import { requireWorkspaceMembership } from "@/lib/workspace/resolve";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json();

    const { message, conversationId, workspaceId } = body as {
      message: string;
      conversationId?: string;
      workspaceId?: string;
    };

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    if (message.length > 4000) {
      return NextResponse.json(
        { error: "Message too long (max 4000 characters)" },
        { status: 400 }
      );
    }

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    // Validate workspace membership
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
      // Return 200 with blocked:true — never 4xx for usage limits
      return NextResponse.json({
        blocked: true,
        response: result.response,
      });
    }

    if (result.error) {
      return NextResponse.json(
        { error: result.error, response: result.response },
        { status: 500 }
      );
    }

    return NextResponse.json({
      blocked: false,
      response: result.response,
      conversationId: result.conversationId,
      model: result.model,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "Not a member of this workspace") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[/api/chat] Unhandled error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
