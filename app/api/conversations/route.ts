import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getUserSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const conversations = await prisma.conversation.findMany({
      where: { userId: session.id },
      orderBy: { updatedAt: "desc" },
      include: {
        _count: {
          select: { messages: true },
        },
      },
    });

    return NextResponse.json(conversations);
  } catch (error) {
    console.error("CONVERSATIONS ERROR:", error);
    return NextResponse.json(
      { error: "Failed to fetch conversations" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await getUserSession();
    const body = await req.json();
    const { title } = body;

    // Guest conversation creation (no auth required)
    if (!session) {
      const { guestSessionId } = body;
      if (!guestSessionId) {
        return NextResponse.json(
          { error: "guestSessionId is required for guest conversations" },
          { status: 400 }
        );
      }

      const conversation = await prisma.conversation.create({
        data: {
          title,
          isGuest: true,
          guestSessionId,
        },
      });

      return NextResponse.json(conversation);
    }

    // Authenticated user conversation creation
    if (session) {
      const conversation = await prisma.conversation.create({
        data: {
          title,
          userId: session.id,
        },
      });

      return NextResponse.json(conversation);
    }

    return NextResponse.json({ error: "Unexpected state" }, { status: 500 });
  } catch (error) {
    console.error("CREATE CONVERSATION ERROR:", error);
    return NextResponse.json(
      { error: "Failed to create conversation" },
      { status: 500 }
    );
  }
}