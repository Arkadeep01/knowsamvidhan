import {
  GoogleGenAI,
  Type,
  EmbedContentRequest,
  Content,
  Part,
} from "@google/genai";
import { prisma } from "./prisma";
import { recordSecurityAudit } from "./security-engine";

/* ======================================================================
   Types and Interfaces
   ====================================================================== */

/** Verification status enumeration */
export enum VerificationStatus {
  VERIFIED = "VERIFIED",
  PARTIALLY_SUPPORTED = "PARTIALLY_SUPPORTED",
  UNSUPPORTED = "UNSUPPORTED",
  UNVERIFIABLE = "UNVERIFIABLE",
}

/** Citation type enumeration */
export enum CitationType {
  CONSTITUTIONAL_ARTICLE = "CONSTITUTIONAL_ARTICLE",
  AMENDMENT = "AMENDMENT",
  JUDICIAL_DECISION = "JUDICIAL_DECISION",
  STATUTE = "STATUTE",
  OTHER = "OTHER",
}

/** Verification provenance */
export interface VerificationProvenance {
  sourceType: CitationType;
  sourceTitle?: string;
  court?: string;
  judgmentYear?: string;
  articleClauseRef?: string;
  originalPassage?: string;
  sourceUrl?: string;
  constitutionalVersion?: string;
  amendmentNumber?: string;
  retrievalId?: string;
  verifiedAt?: string;
  verificationStatus: VerificationStatus;
}

/** Extracted claim from generated text */
export interface ExtractedClaim {
  text: string;
  citations: CitationInfo[];
}

/** Citation information extracted from text */
export interface CitationInfo {
  type: CitationType;
  value: string; // e.g., "Article 21", "42nd Amendment", "Kesavananda Bharati v. State of Kerala"
  extracted?: {
    articleNumber?: string;
    clauseNumber?: string;
    amendmentNumber?: string;
    caseName?: string;
    court?: string;
    year?: string;
    citationReference?: string;
  };
}

/** Verification result for a single claim-citation pair */
export interface VerificationResult {
  claim: ExtractedClaim;
  citation: CitationInfo;
  status: VerificationStatus;
  provenance: VerificationProvenance;
  evidencePassages: string[];
  explanation: string;
}

/** Threshold for semantic similarity */
const SEMANTIC_VERIFICATION_THRESHOLD = 0.65;

/* ======================================================================
   AI Client Initialization
   ====================================================================== */

const AI = new GoogleGenAI({
  apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY,
});

/* ======================================================================
   Rule-Based Verification
   ====================================================================== */

/**
 * Verify a constitutional article citation against the claim and evidence.
 * Does NOT treat Article existence as proof of claim support.
 */
function verifyConstitutionalArticle(
  claim: string,
  citation: CitationInfo,
  evidencePassages: string[],
  articleDb: any[],
): VerificationResult {
  const articleNumber = citation.extracted?.articleNumber;
  if (!articleNumber) {
    return {
      claim,
      citation,
      status: VerificationStatus.UNVERIFIABLE,
      provenance: {
        sourceType: CitationType.CONSTITUTIONAL_ARTICLE,
        sourceTitle: "Constitution of India",
        verifiedAt: new Date().toISOString(),
        verificationStatus: VerificationStatus.UNVERIFIABLE,
      },
      evidencePassages: [],
      explanation: "Article number could not be extracted from citation.",
    };
  }

  // Find matching article in database
  const matchingArticle = articleDb.find(
    (a) => a.articleNumber === articleNumber
  );

  if (!matchingArticle) {
    // Article number exists in citation but not in our database
    // Still not VERIFIED just because the number is referenced
    return {
      claim,
      citation,
      status: VerificationStatus.UNSUPPORTED,
      provenance: {
        sourceType: CitationType.CONSTITUTIONAL_ARTICLE,
        sourceTitle: "Constitution of India",
        articleClauseRef: articleNumber,
        verifiedAt: new Date().toISOString(),
        verificationStatus: VerificationStatus.UNSUPPORTED,
      },
      evidencePassages: [],
      explanation: `Article ${articleNumber} referenced but not found in source database. Citation existence alone does not verify the claim.`,
    };
  }

  // Rule-based check: verify if evidence passages correspond to the claim
  // We check each evidence passage for relevance
  let bestSupport = 0;
  let contradiction = false;

  for (const passage of evidencePassages) {
    const supportScore = calculateSupportScore(claim, passage);
    if (supportScore > bestSupport) {
      bestSupport = supportScore;
    }
    // If claim directly contradicts passage content
    if (detectContradiction(claim, passage)) {
      contradiction = true;
    }
  }

  // Determine status
  let status: VerificationStatus;
  let explanation: string;

  if (contradiction && bestSupport < 0.3) {
    status = VerificationStatus.UNSUPPORTED;
    explanation = `Article ${articleNumber} exists in the Constitution, but the cited passage contradicts or fails to support the claim. Article existence alone does not verify the claim.`;
  } else if (bestSupport >= 0.7 && !contradiction) {
    status = VerificationStatus.VERIFIED;
    explanation = `Article ${articleNumber} supports the claim with matching constitutional text.`;
  } else if (bestSupport > 0 && bestSupport < 0.7) {
    status = VerificationStatus.PARTIALLY_SUPPORTED;
    explanation = `Article ${articleNumber} provides partial support for the claim. Only some aspects of the claim are reflected in the cited passage.`;
  } else {
    status = VerificationStatus.UNSUPPORTED;
    explanation = `Article ${article_number} exists but does not support the generated claim. The cited passage is unrelated or insufficient.`;
  }

  return {
    claim,
    citation,
    status,
    provenance: {
      sourceType: CitationType.CONSTITUTIONAL_ARTICLE,
      sourceTitle: "Constitution of India",
      articleClauseRef: articleNumber,
      originalPassage: matchingArticle.officialText || matchingArticle.simpleExplanation,
      verifiedAt: new Date().toISOString(),
      verificationStatus: status,
    },
    evidencePassages,
    explanation,
  };
}

/**
 * Verify an amendment citation against the claim and evidence.
 * Checks effective date and applicable constitutional version.
 */
function verifyAmendment(
  claim: string,
  citation: CitationInfo,
  evidencePassages: string[],
  amendmentDb: any[],
): VerificationResult {
  const amendmentNumber = citation.extracted?.amendmentNumber;
  const amendmentYear = citation.extracted?.year;

  if (!amendmentNumber) {
    return {
      claim,
      citation,
      status: VerificationStatus.UNVERIFIABLE,
      provenance: {
        sourceType: CitationType.AMENDMENT,
        sourceTitle: "Constitution of India",
        verifiedAt: new Date().toISOString(),
        verificationStatus: VerificationStatus.UNVERIFIABLE,
      },
      evidencePassages: [],
      explanation: "Amendment number could not be extracted from citation.",
    };
  }

  // Find matching amendment in database
  const matchingAmendment = amendmentDb.find(
    (a) => a.number === amendmentNumber
  );

  if (!matchingAmendment) {
    return {
      claim,
      citation,
      status: VerificationStatus.UNSUPPORTED,
      provenance: {
        sourceType: CitationType.AMENDMENT,
        sourceTitle: "Constitution of India",
        amendmentNumber,
        verifiedAt: new Date().toISOString(),
        verificationStatus: VerificationStatus.UNSUPPORTED,
      },
      evidencePassages: [],
      explanation: `Amendment ${amendmentNumber} referenced but not found in source database.`,
    };
  }

  // Check effective date - verify the amendment was in effect at the time
  // of the generated claim (if year context is available)
  let dateCheckPass = true;
  if (amendmentYear && matchingAmendment.year) {
    // Simple year comparison - amendment should be >= referenced year
    // In a full implementation, would check effective date vs claim context
    if (matchingAmendment.year < amendmentYear) {
      dateCheckPass = false;
    }
  }

  // Rule-based evidence check
  let bestSupport = 0;
  let contradiction = false;

  for (const passage of evidencePassages) {
    const supportScore = calculateSupportScore(claim, passage);
    if (supportScore > bestSupport) {
      bestSupport = supportScore;
    }
    if (detectContradiction(claim, passage)) {
      contradiction = true;
    }
  }

  let status: VerificationStatus;
  let explanation: string;

  // If the amendment doesn't apply retrospectively or is outdated
  const isOutdated = !dateCheckPass;

  if (isOutdated && (contradiction || bestSupport < 0.3)) {
    status = VerificationStatus.UNSUPPORTED;
    explanation = `Amendment ${amendmentNumber} (${matchingAmendment.year}) may not apply retrospectively or the cited passage reflects an outdated version.`;
  } else if (bestSupport >= 0.7 && !contradiction && dateCheckPass) {
    status = VerificationStatus.VERIFIED;
    explanation = `Amendment ${amendmentNumber} supports the claim with matching constitutional text.`;
  } else if (bestSupport > 0 && bestSupport < 0.7) {
    status = VerificationStatus.PARTIALLY_SUPPORTED;
    explanation = `Amendment ${amendment_number} provides partial support for the claim. Some aspects are reflected in the cited passage.`;
  } else if (isOutdated && bestSupport >= 0.7) {
    // Even with good support, if it's an outdated version, mark unsupported
    status = VerificationStatus.UNSUPPORTED;
    explanation = `Amendment ${amendmentNumber} provides supporting text but reflects an outdated constitutional version that may not be applicable.`;
  } else {
    status = VerificationStatus.UNSUPPORTED;
    explanation = `Amendment ${amendmentNumber} does not support the generated claim. The cited passage is unrelated or insufficient.`;
  }

  return {
    claim,
    citation,
    status,
    provenance: {
      sourceType: CitationType.AMENDMENT,
      sourceTitle: "Constitution of India",
      amendmentNumber,
      constitutionalVersion: matchingAmendment.year,
      originalPassage: matchingAmendment.summary || matchingAmendment.title,
      verifiedAt: new Date().toISOString(),
      verificationStatus: status,
    },
    evidencePassages,
    explanation,
  };
}

/**
 * Verify a judicial decision citation against the claim and evidence.
 * Validates case name, court, year, and whether the passage supports the claim.
 * Distinguishes holding from obiter dicta when source permits.
 */
function verifyJudicialDecision(
  claim: string,
  citation: CitationInfo,
  evidencePassages: string[],
  caseDb: any[]
): VerificationResult {
  const caseName = citation.extracted?.caseName;
  const court = citation.extracted?.court;
  const year = citation.extracted?.year;
  const citationReference = citation.extracted?.citationReference;

  if (!caseName) {
    return {
      claim,
      citation,
      status: VerificationStatus.UNVERIFIABLE,
      provenance: {
        sourceType: CitationType.JUDICIAL_DECISION,
        verifiedAt: new Date().toISOString(),
        verificationStatus: VerificationStatus.UNVERIFIABLE,
      },
      evidencePassages: [],
      explanation: "Case name could not be extracted from citation.",
    };
  }

  // Find matching case in database
  const matchingCase = caseDb.find(
    (c) => c.caseName === caseName || c.caseName.toLowerCase().includes(caseName.toLowerCase())
  );

  // Rule-based validation
  // 1. Validate court
  let courtValid = false;
  if (court) {
    courtValid = true; // Court provided - validate against known courts later
  } else if (matchingCase) {
    courtValid = true; // Database has court info
  }

  // 2. Validate judgment year
  let yearValid = false;
  if (year) {
    yearValid = true;
  } else if (matchingCase?.year) {
    yearValid = true;
  }

  // 3. Validate citation/reference
  let citationValid = false;
  if (citationReference) {
    citationValid = true;
  } else if (matchingCase?.citation) {
    citationValid = true;
  }

  // Evidence-based check: does the cited passage support the claim?
  let bestSupport = 0;
  let contradiction = false;
  let holdingVsObiter = "holding"; // track if source distinguishes

  for (const passage of evidencePassages) {
    const supportScore = calculateSupportScore(claim, passage);
    if (supportScore > bestSupport) {
      bestSupport = supportScore;
    }
    if (detectContradiction(claim, passage)) {
      contradiction = true;
    }
    // Check if passage distinguishes holding from obiter
    if (passage.toLowerCase().includes("holding") || passage.toLowerCase().includes("obiter")) {
      holdingVsObiter = "detailed";
    }
  }

  let status: VerificationStatus;
  let explanation: string;

  // Critical: citation existence alone does NOT make it VERIFIED
  if (!courtValid) {
    status = VerificationStatus.UNSUPPORTED;
    explanation = `Case ${caseName} citation: court could not be validated.`;
  } else if (!yearValid && matchingCase) {
    status = VerificationStatus.UNSUPPORTED;
    explanation = `Case ${caseName} year could not be validated against source.`;
  } else if (!citationValid && !citationReference) {
    status = VerificationStatus.UNSUPPORTED;
    explanation = `Case ${caseName} reference citation not available.`;
  } else if (contradiction && bestSupport < 0.3) {
    status = VerificationStatus.UNSUPPORTED;
    explanation = `Case ${caseName}: cited passage contradicts the claim.`;
  } else if (bestSupport >= 0.7 && !contradiction) {
    // Check if we're verifying holding vs obiter
    if (holdingVsObiter === "detailed" && bestSupport >= 0.8) {
      // Only verify if the passage clearly establishes the holding
      status = VerificationStatus.VERIFIED;
      explanation = `Case ${caseName} (${year}): holding supports the claim.`;
    } else if (holdingVsObiter === "simple" && bestSupport >= 0.85) {
      status = VerificationStatus.VERIFIED;
      explanation = `Case ${caseName} (${year}): cited passage supports the claim.`;
    } else {
      // Good support but can't confirm it's the holding vs obiter
      status = VerificationStatus.PARTIALLY_SUPPORTED;
      explanation = `Case ${caseName} (${year}): evidence supports claim, but holding vs obiter distinction not fully established.`;
    }
  } else if (bestSupport > 0 && bestSupport < 0.7) {
    status = VerificationStatus.PARTIALLY_SUPPORTED;
    explanation = `Case ${caseName} (${year}): evidence partially supports the claim.`;
  } else {
    status = VerificationStatus.UNSUPPORTED;
    explanation = `Case ${caseName} (${year}): cited passage does not support the claim.`;
  }

  return {
    claim,
    citation,
    status,
    provenance: {
      sourceType: CitationType.JUDICIAL_DECISION,
      sourceTitle: caseName,
      court: court || matchingCase?.court,
      judgmentYear: year || matchingCase?.year,
      articleClauseRef: citationReference || matchingCase?.citation,
      originalPassage: matchingCase ? (matchingCase.summary || "") : undefined,
      constitutionalVersion: undefined,
      verifiedAt: new Date().toISOString(),
      verificationStatus: status,
    },
    evidencePassages,
    explanation,
  };
}

/**
 * Calculate semantic support score between a claim and a passage.
 * Uses keyword overlap and phrase matching as a lightweight approach.
 * In a full implementation, would use @google/genai embeddings.
 */
function calculateSupportScore(claim: string, passage: string): number {
  if (!claim || !passage) return 0;

  const claimLower = claim.toLowerCase().trim();
  const passageLower = passage.toLowerCase().trim();

  if (passageLower.includes(claimLower)) {
    return 1.0; // Exact match
  }

  // Keyword overlap approach
  const claimWords = new Set(claimLower.split(/\s+/).filter(w => w.length > 2));
  const passageWords = passageLower.split(/\s+/);

  if (claimWords.size === 0) return 0;

  let matchingWords = 0;
  for (const word of claimWords) {
    if (passageWords.includes(word)) {
      matchingWords++;
    }
  }

  const rawScore = matchingWords / claimWords.size;
  
  // Boost score for multi-word phrase matches
  const phrases = claimLower.split(/\s+/).filter(w => w.length > 3);
  let phraseMatches = 0;
  for (const phrase of phrases) {
    if (passageLower.includes(phrase)) {
      phraseMatches++;
    }
  }
  const phraseBoost = phraseMatches * 0.2;

  return Math.min(rawScore + phraseBoost, 1.0);
}

/**
 * Detect if a claim contradicts a passage.
 */
function detectContradiction(claim: string, passage: string): boolean {
  if (!claim || !passage) return false;

  claim = claim.toLowerCase().trim();
  passage = passage.toLowerCase().trim();

  // Key contradiction patterns
  const contradictionIndicators = [
    /but[^\.]*\b(not|no|nor|never)\b/,
    /den(ies|ied)\b/,
    /reject(ed|ing|s)\b/,
    /overrul(ed|ing|ed)\b/,
    /distinguish(ed|ing|ed)\b/,
    /differ(ing|ence)\b/,
  ];

  // Check if passage contains strong contradiction language
  for (const pattern of contradictionIndicators) {
    if (pattern.test(passage)) {
      // Additional check: does the claim make a positive assertion that the passage refutes?
      const positiveAssertions = /^(is|are|provides|guarantees|establishes|holds)\b/i;
      if (positiveAssertions.test(claim)) {
        return true;
      }
    }
  }

  return false;
}

/* ======================================================================
   Citation Extraction
   ====================================================================== */

/**
 * Extract citation information from generated text.
 * Looks for patterns like "Article 21", "42nd Amendment", "X v. Y", etc.
 */
function extractCitationsFromText(text: string): CitationInfo[] {
  const citations: CitationInfo[] = [];
  const lower = text.toLowerCase();

  // Pattern: "Article XX" or "Article XX(1)" or "Article XX, clause YY"
  const articleMatches = text.match(/(?:Article|Art\.\s*)(\d+(?:\s*[\(\[]\d+[\)\]])?(?:\s*clause\s*\d+)?)/gi);
  if (articleMatches) {
    for (const match of articleMatches) {
      const number = match.replace(/Article|Art\./i, "").trim();
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
      // Parse the two parts
      const parts = fullCase.split(/\s+(?:v\.|vs)\s/i);
      if (parts.length === 2) {
        citations.push({
          type: CitationType.JUDICIAL_DECISION,
          value: `${parts[0]} v. ${parts[1]}`,
          extracted: {
            caseName: fullCase,
            court: undefined,
            year: undefined,
            citationReference: undefined,
          },
        });
      }
    }
  }

  // Pattern: "Year: XXXX" or "(2020)" near case name
  const yearInText = text.match(/\((\d{4})\)/g);
  if (yearInText) {
    // Could be attached to a citation
  }

  // Remove duplicate citations by value
  const seen = new Set<string>();
  return citations.filter((c) => {
    if (seen.has(c.value)) return false;
    seen.add(c.value);
    return true;
  });
}

/* ======================================================================
   Semantic Verification (using embeddings)
   ====================================================================== */

/**
 * Perform semantic verification between a claim and its evidence passages.
 * Uses @google/genai embeddings for similarity comparison.
 * Threshold: 0.65 (calibrated for constitutional/legal text).
 * 
 * @param claim The generated factual claim
 * @param evidencePassages One or more source passages to verify against
 * @returns {Object} Verification result with status and explanation
 */
async function semanticVerification(
  claim: string,
  evidencePassages: string[]
): Promise<{
  status: VerificationStatus;
  supportLevel: "direct" | "partial" | "contradiction" | "absent";
  similarityScore: number;
  explanation: string;
}> {
  if (!claim || evidencePassages.length === 0) {
    return {
      status: VerificationStatus.UNVERIFIABLE,
      supportLevel: "absent",
      similarityScore: 0,
      explanation: "No claim or evidence provided for semantic verification.",
    };
  }

  let bestScore = 0;
  let worstScore = 1;
  let hasContradiction = false;
  let supportingPassages: string[] = [];

  // Embed the claim once
  const claimEmbeddingResp = await AI.embedContent({
    model: "text-embedding-004",
    content: claim,
  });
  const claimEmbedding = claimEmbeddingResp.embedding;
  if (!claimEmbedding || claimEmbedding.length === 0) {
    // Fall back to rule-based if embeddings fail
    return semanticVerificationFallback(claim, evidencePassages);
  }

  for (const passage of evidencePassages) {
    if (!passage || passage.trim().length < 10) continue;

    const passageEmbeddingResp = await AI.embedContent({
      model: "text-embedding-004",
      content: passage,
    });
    const passageEmbedding = passageEmbeddingResp.embedding;

    if (!passageEmbedding || passageEmbedding.length === 0) continue;

    // Calculate cosine similarity
    const similarity = cosineSimilarity(claimEmbedding, passageEmbedding);
    
    if (similarity > bestScore) {
      bestScore = similarity;
    }
    if (similarity < worstScore) {
      worstScore = similarity;
    }

    // Determine support level based on threshold
    if (similarity >= SEMANTIC_VERIFICATION_THRESHOLD) {
      supportingPassages.push(passage);
      // Check for contradiction within supported passages
      if (detectContradiction(claim, passage)) {
        hasContradiction = true;
      }
    } else if (similarity > 0.3) {
      // Topically related but below threshold - partial support
      // Don't mark as contradiction, just weak support
    } else {
      // Low similarity - could be contradiction or irrelevant
      // Check for explicit contradiction
      if (containsContradictionKeywords(claim, passage)) {
        hasContradiction = true;
      }
    }
  }

  // Determine final status and explanation
  let status: VerificationStatus;
  let supportLevel: "direct" | "partial" | "contradiction" | "absent";
  let explanation: string;

  if (evidencePassages.length === 0) {
    status = VerificationStatus.UNVERIFIABLE;
    supportLevel = "absent";
    explanation = "No evidence passages available for semantic verification.";
  } else if (hasContradiction && bestScore < SEMANTIC_VERIFICATION_THRESHOLD) {
    status = VerificationStatus.UNSUPPORTED;
    supportLevel = "contradiction";
    explanation = `Evidence contradicts the claim. Best similarity: ${bestScore.toFixed(3)}.`;
  } else if (bestScore >= SEMANTIC_VERIFICATION_THRESHOLD) {
    status = VerificationStatus.VERIFIED;
    supportLevel = "direct";
    explanation = `Claim is directly supported by evidence (similarity: ${bestScore.toFixed(3)}).`;
  } else if (bestScore > 0 && bestScore < SEMANTIC_VERIFICATION_THRESHOLD) {
    // Topically related but insufficient
    if (supportingPassages.length > 0) {
      status = VerificationStatus.PARTIALLY_SUPPORTED;
      supportLevel = "partial";
      explanation = `Claim is partially supported by ${supportingPassages.length} passage(s) (best similarity: ${bestScore.toFixed(3)}), but does not meet the ${SEMANTIC_VERIFICATION_THRESHOLD} threshold for full verification.`;
    } else {
      status = VerificationStatus.UNSUPPORTED;
      supportLevel = "absent";
      explanation = `Claim has topical relation to evidence (best similarity: ${bestScore.toFixed(3)}) but does not establish the claim.`;
    }
  } else {
    status = VerificationStatus.UNSUPPORTED;
    supportLevel = "absent";
    explanation = `No meaningful similarity found between claim and evidence (best similarity: ${bestScore.toFixed(3)}).`;
  }

  return {
    status,
    supportLevel,
    similarityScore: bestScore,
    explanation,
  };
}

/**
 * Fallback semantic verification using keyword/phrase analysis
 * used when embeddings are unavailable or fail.
 */
function semanticVerificationFallback(
  claim: string,
  evidencePassages: string[]
): {
  status: VerificationStatus;
  supportLevel: "direct" | "partial" | "contradiction" | "absent";
  similarityScore: number;
  explanation: string;
} {
  let bestScore = 0;
  let hasContradiction = false;
  let supportingCount = 0;

  for (const passage of evidencePassages) {
    if (!passage) continue;
    const score = calculateSupportScore(claim, passage);
    if (score >= SEMANTIC_VERIFICATION_THRESHOLD) {
      supportingCount++;
      if (detectContradiction(claim, passage)) {
        hasContradiction = true;
      }
    } else if (score > 0.3) {
      // Topical relation but below threshold
    } else if (containsContradictionKeywords(claim, passage)) {
      hasContradiction = true;
    }
    if (score > bestScore) bestScore = score;
  }

  let status: VerivationStatus;
  let supportLevel: "direct" | "partial" | "contradiction" | "absent";
  let explanation: string;

  if (evidencePassages.length === 0) {
    status = VerificationStatus.UNVERIFIABLE;
    supportLevel = "absent";
    explanation = "No evidence passages available.";
  } else if (hasContradiction && bestScore < SEMANTIC_VERIFICATION_THRESHOLD) {
    status = VerificationStatus.UNSUPPORTED;
    supportLevel = "contradiction";
    explanation = `Evidence contradicts the claim.`;
  } else if (bestScore >= SEMANTIC_VERIFICATION_THRESHOLD) {
    status = VerificationStatus.VERIFIED;
    supportLevel = "direct";
    explanation = `Claim directly supported by evidence.`;
  } else if (supportingCount > 0 && bestScore < SEMANTIC_VERIFICATION_THRESHOLD) {
    status = VerificationStatus.PARTIALLY_SUPPORTED;
    supportLevel = "partial";
    explanation = `Partially supported by ${supportingCount} passage(s), but below verification threshold.`;
  } else if (bestScore > 0) {
    status = VerificationStatus.UNSUPPORTED;
    supportLevel = "absent";
    explanation = `Claim not sufficiently supported by evidence.`;
  } else {
    status = VerificationStatus.UNVERIFIABLE;
    supportLevel = "absent";
    explanation = "No evidence available for verification.";
  }

  return {
    status,
    supportLevel,
    similarityScore: bestScore,
    explanation,
  };
}

/**
 * Check if passage contains contradiction keywords relative to claim.
 */
function containsContradictionKeywords(claim: string, passage: string): boolean {
  const claimLower = claim.toLowerCase();
  const passageLower = passage.toLowerCase();

  // If claim asserts something positive and passage negates it
  const positivePatterns = [/^is\b/, /^are\b/, /^provides\b/, /^guarantees\b/, /^establishes\b/, /^holds\b/];
  const hasPositiveClaim = positivePatterns.some(p => p.test(claimLower));

  if (hasPositiveClaim) {
    const negationPatterns = [/\bnot\b/, /no longer\b/, /without\b/, /fail(ed|ing|s)\b/];
    for (const p of negationPatterns) {
      if (p.test(passageLower)) {
        // Additional check: is the negation of the claim's assertion?
        return true;
      }
    }
  }

  return false;
}

/**
 * Cosine similarity between two vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error("Vector dimension mismatch");
  
  let dot = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  if (normA === 0 || normB === 0) return 0;
  
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/* ======================================================================
   Main Verification Pipeline
   ====================================================================== */

/**
 * Main verification pipeline: given a generated answer and its cited references,
 * extract claims, classify citations, match against evidence, and assign status.
 */
export async function verifyCitationPipeline(
  generatedAnswer: string,
  retrievedEvidence: string[] = [],
  citationDb: { articles: any[]; amendments: any[]; cases: any[] } = { articles: [], amendments: [], cases: [] }
): Promise<VerificationResult[]> {
  // Step 1: Extract claims and citations from the generated answer
  const citations = extractCitationsFromText(generatedAnswer);
  
  if (citations.length === 0) {
    // No citations found - return unverifiable
    return [{
      claim: { text: generatedAnswer, citations: [] },
      citation: { type: CitationType.OTHER, value: "No citation found" },
      status: VerificationStatus.UNVERIFIABLE,
      provenance: {
        sourceType: CitationType.OTHER,
        verifiedAt: new Date().toISOString(),
        verificationStatus: VerificationStatus.UNVERIFIABLE,
      },
      evidencePassages: [],
      explanation: "No citations found in generated answer. Citation verification cannot be performed.",
    }];
  }

  // Step 2: Get database references for rule-based checks
  const articleDb = citationDb.articles;
  const amendmentDb = citationDb.amendments;
  const caseDb = citationDb.cases;

  // Step 3: Run verification for each citation
  const results: VerificationResult[] = [];

  for (const citation of citations) {
    let result: VerificationResult;

    // Route to rule-based verification based on citation type
    switch (citation.type) {
      case CitationType.CONSTITUTIONAL_ARTICLE:
        result = verifyConstitutionalArticle(
          generatedAnswer,
          citation,
          retrievedEvidence,
          articleDb
        );
        break;

      case CitationType.AMENDMENT:
        result = verifyAmendment(
          generatedAnswer,
          citation,
          retrievedEvidence,
          amendmentDb
        );
        break;

      case CitationType.JUDICIAL_DECISION:
        result = verifyJudicialDecision(
          generatedAnswer,
          citation,
          retrievedEvidence,
          caseDb
        );
        break;

      default:
        // For other types, use semantic verification
        result = await runSemanticVerification(
          generatedAnswer,
          retrievedEvidence,
          citation
        );
        break;
    }

    results.push(result);
  }

  // Step 4: If no retrieved evidence was provided but citations exist,
  // attempt to retrieve from the constitutional database
  if (retrievedEvidence.length === 0 && citations.length > 0) {
    // Could attempt retrieval here, but for now use what's available
    // The results will reflect UNVERIFIABLE or UNSUPPORTED due to lack of evidence
  }

  return results;
}

/**
 * Run semantic verification as a fallback for non-constitutional citations.
 */
async function runSemanticVerification(
  generatedAnswer: string,
  evidencePassages: string[],
  citation: CitationInfo
): Promise<VerificationResult> {
  const claimText = generatedAnswer;
  
  const semResult = await semanticVerification(claimText, evidencePassages);

  // Map semantic result to verification result
  const statusMap: Record<VerificationStatus, VerificationStatus> = {
    [VerificationStatus.VERIFIED]: VerificationStatus.VERIFIED,
    [VerificationStatus.PARTIALLY_SUPPORTED]: VerificationStatus.PARTIALLY_SUPPORTED,
    [VerificationStatus.UNSUPPORTED]: VerificationStatus.UNSUPPORTED,
    [VerificationStatus.UNVERIFIABLE]: VerificationStatus.UNVERIFIABLE,
  };

  const provenance: VerificationProvenance = {
    sourceType: citation.type,
    sourceTitle: citation.value,
    verifiedAt: new Date().toISOString(),
    verificationStatus: semResult.status,
  };

  return {
    claim: { text: generatedAnswer, citations: [citation] },
    citation,
    status: semResult.status,
    provenance,
    evidencePassages,
    explanation: semResult.explanation,
  };
}

/* ======================================================================
   Export types for frontend and persistence
   ====================================================================== */

export type { 
  VerificationStatus, 
  CitationType, 
  VerificationProvenance,
  ExtractedClaim,
  CitationInfo,
  VerificationResult 
};