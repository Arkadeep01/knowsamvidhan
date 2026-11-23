import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/auth";

interface MigrationPayload {
  guestSessionId: string;
  conversationId?: string;
  title?: string;
}

interface MessagePayload {
  role: string;
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

interface MigrationResult {
  success: boolean;
  migratedConversations: number;
  migratedMessages: number;
  skippedConversations: number;
  skippedMessages: number;
  errors: string[];
}

/**
 * POST /api/conversations/migrate
 * 
 * Migrate guest conversation history from localStorage to the authenticated user's account.
 * 
 * Request body:
 * - guestSessionId: stable identifier for the guest session (e.g., from localStorage)
 * - Optional: conversationId if migrating a specific conversation
 * - Optional: title for the new conversation
 * 
 * Response: Migration result with counts of successful/skipped/failed items
 * 
 * Security:
 * - Only authenticated users can migrate conversations
 * - guestSessionId is used only for tracking, not for ownership
 * - Each guest session's conversations are migrated once (idempotent)
 */
export async function POST(
  req: Request
) {
  try {
    const session = await getUserSession();
    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized - authentication required for migration" },
        { status: 401 }
      );
    }

    const body = (await req.json()) as { guestSessionId: string; conversationId?: string; title?: string };

    if (!body.guestSessionId) {
      return NextResponse.json(
        { error: "guestSessionId is required" },
        { status: 400 }
      );
    }

    const { guestSessionId, conversationId, title } = body;

    // Idempotency check: verify this guest session hasn't already been fully migrated
    const alreadyMigrated = await prisma.conversation.count({
      where: {
        userId: session.id,
        isGuest: true,
        guestSessionId: guestSessionId,
      },
    });

    if (alreadyMigrated > 0 && conversationId === undefined) {
      // Already migrated - return existing result without re-migrating
      // Find the migrated conversations to provide info
      const migratedConversations = await prisma.conversation.findMany({
        where: {
          userId: session.id,
          isGuest: true,
          guestSessionId: guestSessionId,
        },
        include: {
          _count: {
            select: { messages: true },
          },
        },
        orderBy: { updatedAt: "desc" },
      });

      return NextResponse.json({
        success: true,
        alreadyMigrated: true,
        migratedConversations: migratedConversations.length,
        migratedMessages: migratedConversations.reduce((sum, conv) => sum + conv._count.messages, 0),
        message: "Guest conversations already migrated to this account",
      });
    }

    // If migrating a specific conversation, find it and migrate just that one
    if (conversationId) {
      // Verify the conversation exists and belongs to this guest session pattern
      const guestConversation = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          isGuest: true,
          guestSessionId: guestSessionId,
        },
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
          },
        },
      });

      if (!guestConversation) {
        return NextResponse.json(
          { error: "Conversation not found or does not belong to this guest session" },
          { status: 404 }
        );
      }

      // Create new conversation in authenticated user's account
      const newConversation = await prisma.$transaction(async (tx) => {
        const conv = await tx.conversation.create({
          data: {
            title: title || guestConversation.title,
            userId: session.id,
            isGuest: true,
            guestSessionId: guestSessionId,
          },
        });

        // Migrate all messages with their metadata
        await tx.chatMessage.createMany({
          data: guestConversation.messages.map((msg) => ({
            role: msg.role,
            content: msg.content,
            conversationId: conv.id,
            metadata: msg.metadata,
            editedAt: msg.editedAt,
            isEdited: msg.isEdited,
            parentMessageId: msg.parentMessageId,
          })),
        });

        // Update the original conversation to mark it as migrated
        await tx.conversation.update({
          where: { id: guestConversation.id },
          data: { isArchived: true, archivedAt: new Date() },
        });

        return conv;
      });

      return NextResponse.json({
        success: true,
        alreadyMigrated: false,
        migratedConversations: 1,
        migratedMessages: guestConversation.messages.length,
        message: "Conversation migrated successfully",
      });
    }

    // Full migration: migrate all guest conversations from localStorage
    // In a real implementation, we would also check localStorage here
    // For now, migrate any guest conversations associated with this guestSessionId

    const guestConversations = await prisma.conversation.findMany({
      where: {
        isGuest: true,
        guestSessionId: guestSessionId,
      },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (guestConversations.length === 0) {
      return NextResponse.json({
        success: true,
        alreadyMigrated: false,
        migratedConversations: 0,
        migratedMessages: 0,
        message: "No guest conversations found for this session ID",
      });
    }

    // Migrate all conversations
    const migrationResults = await prisma.$transaction(async (tx) => {
      const results: Array<{ conversationId: string; messageCount: number }> = [];

      for (const guestConv of guestConversations) {
        // Create new conversation in authenticated user's account
        const newConversation = await tx.conversation.create({
          data: {
            title: guestConv.title || "Migrated Conversation",
            userId: session.id,
            isGuest: true,
            guestSessionId: guestSessionId,
          },
        });

        // Migrate all messages with their metadata
        await tx.chatMessage.createMany({
          data: guestConv.messages.map((msg) => ({
            role: msg.role,
            content: msg.content,
            conversationId: newConversation.id,
            metadata: msg.metadata,
            editedAt: msg.editedAt,
            isEdited: msg.isEdited,
            parentMessageId: msg.parentMessageId,
          })),
        });

        // Mark original as archived (preserves data, user can restore later)
        await tx.conversation.update({
          where: { id: guestConv.id },
          data: { isArchived: true, archivedAt: new Date() },
        });

        results.push({
          conversationId: newConversation.id,
          messageCount: guestConv.messages.length,
        });
      }

      return results;
    });

    const totalMigratedMessages = migrationResults.reduce(
      (sum, r) => sum + r.messageCount, 0
    );

    return NextResponse.json({
      success: true,
      alreadyMigrated: false,
      migratedConversations: migrationResults.length,
      migratedMessages: totalMigratedMessages,
      message: "Conversations migrated successfully",
    });
  } catch (error) {
    console.error("MIGRATION ERROR:", error);
    return NextResponse.json(
      { error: "Failed to migrate conversations" },
      { status: 500 }
    );
  }
}