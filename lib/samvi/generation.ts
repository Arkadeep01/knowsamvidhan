/**
 * Shared Samvi text-generation pipeline.
 *
 * This is the single server-side generation path for Samvi. It centralises the
 * existing Gemini provider, model fallback behaviour and system instruction so
 * that features such as the Preamble explanation reuse the same agent plumbing
 * instead of creating a second, independent generation pipeline.
 */

import { GoogleGenAI } from "@google/genai";

export const SAMVI_SYSTEM_PROMPT =
  "You are Samvi, a constitutional AI assistant knowledgeable about the Constitution of India. Provide accurate, grounded responses with citations to articles, cases, and amendments when applicable. Use a helpful, educational tone.";

export const SAMVI_PRIMARY_MODEL = "gemini-3.5-flash-lite";
export const SAMVI_FALLBACK_MODEL = "gemini-3.5-flash";

const MAX_ATTEMPTS = 2;
const BACKOFF_MS = 800;

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!client) {
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  }
  return client;
}

export interface SamviGenerationOptions {
  systemInstruction?: string;
  model?: string;
  responseMimeType?: string;
  attempt?: number;
}

export interface SamviGenerationResult {
  success: boolean;
  text: string;
  isFallbackUsed: boolean;
  error?: string;
}

function extractText(response: unknown): string {
  const candidate = response as { text?: unknown } | null;
  return typeof candidate?.text === "string" ? candidate.text : "";
}

function isNonRecoverable(code: number): boolean {
  return code === 400 || code === 401 || code === 403 || code === 422 || code === 404;
}

function isTransient(code: number, message: string): boolean {
  return (
    code === 503 ||
    code === 429 ||
    message.includes("high demand") ||
    message.includes("overloaded")
  );
}

/**
 * Generate a grounded response with Samvi's configured provider.
 * Falls back from the primary model to the backup model on transient errors.
 */
export async function generateWithSamvi(
  prompt: string,
  options: SamviGenerationOptions = {}
): Promise<SamviGenerationResult> {
  const {
    systemInstruction = SAMVI_SYSTEM_PROMPT,
    model = SAMVI_PRIMARY_MODEL,
    responseMimeType,
    attempt = 1,
  } = options;

  const config = responseMimeType ? { responseMimeType } : undefined;

  try {
    const response = await getClient().models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [{ text: systemInstruction }, { text: prompt }],
        },
      ],
      ...(config ? { config } : {}),
    });

    return {
      success: true,
      text: extractText(response),
      isFallbackUsed: false,
    };
  } catch (error) {
    const providerError = error as {
      error?: { code?: string | number };
      message?: string;
    };
    const code = Number(providerError.error?.code);
    const message = providerError.message || "Unknown error";

    if (isNonRecoverable(code)) {
      return {
        success: false,
        text: "",
        isFallbackUsed: false,
        error: `Non-recoverable error (attempt ${attempt}): ${code || "unknown"}`,
      };
    }

    if (attempt < MAX_ATTEMPTS && isTransient(code, message)) {
      await new Promise((resolve) => setTimeout(resolve, BACKOFF_MS));

      try {
        const fallbackResponse = await getClient().models.generateContent({
          model: SAMVI_FALLBACK_MODEL,
          contents: [
            {
              role: "user",
              parts: [{ text: systemInstruction }, { text: prompt }],
            },
          ],
          ...(config ? { config } : {}),
        });

        return {
          success: true,
          text: extractText(fallbackResponse),
          isFallbackUsed: true,
        };
      } catch (fallbackError) {
        const fallbackMessage =
          (fallbackError as { message?: string }).message || "unknown";
        return {
          success: false,
          text: "",
          isFallbackUsed: false,
          error: `Fallback model also failed: ${fallbackMessage}`,
        };
      }
    }

    return {
      success: false,
      text: "",
      isFallbackUsed: false,
      error: `Generation failed (attempt ${attempt}): ${code || message}`,
    };
  }
}
