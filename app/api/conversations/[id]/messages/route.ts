import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/auth";
import { verifyCitationPipeline, CitationType } from "@/lib/verification";
import { GoogleGenAI } from "@google/genai";

type MessageMetadata = {
  model?: string;
  provider?: string;
  finishReason?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  safetySettings?: any;
  groundingMetadata?: any;
  citations?: any;
  evidence?: any;
  verification?: {
    status: string;
    provenance: {
      sourceType?: string;
      sourceTitle?: string;
      articleClauseRef?: string;
      court?: string;
      judgmentYear?: string;
      amendmentNumber?: string;
      constitutionalVersion?: string;
      originalPassage?: string;
      sourceUrl?: string;
      retrievalId?: string;
      verifiedAt: string;
      verificationStatus: string;
    };
    evidencePassages: string[];
    explanation: string;
  };
  originalContent?: string;
};

interface MessageBody {
  role: string;
  content: string;
  metadata?: MessageMetadata;
}

interface EditMessageBody {
  content: string;
}

async function extractCitationsFromText(text: string): Promise<{ type: string; value: string; extracted?: any }[]> {
  const citations: { type: string; value: string; extracted?: any }[] = [];
  const lower = text.toLowerCase();

  // Pattern: "Article XX" or "Article XX(1)" or "Article XX, clause YY"
  const articleMatches = text.match(/(?:Article|Art\.\s*)(\d+(?:\s*[\(\[]\d+[\)\]])?(?:\s*clause\s*\d+)?)/gi);
  if (articleMatches) {
    for (const match of articleMatches) {
      const number = match.replace(/Article|Art./i, "").trim();
      citations.push({
        type: CitationType.CONSTITUTIONAL_ARTICLE,
        value: `Article ${number}`,
        extracted: { articleNumber: number },
      });
    }
  }

  // Pattern: "XXth Amendment" or "XX Amendment"
  const amendmentMatches = text.match(/(?:(\d+)(?:st|nd|rd|th)?\s*amendment|amendment\s*(\d+))/gi);
  if (amendmentMatches) {
    for (const match of amendmentMatches) {
      const number = match.replace(/amendment/gi, "").trim();
      citations.push({
        type: CitationType.AMENDMENT,
        value: `${number} Amendment`,
        extracted: { amendmentNumber: number },
      });
    }
  }

  // Pattern: "X v. Y" or "X vs Y" (judicial cases)
  const caseMatches = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*(?:v\.|vs)\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi);
  if (caseMatches) {
    for (const match of caseMatches) {
      const fullCase = match.replace(/\s+v\.|\s+vs/gi, "").trim();
      const parts = fullCase.split(/\s+(?:v\.|vs)\s/i);
      if (parts.length === 2) {
        citations.push({
          type: CitationType.JUDICIAL_DECISION,
          value: `${parts[0]} v. ${parts[1]}`,
          extracted: { caseName: fullCase, court: undefined, year: undefined, citationReference: undefined },
        });
      }
    }
  }

  // Deduplicate by value
  const seen = new Set<string>();
  return citations.filter((c) => {
    if (seen.has(c.value)) return false;
    seen.add(c.value);
    return true;
  });
}

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
    const body = (await req.json()) as MessageBody;

    if (!body.role || !body.content) {
      return NextResponse.json(
        { error: "Role and content are required" },
        { status: 400 }
      );
    }

    const { role, content, metadata } = body;

    // Step 1: Extract citations from the content
    const extractedCitations = await extractCitationsFromText(content);

    // Step 2: Run verification pipeline
    // Fetch constitutional data from Prisma for rule-based checks
    const { articles, amendments } = await prisma.$transaction(async (tx) => {
      const articles = await tx.article.findMany({});
      const amendments = await tx.amendment.findMany({});
      return { articles, amendments };
    });

    // Build case database from Prisma - query a sample of cases or use stored data
    // For now, use an empty array; in production would have a case law model
    const cases: any[] = [];

    const verificationResults = await verifyCitationPipeline(
      content,
      [], // retrievedEvidence - would come from RAG in full implementation
      { articles, amendments, cases }
    );

    // Step 3: Build metadata with verification results
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

    // Step 4: Preserve existing metadata if present, merge with verification
    const mergedMetadata: Record<string, unknown> = {
      ...(metadata || {}),
      verification: verificationMetadata,
    };

    // Step 5: Create message with merged metadata
    const message = await prisma.$transaction(async (tx) => {
      const newMessage = await tx.chatMessage.create({
        data: {
          role,
          content,
          conversationId: id,
          metadata: JSON.stringify(mergedMetadata),
        },
      });

      await tx.conversation.update({
        where: { id },
        data: { updatedAt: new Date() },
      });

      return newMessage;
    });

    return NextResponse.json(message);
  } catch (error) {
    console.error("ADD MESSAGE ERROR:", error);
    // Even if verification fails, preserve the original message without verification metadata
    try {
      const { id } = await params;
      const body = (await req.json()) as MessageBody;
      const { role, content } = body;
      const message = await prisma.chatMessage.create({
        data: {
          role,
          content,
          conversationId: id,
          metadata: JSON.stringify({}),
        },
      });
      return NextResponse.json(message);
    } catch (innerError) {
      return NextResponse.json(
        { error: "Failed to add message and verification" },
        { status: 500 }
      );
    }
  }
}

/* ------------------------------------------------------------------
   Regenerate message helper
   Creates a new branch from the message with fresh verification metadata
   ------------------------------------------------------------------ */
async function regenerateMessage(
  req: Request,
  { params }: { params: Promise<{ id: string; mid: string }> }
) {
  try {
    const session = await getUserSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, mid } = await params;
    const body = (await req.json()) as {
      regenerate?: boolean;
      role?: string;
      content?: string;
      metadata?: Record<string, unknown>;
    };

    if (body?.regenerate) {
      // Fetch the original message and its metadata
      const originalMessage = await prisma.chatMessage.findUnique({
        where: { id: mid },
        include: { conversation: true },
      });

      if (!originalMessage || originalMessage.role !== "assistant") {
        return NextResponse.json(
          { error: "Cannot regenerate non-assistant message or message not found" },
          { status: 400 }
        );
      }

      // Build conversation context up to the original message
      const messagesContext = await prisma.chatMessage.findMany({
        where: {
          conversationId: id,
        },
        orderBy: { createdAt: "asc" },
      });

      // Find the last user message in context
      const userMessages = messagesContext.filter((m) => m.role === "user");
      const lastUserMessage = userMessages.at(-1)?.content;

      if (!lastUserMessage) {
        return NextResponse.json(
          { error: "No user message found in conversation context" },
          { status: 400 }
        );
      }

      // Generate fresh response with Gemini
      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY!,
      });

      const systemInstruction =
        "You are Samvi, a constitutional AI assistant knowledgeable about the Constitution of India. Provide accurate, grounded responses with citations to articles, cases, and amendments when applicable. Use a helpful, educational tone.";

      try {
        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash-lite",
          contents: [
            {
              role: "user",
              parts: [{ text: systemInstruction }, { text: lastUserMessage }],
            },
          ],
        });

        const freshVerificationResults = await verifyCitationPipeline(
          (response as any).text || "",
          [], // retrievedEvidence
          { articles: [], amendments: [], cases: [] }
        );

        const verificationMetadata = { verification: freshVerificationResults };

        const newMessage = await prisma.chatMessage.create({
          data: {
            role: "assistant",
            content: (response as any).text || "",
            conversationId: id,
            metadata: JSON.stringify({
              ...verificationMetadata,
              parentMessageId: mid,
              branchFrom: mid,
            }),
          },
        });

        await prisma.conversation.update({
          where: { id },
          data: { updatedAt: new Date() },
        });

        return NextResponse.json(newMessage);
      } catch (error) {
        console.error("REGENERATE ERROR:", error);
        return NextResponse.json(
          { error: "Failed to regenerate message" },
          { status: 500 }
        );
      }
    }

    // Default: add new message with verification (existing behavior)
    const { role, content } = body;

    if (!role || !content) {
      return NextResponse.json(
        { error: "Role and content are required" },
        { status: 400 }
      );
    }

    // Step 1: Extract citations from the content
    const extractedCitations = await extractCitationsFromText(content);

    // Step 2: Run verification pipeline
    const { articles, amendments } = await prisma.$transaction(async (tx) => {
      const articles = await tx.article.findMany({});
      const amendments = await tx.amendment.findMany({});
      return { articles, amendments };
    });

    // Build case database from Prisma - query a sample of cases or use stored data
    const cases: any[] = [];

    const verificationResults = await verifyCitationPipeline(
      content,
      [], // retrievedEvidence - would come from RAG in full implementation
      { articles, amendments, cases }
    );

    // Step 3: Build metadata with verification results
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

    // Step 4: Preserve existing metadata if present, merge with verification
    const mergedMetadata: Record<string, unknown> = {
      ...(body.metadata || {}),
      verification: verificationMetadata,
    };

    // Step 5: Create message with merged metadata
    const message = await prisma.$transaction(async (tx) => {
      const newMessage = await tx.chatMessage.create({
        data: {
          role,
          content,
          conversationId: id,
          metadata: JSON.stringify(mergedMetadata),
        },
      });

      await tx.conversation.update({
        where: { id },
        data: { updatedAt: new Date() },
      });

      return newMessage;
    });

    return NextResponse.json(message);
  } catch (error) {
    console.error("POST MESSAGE ERROR:", error);
    // Even if verification fails, preserve the original message without verification metadata
    try {
      const { id, mid } = await params;
      const body = (await req.json()) as { role: string; content: string; metadata?: unknown };
      const { role, content } = body;
      const message = await prisma.chatMessage.create({
        data: {
          role,
          content,
          conversationId: id,
          metadata: JSON.stringify(body.metadata || {}),
        },
      });
      return NextResponse.json(message);
    } catch (innerError) {
      return NextResponse.json(
        { error: "Failed to add message and verification" },
        { status: 500 }
      );
    }
  }
}
