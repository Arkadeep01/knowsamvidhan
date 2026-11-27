import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/auth";

export async function POST(
  req: Request
) {
  try {
    const session = await getUserSession();
    const body = await req.json();
    const { conversationId, rating, comment } = body;

    // Validate required fields
    if (rating === undefined || rating === null) {
      return NextResponse.json(
        { error: "Rating is required" },
        { status: 400 }
      );
    }

    // Rating must be 1-5
    if (rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: "Rating must be between 1 and 5" },
        { status: 400 }
      );
    }

    // Determine userId - authenticated user or guest
    let userId: string | null = null;
    if (session) {
      userId = session.id;
    } else {
      // For guest conversations, we store feedback without userId
      // and rely on conversationId + guestSessionId tracking
      const guestConv = await prisma.conversation.findFirst({
        where: { id: conversationId, isGuest: true },
        select: { guestSessionId: true },
      });
      // We'll store null userId for guest feedback; frontend tracks guest session
      userId = null;
    }

    // Create feedback entry
    const feedback = await prisma.feedback.create({
      data: {
        userId,
        rating,
        comment: comment || null,
        conversationId,
      },
    });

    // Check if this is negative feedback that should be flagged for admin review
    if (rating <= 2) {
      // Flag for admin review by setting showOnSite to true or creating an alert
      await prisma.feedback.update({
        where: { id: feedback.id },
        data: { showOnSite: true },
      });
    }

    return NextResponse.json(feedback);
  } catch (error) {
    console.error("FEEDBACK ERROR:", error);
    return NextResponse.json(
      { error: "Failed to submit feedback" },
      { status: 500 }
    );
  }
}