import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  PREAMBLE_ID,
  PREAMBLE_SOURCE,
  OFFICIAL_PREAMBLE_TEXT,
  VERIFIED_QUICK_FACTS,
  VERIFIED_KEYWORDS,
  VERIFIED_TIMELINE,
  VERIFIED_LANDMARK_CASES,
  VERIFIED_NOTES,
  VERIFIED_SIMPLE_EXPLANATION,
  VERIFIED_WHY_IT_MATTERS,
  VERIFIED_PLAIN_MEANING,
  VERIFIED_PLAIN_CONTEXT,
  VERIFIED_CONCEPTS,
  type QuickFact,
} from "@/lib/preamble/verifiedSource";

type UnknownRecord = Record<string, unknown>;

function parseArray(raw: unknown): UnknownRecord[] {
  if (Array.isArray(raw)) return raw.filter((item) => item !== null && typeof item === "object") as UnknownRecord[];
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item) => item !== null && typeof item === "object") as UnknownRecord[]
      : [];
  } catch {
    return [];
  }
}

function parseStringArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((item): item is string => typeof item === "string");
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

/**
 * Quick facts may be stored as strings ("Adopted: 26 November 1949") or as
 * { label, value } objects. Normalise both into the shape the UI expects.
 */
function normalizeQuickFacts(raw: unknown): QuickFact[] {
  if (Array.isArray(raw)) {
    const facts: QuickFact[] = [];
    for (const item of raw) {
      if (item && typeof item === "object") {
        const record = item as UnknownRecord;
        const label = typeof record.label === "string" ? record.label : "";
        const value = typeof record.value === "string" ? record.value : "";
        if (value) facts.push({ label, value });
      } else if (typeof item === "string" && item.trim()) {
        const separator = item.indexOf(":");
        if (separator > 0) {
          facts.push({
            label: item.slice(0, separator).trim(),
            value: item.slice(separator + 1).trim(),
          });
        } else {
          facts.push({ label: "", value: item.trim() });
        }
      }
    }
    if (facts.length > 0) return facts;
  }
  return parseStringArray(raw).map((fact) => {
    const separator = fact.indexOf(":");
    return separator > 0
      ? { label: fact.slice(0, separator).trim(), value: fact.slice(separator + 1).trim() }
      : { label: "", value: fact.trim() };
  });
}

function textOr(raw: unknown, fallback: string): string {
  return typeof raw === "string" && raw.trim() ? raw : fallback;
}

export async function GET() {
  try {
    const preamble = await prisma.preamble.findUnique({
      where: { id: PREAMBLE_ID },
    });

    const source = preamble as UnknownRecord | null;

    // The official text is a verified constitutional source, never AI output.
    // The canonical text is authoritative so the page can never show an
    // incomplete or placeholder version of the Preamble.
    const officialText = OFFICIAL_PREAMBLE_TEXT;

    const keywords = parseArray(source?.keywords);
    const timeline = parseArray(source?.timeline);
    const quickFacts = normalizeQuickFacts(source?.quickFacts);
    const landmarkCases = parseArray(source?.landmarkCases);
    const notes = parseArray(source?.notes);

    return NextResponse.json({
      id: PREAMBLE_ID,
      officialText,
      simpleExplanation: textOr(source?.simpleExplanation, VERIFIED_SIMPLE_EXPLANATION),
      whyItMatters: textOr(source?.whyItMatters, VERIFIED_WHY_IT_MATTERS),
      keywords: keywords.length > 0 ? keywords : VERIFIED_KEYWORDS,
      timeline: timeline.length > 0 ? timeline : VERIFIED_TIMELINE,
      quickFacts: quickFacts.length > 0 ? quickFacts : VERIFIED_QUICK_FACTS,
      landmarkCases: landmarkCases.length > 0 ? landmarkCases : VERIFIED_LANDMARK_CASES,
      notes: notes.length > 0 ? notes : VERIFIED_NOTES,
      plainMeaning: VERIFIED_PLAIN_MEANING,
      plainContext: VERIFIED_PLAIN_CONTEXT,
      concepts: VERIFIED_CONCEPTS,
      source: PREAMBLE_SOURCE,
      officialTextIsVerified: true,
    });
  } catch (error) {
    console.error("USER GET ERROR:", error);
    return NextResponse.json({
      id: PREAMBLE_ID,
      officialText: OFFICIAL_PREAMBLE_TEXT,
      simpleExplanation: VERIFIED_SIMPLE_EXPLANATION,
      whyItMatters: VERIFIED_WHY_IT_MATTERS,
      keywords: VERIFIED_KEYWORDS,
      timeline: VERIFIED_TIMELINE,
      quickFacts: VERIFIED_QUICK_FACTS,
      landmarkCases: VERIFIED_LANDMARK_CASES,
      notes: VERIFIED_NOTES,
      plainMeaning: VERIFIED_PLAIN_MEANING,
      plainContext: VERIFIED_PLAIN_CONTEXT,
      concepts: VERIFIED_CONCEPTS,
      source: PREAMBLE_SOURCE,
      officialTextIsVerified: true,
      error: "Failed to load stored preamble data; showing verified source data.",
    });
  }
}
