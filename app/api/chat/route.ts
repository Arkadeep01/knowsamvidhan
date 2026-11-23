/* ======================================================================
   Chat API Route — Hybrid Off-Topic Classification Integrated
   ====================================================================== */

import { NextRequest, NextResponse } from "next/server";

import { generateWithSamvi } from "@/lib/samvi/generation";

import {
  finalDecisionEngine,
  type ClassificationOutput,
  type ClassificationDecision,
  type ClassificationCategory,
} from "@/lib/samvi/classification";
import { rateLimit } from "@/lib/rate-limit";
import { verifyAccessToken } from "@/lib/auth";
import { verifyCitationPipeline, CitationType } from "@/lib/verification";
import { prisma } from "@/lib/prisma";

interface ApiMessage {
  role: "user" | "assistant";
  content: string;
}

interface RequestBody {
  messages: ApiMessage[];
}

const LIMITS = {
  maxMessageLength: 4000,
  maxMessages: 40,
} as const;

function validateRequest(body: unknown): {
  ok: true;
  data: RequestBody;
} | {
  ok: false;
  status: number;
  error: string;
} {
  if (!body || typeof body !== "object") {
    return {
      ok: false,
      status: 400,
      error: "Invalid request body.",
    };
  }

  const { messages } = body as Record<string, unknown>;

  if (!Array.isArray(messages)) {
    return {
      ok: false,
      status: 400,
      error: "messages must be an array.",
    };
  }

  if (messages.length === 0) {
    return {
      ok: false,
      status: 400,
      error: "messages array is empty.",
    };
  }

  for (const msg of messages) {
    if (
      !msg ||
      typeof msg !== "object" ||
      !["user", "assistant"].includes(
        (msg as ApiMessage).role
      ) ||
      typeof (msg as ApiMessage).content !== "string"
    ) {
      return {
        ok: false,
        status: 400,
        error: "Invalid message format.",
      };
    }
  }

  const lastMessage =
    messages[messages.length - 1] as ApiMessage;

  if (lastMessage.role !== "user") {
    return {
      ok: false,
      status: 400,
      error: "Last message must be from user.",
    };
  }

  const content = lastMessage.content.trim();

  if (!content) {
    return {
      ok: false,
      status: 400,
      error: "Message cannot be empty.",
    };
  }

  if (content.length > LIMITS.maxMessageLength) {
    return {
      ok: false,
      status: 400,
      error: `Message exceeds ${LIMITS.maxMessageLength} characters.`,
    };
  }

  return {
    ok: true,
    data: {
      messages: messages as ApiMessage[],
    },
  };
}

function sanitizeMessages(
  messages: ApiMessage[]
): ApiMessage[] {
  const cleaned = messages.map((message) => ({
    role: message.role,
    content: message.content
      .trim()
      .slice(0, LIMITS.maxMessageLength),
  }));

  return cleaned.slice(-LIMITS.maxMessages);
}

/**
 * Classify the user query using the hybrid architecture.
 * Returns the classification output with decision and metadata.
 * This runs before expensive Gemini generation and RAG retrieval.
 *
 * @param query The user's last message
 * @returns ClassificationOutput with the hybrid decision
 */
async function classifyUserQuery(
  query: string
): Promise<ClassificationOutput> {
  // Run the hybrid classification engine
  const classification = await finalDecisionEngine(query);

  return classification;
}

async function generateWithGemini(
  messages: ApiMessage[],
  model: string,
  attempt = 1
): Promise<{
  success: boolean;
  response: unknown;
  isFallbackUsed: boolean;
  error?: string;
}> {
  const lastUserMessage = messages[messages.length - 1]?.content ?? "";
  const result = await generateWithSamvi(lastUserMessage, {
    model,
    attempt,
  });

  return {
    success: result.success,
    response: result.text,
    isFallbackUsed: result.isFallbackUsed,
    ...(result.error ? { error: result.error } : {}),
  };
}

/* ======================================================================
   Helper: Build message metadata from verification results
   ====================================================================== */

function buildVerificationMetadata(
  verificationResults: Awaited<ReturnType<typeof verifyCitationPipeline>>[0][]
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};

  if (verificationResults.length === 0) {
    // No citations found
    metadata.verification = {
      status: "UNVERIFIABLE",
      provenance: {
        sourceType: "OTHER",
        verifiedAt: new Date().toISOString(),
        verificationStatus: "UNVERIFIABLE",
      },
      evidencePassages: [],
      explanation: "No citations found in generated answer. Citation verification cannot be performed.",
    };
    return metadata;
  }

  const verificationMetadata = verificationResults.map((result) => ({
    status: result.status,
    provenance: {
      sourceType: result.provenance.sourceType,
      sourceTitle: result.provenance.sourceTitle,
      articleClauseRef: result.provenance.articleClauseRef,
      court: result.provenance.court,
      judgmentYear: result.provenance.judgmentYear,
      amendmentNumber: result.provenance.amendmentNumber,
      constitutionalVersion: result.provenance.constitutionalVersion,
      originalPassage: result.provenance.originalPassage,
      sourceUrl: result.provenance.sourceUrl,
      retrievalId: result.provenance.retrievalId,
      verifiedAt: result.provenance.verifiedAt,
      verificationStatus: result.provenance.verificationStatus,
    },
    evidencePassages: result.evidencePassages,
    explanation: result.explanation,
  }));

  metadata.verification = verificationMetadata;
  return metadata;
}

/* ======================================================================
   Helper: Persist assistant message with verification metadata
   ====================================================================== */

async function persistAssistantMessage(
  conversationId: string,
  content: string,
  verificationMetadata: Record<string, unknown>
) {
  // Persist the assistant message with full metadata including verification results
  try {
    const message = await prisma.$transaction(async (tx) => {
      const newMessage = await tx.chatMessage.create({
        data: {
          role: "assistant",
          content,
          conversationId,
          metadata: JSON.stringify(verificationMetadata),
        },
      });

      await tx.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });

      return newMessage;
    });

    return message;
  } catch (error) {
    console.error("FAILED to persist assistant message:", error);
    // Return a minimal message without metadata failure
    return {
      id: crypto.randomUUID(),
      role: "assistant",
      content,
      metadata: verificationMetadata,
    };
  }
}

/* ------------------------------------------------------------------
   FUTURE PRODUCTION IMPLEMENTATION
   
async function anthropicProvider(messages: ApiMessage[]) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  const response = await fetch(
    ANTHROPIC_API,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey!,
        "anthropic-version":
          ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODELS.responder,
        max_tokens: 1500,
        messages,
      }),
    }
  );

  return response.json();
}

------------------------------------------------------------------ */
