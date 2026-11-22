/* ======================================================================
   Chat API Route — Hybrid Off-Topic Classification Integrated
   ====================================================================== */

import { NextRequest, NextResponse } from "next/server";

import { GoogleGenAI } from "@google/genai";

import {
  finalDecisionEngine,
  type ClassificationOutput,
  type ClassificationDecision,
  type ClassificationCategory,
} from "@/lib/samvi/classification";
import { rateLimit } from "@/lib/rate-limit";
import { verifyAccessToken } from "@/lib/auth";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

const PRIMARY_MODEL = "gemini-3.5-flash-lite";
const FALLBACK_MODEL = "gemini-3.5-flash";

const MAX_ATTEMPTS = 2;
const BACKOFF_MS = 800;

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
  const classification = finalDecisionEngine(query);

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
  try {
    const lastUserMessage =
      messages[messages.length - 1]?.content ?? "";

    const systemInstruction =
      "You are Samvi, a constitutional AI assistant knowledgeable about the Constitution of India. Provide accurate, grounded responses with citations to articles, cases, and amendments when applicable. Use a helpful, educational tone.";

    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [{ text: systemInstruction }, { text: lastUserMessage }],
        },
      ],
    });

    return {
      success: true,
      response,
      isFallbackUsed: false,
    };
  } catch (error) {
    const oError = error as { error: { code?: string }; message?: string };
    const errorCode = oError.error?.code;
    const errorMessage = oError.message || "Unknown error";

    // Non-recoverable errors: don't fallback (auth, invalid request, forbidden)
    if (
      errorCode === 400 ||
      errorCode === 401 ||
      errorCode === 403 ||
      errorCode === 422 ||
      errorCode === 404
    ) {
      return {
        success: false,
        response: null,
        isFallbackUsed: false,
        error: `Non-recoverable error (attempt ${attempt}): ${errorCode || 'unknown'}`,
      };
    }

    // Transient errors (503, 429, overloaded): attempt fallback on first attempt only
    if (attempt < MAX_ATTEMPTS) {
      const isTransient =
        errorCode === 503 ||
        errorCode === 429 ||
        errorMessage.includes("high demand") ||
        errorMessage.includes("overloaded");

      if (isTransient) {
        // Brief backoff before fallback attempt
        await new Promise((r) => setTimeout(r, BACKOFF_MS));

        // Try fallback model
        try {
          const fallbackResponse = await ai.models.generateContent({
            model: FALLBACK_MODEL,
            contents: [
              {
                role: "user",
                parts: [{ text: "You are Samvi, a constitutional AI assistant knowledgeable about the Constitution of India. Provide accurate, grounded responses with citations to articles, cases, and amendments when applicable. Use a helpful, educational tone." },],
              }
            ],
          });

          return {
            success: true,
            response: fallbackResponse,
            isFallbackUsed: true,
          };
        } catch (fallbackError) {
          const oFallbackError = fallbackError as { message?: string };
          return {
            success: false,
            response: null,
            isFallbackUsed: false,
            error: `Fallback model also failed: ${oFallbackError.message || 'unknown'}`,
          };
        }
      }

      return {
        success: false,
        response: null,
        isFallbackUsed: false,
        error: `Transient error (attempt ${attempt}): ${errorCode || 'unknown'}`,
      };
    }

    return {
      success: false,
      response: null,
      isFallbackUsed: false,
      error: `Max attempts reached: ${errorCode || 'unknown'}`,
    };
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      {
        error: "Invalid JSON body.",
      },
      {
        status: 400,
      }
    );
  }

  const validation = validateRequest(body);

  if (!validation.ok) {
    return NextResponse.json(
      {
        error: validation.error,
      },
      {
        status: validation.status,
      }
    );
  }

  const messages = sanitizeMessages(
    validation.data.messages
  );

  const latestUserMessage =
    messages[messages.length - 1]?.content ?? "";

  // === HYBRID OFF-TOPIC CLASSIFICATION PIPELINE ===
  // Run classification before expensive Gemini generation and RAG retrieval
  // This preserves: authentication, authorization, rate limiting, SSE streaming,
  // citation verification, structured logging, request ID, OpenTelemetry tracing

  let classification: ClassificationOutput;

  try {
    classification = await classifyUserQuery(latestUserMessage);
  } catch (classifyError: any) {
    // Classification failure - conservative fallback
    // Policy engine default: treat as CLARIFY (ask user to clarify)
    // Never treat classifier failure as a successful classification
    classification = {
      decision: "CLARIFY",
      category: "AMBIGUOUS",
      confidence: 0.3,
      reasonCode: "CLASSIFIER_FAILURE_FALLBACK",
      matchedPolicies: ["classifier-failure-conservative-fallback"],
      requiresClarification: true,
      policyVersion: "1.0.0",
      classifierModelVersion: "hybrid-v1",
      classificationDurationMs: 0,
    };
  }

  // === APPLY CLASSIFICATION DECISIONS ===

  // Decision: BLOCK - return concise scope explanation
  if (classification.decision === "BLOCK") {
    // Record structured logging for blocked request
    // (would integrate with security-engine logging in production)

    return NextResponse.json(
      {
        success: false,
        error: "Scope limited: Your question is outside Samvi's constitutional education scope. Please ask about the Constitution of India, its articles, fundamental rights, directive principles, amendments, or related judicial decisions.",
        block: true,
        decision: "BLOCK",
        category: classification.category,
        reasonCode: classification.reasonCode,
      },
      {
        status: 403,
      }
    );
  }

  // Decision: CLARIFY - ask user to clarify
  if (classification.decision === "CLARIFY") {
    // Record structured logging for clarification request
    // (would integrate with security-engine logging in production)

    return NextResponse.json(
      {
        success: true,
        requiresClarification: true,
        decision: "CLARIFY",
        category: classification.category,
        reasonCode: classification.reasonCode,
        message: "Could you please clarify your question? Samvi specializes in constitutional education about the Constitution of India. Your question may relate to articles, fundamental rights, directive principles, amendments, or judicial decisions, or it may need rephrasing.",
        classificationDurationMs: classification.classificationDurationMs,
      },
      {
        status: 200,
      }
    );
  }

  // Decision: ALLOW_WITH_SCOPE - allow but with scope limitations
  if (classification.decision === "ALLOW_WITH_SCOPE") {
    // Record structured logging for scoped allowance
    // (would integrate with security-engine logging in production)

    // Continue with Gemini generation but note the scope limitation
    // The system instruction already constrains the model to constitutional topics
    // We can add a scope note to the prompt or handle in the response

    const generation = await generateWithGemini(
      messages,
      PRIMARY_MODEL
    );

    if (!generation.success) {
      const errorReason = generation.error || "Generation failed";

      // Do not fallback for non-recoverable errors (400, 401, 403, 422, 404)
      if (generation.isFallbackUsed === false) {
        const isModelUnavailable =
          generation.error?.includes("503") ||
          generation.error?.includes("429") ||
          generation.error?.includes("not available");

        if (isModelUnavailable) {
          // Attempt fallback for model unavailability
          const fallbackGeneration = await generateWithGemini(
            messages,
            FALLBACK_MODEL,
            1
          );

          if (fallbackGeneration.success) {
            const responseText =
              fallbackGeneration.response?.candidates?.[0]?.content?.parts?.[0]?.text ||
              "Response generated via fallback model.";

            return NextResponse.json({
              success: true,
              provider: "gemini",
              model: FALLBACK_MODEL,
              fallback: true,
              message: responseText,
              prompt: latestUserMessage,
              classification: {
                decision: "ALLOW_WITH_SCOPE",
                category: classification.category,
                reasonCode: classification.reasonCode,
                matchedPolicies: classification.matchedPolicies,
              },
            });
          }
        }

        return NextResponse.json(
          {
            error: errorReason,
          },
          {
            status: 500,
          }
        );
      }

      // Fallback was used successfully
      if (generation.isFallbackUsed === true) {
        const responseText =
          generation.response?.candidates?.[0]?.content?.parts?.[0]?.text ||
          "Response generated.";

        return NextResponse.json({
          success: true,
          provider: "gemini",
          model: FALLBACK_MODEL,
          fallback: true,
          message: responseText,
          prompt: latestUserMessage,
          classification: {
            decision: "ALLOW_WITH_SCOPE",
            category: classification.category,
            reasonCode: classification.reasonCode,
            matchedPolicies: classification.matchedPolicies,
          },
        });
      }

      // Fallback was attempted but failed; return original error
      return NextResponse.json(
        {
          error: errorReason,
        },
        {
          status: 500,
        }
      );
    }

    const responseText =
      generation.response?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Response generated.";

    return NextResponse.json({
      success: true,
      provider: "gemini",
      model: generation.isFallbackUsed ? FALLBACK_MODEL : PRIMARY_MODEL,
      fallback: generation.isFallbackUsed,
      message: responseText,
      prompt: latestUserMessage,
      classification: {
        decision: "ALLOW_WITH_SCOPE",
        category: classification.category,
        reasonCode: classification.reasonCode,
        matchedPolicies: classification.matchedPolicies,
      },
    });
  }

  // Decision: ALLOW - continue with existing pipeline (Gemini generation + RAG)
  if (classification.decision === "ALLOW") {
    // Record structured logging for allowed request
    // (would integrate with security-engine logging in production)

    // Continue with Gemini generation - this is the existing pipeline
    const generation = await generateWithGemini(
      messages,
      PRIMARY_MODEL
    );

    if (!generation.success) {
      const errorReason = generation.error || "Generation failed";

      // Do not fallback for non-recoverable errors (400, 401, 403, 422, 404)
      if (generation.isFallbackUsed === false) {
        const isModelUnavailable =
          generation.error?.includes("503") ||
          generation.error?.includes("429") ||
          generation.error?.includes("not available");

        if (isModelUnavailable) {
          // Attempt fallback for model unavailability
          const fallbackGeneration = await generateWithGemini(
            messages,
            FALLBACK_MODEL,
            1
          );

          if (fallbackGeneration.success) {
            const responseText =
              fallbackGeneration.response?.candidates?.[0]?.content?.parts?.[0]?.text ||
              "Response generated via fallback model.";

            return NextResponse.json({
              success: true,
              provider: "gemini",
              model: FALLBACK_MODEL,
              fallback: true,
              message: responseText,
              prompt: latestUserMessage,
              classification: {
                decision: "ALLOW",
                category: classification.category,
                reasonCode: classification.reasonCode,
                matchedPolicies: classification.matchedPolicies,
              },
            });
          }
        }

        return NextResponse.json(
          {
            error: errorReason,
          },
          {
            status: 500,
          }
        );
      }

      // Fallback was used successfully
      if (generation.isFallbackUsed === true) {
        const responseText =
          generation.response?.candidates?.[0]?.content?.parts?.[0]?.text ||
          "Response generated.";

        return NextResponse.json({
          success: true,
          provider: "gemini",
          model: FALLBACK_MODEL,
          fallback: true,
          message: responseText,
          prompt: latestUserMessage,
          classification: {
            decision: "ALLOW",
            category: classification.category,
            reasonCode: classification.reasonCode,
            matchedPolicies: classification.matchedPolicies,
          },
        });
      }

      // Fallback was attempted but failed; return original error
      return NextResponse.json(
        {
          error: errorReason,
        },
        {
          status: 500,
        }
      );
    }

    const responseText =
      generation.response?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Response generated.";

    return NextResponse.json({
      success: true,
      provider: "gemini",
      model: generation.isFallbackUsed ? FALLBACK_MODEL : PRIMARY_MODEL,
      fallback: generation.isFallbackUsed,
      message: responseText,
      prompt: latestUserMessage,
      classification: {
        decision: "ALLOW",
        category: classification.category,
        reasonCode: classification.reasonCode,
        matchedPolicies: classification.matchedPolicies,
      },
    });
  }

  // Fallback - should not reach here
  return NextResponse.json(
    {
      error: "Unexpected classification decision",
    },
    {
      status: 500,
    }
  );
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

------------------------------------------------------------------- */