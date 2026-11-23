import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/auth";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; mid: string }> }
) {
  try {
    const session = await getUserSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, mid } = await params;
    const body = (await req.json()) as { content?: string };
    if (!body.content) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    const existingMessage = await prisma.chatMessage.findFirst({
      where: { id: mid, conversationId: id },
    });
    if (!existingMessage) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const currentMetadata = existingMessage.metadata;
    const parsedMetadata = typeof currentMetadata === "string"
      ? JSON.parse(currentMetadata || "{}")
      : currentMetadata || {};
    const message = await prisma.chatMessage.update({
      where: { id: mid },
      data: {
        content: body.content,
        isEdited: true,
        editedAt: new Date(),
        metadata: JSON.stringify({ ...parsedMetadata, originalContent: existingMessage.content }),
      },
    });

    await prisma.conversation.update({
      where: { id },
      data: { updatedAt: new Date() },
    });
    return NextResponse.json(message);
  } catch (error) {
    console.error("PATCH EDIT ERROR:", error);
    return NextResponse.json({ error: "Failed to edit message" }, { status: 500 });
  }
}
