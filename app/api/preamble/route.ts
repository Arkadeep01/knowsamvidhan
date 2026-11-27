import { NextResponse } from "next/server";
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
} from "@/lib/preamble/verifiedSource";

export async function GET() {
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
  });
}
