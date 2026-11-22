import { NextRequest, NextResponse } from "next/server";

import { GoogleGenAI } from "@google/genai";

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

  const generation = await generateWithGemini(
    messages,
    PRIMARY_MODEL
  );

  if (!generation.success) {
    const errorReason = generation.error || "Generation failed";

    // Do not fallback for non-recoverable errors (400, 401, 403, 422, 404)
    if (generation.isFallbackUsed === false) {
      // Check if it's a model unavailability error that might warrant fallback
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
  });
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