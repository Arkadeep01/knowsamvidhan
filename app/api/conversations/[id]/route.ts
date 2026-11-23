import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/auth";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getUserSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const conversation = await prisma.conversation.findFirst({
      where: { id, userId: session.id },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(conversation);
  } catch (error) {
    console.error("GET CONVERSATION ERROR:", error);
    return NextResponse.json(
      { error: "Failed to fetch conversation" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getUserSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Soft-delete: mark conversation as archived/deleted instead of hard deleting
    await prisma.conversation.update({
      where: { id },
      data: { isArchived: true, deletedAt: new Date() },
    });

    return NextResponse.json({ success: true, archived: true });
  } catch (error) {
    console.error("DELETE CONVERSATION ERROR:", error);
    return NextResponse.json(
      { error: "Failed to archive conversation" },
      { status: 500 }
    );
  }
}

/* ------------------------------------------------------------------
   RESTORE archived conversation
   ------------------------------------------------------------------ */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getUserSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Restore archived conversation
    await prisma.conversation.update({
      where: { id },
      data: { isArchived: false, deletedAt: null },
    });

    return NextResponse.json({ success: true, archived: false });
  } catch (error) {
    console.error("RESTORE CONVERSATION ERROR:", error);
    return NextResponse.json(
      { error: "Failed to restore conversation" },
      { status: 500 }
    );
  }
}

/* ------------------------------------------------------------------
   PERMANENTLY delete conversation (admin/confirmation required)
   ------------------------------------------------------------------ */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getUserSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Permanent delete: remove conversation and all messages
    await prisma.$transaction(async (tx) => {
      await tx.chatMessage.deleteMany({ where: { conversationId: id } });
      await tx.conversation.delete({ where: { id } });
    });

    return NextResponse.json({ success: true, permanentlyDeleted: true });
  } catch (error) {
    console.error("PERMANENT DELETE ERROR:", error);
    return NextResponse.json(
      { error: "Failed to permanently delete conversation" },
      { status: 500 }
    );
  }
}

/* ------------------------------------------------------------------
   RENEW conversation title
   ------------------------------------------------------------------ */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getUserSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = (await req.json()) as { title: string };

    if (!body.title) {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
    }

    const conversation = await prisma.conversation.update({
      where: { id },
      data: { title: body.title },
    });

    return NextResponse.json(conversation);
  } catch (error) {
    console.error("RENAME CONVERSATION ERROR:", error);
    return NextResponse.json(
      { error: "Failed to rename conversation" },
      { status: 500 }
    );
  }
}

/* ------------------------------------------------------------------
   PIN/UNPIN conversation
   ------------------------------------------------------------------ */
export async function POST_pin(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getUserSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const conversation = await prisma.conversation.findFirst({
      where: { id },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Toggle isPinned
    const newPinnedState = !conversation.isPinned;

    const updated = await prisma.conversation.update({
      where: { id },
      data: { isPinned: newPinnedState },
    });

    return NextResponse.json({ isPinned: newPinnedState, conversation: updated });
  } catch (error) {
    console.error("PIN CONVERSATION ERROR:", error);
    return NextResponse.json(
      { error: "Failed to pin/unpin conversation" },
      { status: 500 }
    );
  }
}

/* ------------------------------------------------------------------
   EXPORT conversation (Markdown/JSON preserving metadata)
   ------------------------------------------------------------------ */
export async function GET_export(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getUserSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const conversation = await prisma.conversation.findFirst({
      where: { id, userId: session.id },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Build export content
    const lines: string[] = [];
    lines.push(`# Conversation: ${conversation.title || "Untitled"}`);
    lines.push(`* Export Date: ${new Date().toISOString()}*`);
    lines.push(`* Messages: ${conversation.messages.length}*`);
    lines.push("");

    conversation.messages.forEach((msg) => {
      const timestamp = new Date(msg.createdAt).toLocaleString();
      const role = msg.role === "user" ? "User" : "Samvi";
      lines.push(`## ${timestamp} - ${role}`);
      lines.push(msg.content);
      lines.push("");
    });

    const markdownContent = lines.join("\n");
    const jsonContent = JSON.stringify(
      conversation,
      (key, value) => {
        if (key === "conversation") return undefined;
        if (key === "messages") return value;
        return value;
      },
      2
    );

    return new NextResponse(
      `--8<<BEGIN_MARKDOWN>>${markdownContent}<<END_MARKDOWN>>--\n\n--8<<BEGIN_JSON>>${jsonContent}<<END_JSON>>--`,
      {
        headers: {
          "Content-Disposition": `attachment; filename="conversation-${conversation.id}.md"`,
          "Content-Type": "text/plain",
        },
      }
    );
  } catch (error) {
    console.error("EXPORT CONVERSATION ERROR:", error);
    return NextResponse.json(
      { error: "Failed to export conversation" },
      { status: 500 }
    );
  }
}
