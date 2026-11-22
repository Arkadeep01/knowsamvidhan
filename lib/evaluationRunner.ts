/**
 * Samvi Evaluation Runner — 120-Case Golden Benchmark Evaluation
 * 
 * Executes the Samvi retrieval and generation pipeline against the golden benchmark
 * and evaluates results using the existing citation-verification pipeline.
 * 
 * Records per-case results, failure reasons, and calculates aggregate metrics.
 * Makes runs reproducible and preserves historical results.
 */

import { GoogleGenAI } from "@google/genai";
import { prisma } from "./lib/prisma";
import { verifyCitationPipeline } from "./lib/verification";
import { GOLDEN_BENCHMARK_CASES } from "./lib/goldenBenchmark";

const PRIMARY_MODEL = "gemini-3.5-flash-lite";
const BACKUP_MODEL = "gemini-3.5-flash";

const AI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
});

interface EvaluationCaseResult {
  benchmarkCaseId: string;
  query: string;
  generatedAnswer: string | null;
  citations: string[];
  verificationStatus: "VERIFIED" | "PARTIALLY_SUPPORTED" | "UNSUPPORTED" | "UNVERIFIABLE" | "ERROR" | "SKIPPED";
  verificationDetails: {
    status: string;
    explanation: string;
  } | null;
  retrievalStatus: "SUCCESS" | "FAILURE" | "SKIPPED";
  retrievalDetails: {
    relevantArticles: string[];
    retrievalLatencyMs: number;
  } | null;
  generationStatus: "SUCCESS" | "FAILURE" | "SKIPPED";
  generationDetails: {
    model: string;
    latencyMs: number;
    error?: string;
  } | null;
  evaluationError?: string;
  skippedReason?: string;
}

interface EvaluationRun {
  id: string;
  benchmarkVersion: string;
  modelId: string;
  promptVersion: string;
  retrievalK: number;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  skippedCases: number;
  metrics: {
    citationAccuracy: number;
    groundingRate: number;
    unsupportedClaimRate: number;
    unverifiableCitationRate: number;
    citationVerificationCoverage: number;
    retrievalRelevance: number;
    evidenceSufficiency: number;
    evaluationFailureRate: number;
    averageLatencyMs: number;
  };
  startedAt: Date;
  completedAt: Date | null;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  cases: EvaluationCaseResult[];
}

// Run the evaluation pipeline for a single case
async function evaluateSingleCase(
  caseData: typeof GOLDEN_BENCHMARK_CASES[number]
): Promise<EvaluationCaseResult> {
  const startTime = Date.now();
  const result: EvaluationCaseResult = {
    benchmarkCaseId: caseData.id,
    query: caseData.query,
    generatedAnswer: null,
    citations: [],
    verificationStatus: "SKIPPED",
    verificationDetails: null,
    retrievalStatus: "SKIPPED",
    retrievalDetails: null,
    generationStatus: "SKIPPED",
    generationDetails: null,
    evaluationError: undefined,
    skippedReason: undefined,
  };

  // Skip cases where ground truth is missing
  if (caseData.groundTruthMissing) {
    result.skippedReason = "groundTruthMissing";
    result.verificationStatus = "UNVERIFIABLE";
    return result;
  }

  try {
    // Step 1: Execute retrieval for the query
    retrievalStart = Date.now();
    
    // Use the hybrid retrieval pipeline to find relevant evidence
    // This is a simplified version - in production this would use the full hybrid retrieval
    const relevantArticles = await retrieveRelevantEvidence(caseData.query);
    
    const retrievalLatency = Date.now() - retrievalStart;
    
    result.retrievalStatus = "SUCCESS";
    result.retrievalDetails = {
      relevantArticles,
      retrievalLatencyMs: retrievalLatency,
    };

    // Step 2: Generate answer using the Gemini model
    generationStart = Date.now();
    
    const systemPrompt =
      "You are Samvi, a constitutional AI assistant knowledgeable about the Constitution of India. Provide accurate, grounded responses with citations to articles, cases, and amendments when applicable. Use a helpful, educational tone.";

    const generationResponse = await AI.models.generateContent({
      model: PRIMARY_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { text: systemPrompt },
            { text: caseData.query },
          ],
        },
      ],
    });

    const generationLatency = Date.now() - generationStart;
    
    if (!generationResponse || !generationResponse.candidates) {
      result.generationStatus = "FAILURE";
      result.evaluationError = "No generation response received";
      return result;
    }

    const generatedText =
      generationResponse.candidates[0]?.content?.parts?.[0]?.text || "";

    result.generatedAnswer = generatedText;
    result.generationStatus = "SUCCESS";
    result.generationDetails = {
      model: PRIMARY_MODEL,
      latencyMs: generationLatency,
    };

    // Step 3: Extract citations from the generated answer
    const extractedCitations = extractCitationsFromText(generatedText);
    result.citations = extractedCitations.map((c) => c.value);

    // Step 4: Run the citation verification pipeline
    // This uses the existing verification infrastructure
    const verificationResult = await verifyCitationPipeline(
      generatedText,
      [], // retrievedEvidence - we'll use the retrieved articles
      { articles: relevantArticles.map((a) => ({ articleNumber: a }) }) }
    );

    // The pipeline returns results for each citation found in the text
    // We need to determine the overall verification status
    if (verificationResult.length === 0) {
      // No citations found in the generated answer
      result.verificationStatus = "UNVERIFIABLE";
      result.verificationDetails = {
        status: "UNVERIFIABLE",
        explanation: "No citations found in generated answer. Cannot verify without citations.",
      };
    } else {
      // Determine overall status based on verification results
      const verifiedCount = verificationResult.filter(
        (r) => r.status === "VERIFIED"
      ).length;
      const partiallySupportedCount = verificationResult.filter(
        (r) => r.status === "PARTIALLY_SUPPORTED"
      ).length;
      const unsupportedCount = verificationResult.filter(
        (r) => r.status === "UNSUPPORTED"
      ).length;
      const unverifiableCount = verificationResult.filter(
        (r) => r.status === "UNVERIFIABLE"
      ).length;

      if (verifiedCount === verificationResult.length && verifiedCount > 0) {
        result.verificationStatus = "VERIFIED";
      } else if (partiallySupportedCount > 0 && verifiedCount === 0) {
        result.verificationStatus = "PARTIALLY_SUPPORTED";
      } else if (unsupportedCount === verificationResult.length) {
        result.verificationStatus = "UNSUPPORTED";
      } else if (unverifiableCount === verificationResult.length) {
        result.verificationStatus = "UNVERIFIABLE";
      } else {
        // Mixed status - use the most severe
        if (unsupportedCount > 0) {
          result.verificationStatus = "UNSUPPORTED";
        } else if (partiallySupportedCount > 0) {
          result.verificationStatus = "PARTIALLY_SUPPORTED";
        } else if (verifiedCount > 0) {
          result.verificationStatus = "VERIFIED";
        } else {
          result.verificationStatus = "UNVERIFIABLE";
        }
      }

      result.verificationDetails = {
        status: result.verificationStatus,
        explanation: verificationResult.length > 0
          ? `${verificationResult.length} citation(s) evaluated: ${verificationResult
              .map((r) => `${r.status}: ${r.explanation || "no explanation"}`)
              .join("; ")}`
          : "no citations evaluated",
      };
    }

    return result;

  } catch (error: any) {
    console.error(`Evaluation error for case ${caseData.id}:`, error.message);
    
    result.evaluationError = error.message;
    result.verificationStatus = "ERROR";
    result.generationStatus = "FAILURE";
    result.skippedReason = "evaluation-error";
    
    return result;
  }
}

// Retrieve relevant evidence for a query using the hybrid retrieval approach
async function retrieveRelevantEvidence(query: string): Promise<string[]> {
  // This is a placeholder for the hybrid retrieval pipeline
  // In production, this would use the hybridRetrieval engine with Jaccard/lexical similarity
  // For now, we'll use a simple keyword-based approach drawing from the constitutional knowledge base
  
  const relevant: string[] = [];
  const queryLower = query.toLowerCase();
  
  // Simple keyword matching against known articles
  const articleKeywords: Record<string, string[]> = {
    "article 21": ["21"],
    "article 14": ["14"],
    "article 19": ["19"],
    "article 25": ["25"],
    "article 32": ["32"],
    "fundamental rights": ["14", "19", "21", "25"],
    "directive principles": ["39", "45"],
    "president rule": ["356"],
    "emergency": ["352"],
  };
  
  for (const [keyword, articles] of Object.entries(articleKeywords)) {
    if (queryLower.includes(keyword)) {
      articles.forEach((a) => {
        if (!relevant.includes(a)) relevant.push(a);
      });
    }
  }
  
  // If no articles found via keywords, return empty (will be handled as SKIPPED/UNVERIFIABLE)
  return relevant.length > 0 ? relevant : [];
}

// Extract citation references from text (Article XX, XXth Amendment, Case Name patterns)
function extractCitationsFromText(text: string): { value: string; type: string; extracted?: any }[] {
  const citations: typeof extractCitationsFromText.type[] = [];
  const lower = text.toLowerCase();
  
  // Pattern: "Article XX" or "Article XX(1)" or "Article XX, clause YY"
  const articleMatches = text.match(/(?:Article|Art\.\s*)(\d+(?:\s*[\(\[]\d+[\)\]])?(?:\s*clause\s*\d+)?)/gi);
  if (articleMatches) {
    for (const match of articleMatches) {
      const number = match.replace(/Article|Art./i, "").trim();
      citations.push({
        type: "CONSTITUTIONAL_ARTICLE",
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
        type: "AMENDMENT",
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
          type: "JUDICIAL_DECISION",
          value: `${parts[0]} v. ${parts[1]}`,
          extracted: { caseName: fullCase },
        });
      }
    }
  }
  
  // Remove duplicates by value
  const seen = new Set<string>();
  return citations.filter((c) => {
    if (seen.has(c.value)) return false;
    seen.add(c.value);
    return true;
  });
}

// Run the full 120-case benchmark evaluation
export async function runBenchmarkEvaluation(
  modelId: string = PRIMARY_MODEL,
  retrievalK: number = 5,
  promptVersion: string = "v1"
): Promise<EvaluationRun> {
  const runId = `eval_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const benchmarkVersion = "1.0.0";
  const totalCases = GOLDEN_BENCHMARK_CASES.length;
  
  const run: EvaluationRun = {
    id: runId,
    benchmarkVersion,
    modelId,
    promptVersion,
    retrievalK,
    totalCases,
    passedCases: 0,
    failedCases: 0,
    skippedCases: 0,
    metrics: {
      citationAccuracy: 0,
      groundingRate: 0,
      unsupportedClaimRate: 0,
      unverifiableCitationRate: 0,
      citationVerificationCoverage: 0,
      retrievalRelevance: 0,
      evidenceSufficiency: 0,
      evaluationFailureRate: 0,
      averageLatencyMs: 0,
    },
    startedAt: new Date(),
    completedAt: null,
    status: "RUNNING",
    cases: [],
  };
  
  console.log(`Starting benchmark evaluation: runId=${runId}, totalCases=${totalCases}, model=${modelId}`);
  
  const results: EvaluationCaseResult[] = [];
  let totalLatencyMs = 0;
  let verifiedCount = 0;
  let partiallySupportedCount = 0;
  let unsupportedCount = 0;
  let unverifiableCount = 0;
  let evaluatedCount = 0; // cases that actually had evaluable results
  let retrievalSuccessCount = 0;
  let generationSuccessCount = 0;
  
  // Process each benchmark case
  for (const caseData of GOLDEN_BENCHMARK_CASES) {
    const caseResult = await evaluateSingleCase(caseData);
    results.push(caseResult);
    
    // Track metrics
    const latency = caseResult.generationDetails?.latencyMs || 
                    caseResult.retrievalDetails?.latencyMs || 0;
    totalLatencyMs += latency;
    
    if (caseResult.skippedReason === "groundTruthMissing") {
      run.skippedCases++;
      continue;
    }
    
    evaluatedCount++;
    
    if (caseResult.skippedReason === "evaluation-error") {
      run.failedCases++;
      continue;
    }
    
    if (caseResult.retrievalStatus === "FAILURE" || caseResult.generationStatus === "FAILURE") {
      run.failedCases++;
      continue;
    }
    
    // Successfully evaluated case
    run.passedCases++;
    retrievalSuccessCount++;
    generationSuccessCount++;
    evaluatedCount++;
    totalLatencyMs += (caseResult.generationDetails?.latencyMs || 0) + (caseResult.retrievalDetails?.latencyMs || 0);
    
    switch (caseResult.verificationStatus) {
      case "VERIFIED":
        verifiedCount++;
        break;
      case "PARTIALLY_SUPPORTED":
        partiallySupportedCount++;
        break;
      case "UNSUPPORTED":
        unsupportedCount++;
        break;
      case "UNVERIFIABLE":
        unverifiableCount++;
        break;
      default:
        break;
    }
    
    // Track citation-related metrics
    if (caseResult.citations.length > 0) {
      // Counted for citation verification coverage
    }
  }
  
  // Calculate aggregate metrics
  const totalEvaluated = evaluatedCount;
  
  run.metrics.citationAccuracy = totalEvaluated > 0
    ? (verifiedCount + partiallySupportedCount) / totalEvaluated
    : 0;
    
  run.metrics.groundingRate = totalEvaluated > 0
    ? (verifiedCount + partiallySupportedCount) / totalEvaluated
    : 0;
    
  run.metrics.unsupportedClaimRate = totalEvaluated > 0
    ? unsupportedCount / totalEvaluated
    : 0;
    
  run.metrics.unverifiableCitationRate = totalEvaluated > 0
    ? unverifiableCount / totalEvaluated
    : 0;
    
  run.metrics.citationVerificationCoverage = totalCases > 0
    ? (evaluatedCount / totalCases) * 100
    : 0;
    
  run.metrics.retrievalRelevance = totalCases > 0
    ? retrievalSuccessCount / totalCases
    : 0;
    
  run.metrics.evidenceSufficiency = totalEvaluated > 0
    ? (verifiedCount + partiallySupportedCount) / totalEvaluated
    : 0;
    
  run.metrics.evaluationFailureRate = totalCases > 0
    ? (run.failedCases + run.skippedCases) / totalCases
    : 0;
    
  run.metrics.averageLatencyMs = totalCases > 0
    ? totalLatencyMs / totalCases
    : 0;
  
  run.cases = results;
  run.completedAt = new Date();
  run.status = "COMPLETED";
  
  // Persist the evaluation run to the database
  try {
    await prisma.evaluationRun.create({
      data: {
        id: runId,
        benchmarkVersion,
        modelId,
        promptVersion,
        retrievalK,
        totalCases,
        passedCases: run.passedCases,
        failedCases: run.failedCases,
        skippedCases: run.skippedCases,
        citationAccuracy: run.metrics.citationAccuracy,
        groundingRate: run.metrics.groundingRate,
        unsupportedClaimRate: run.metrics.unsupportedClaimRate,
        unverifiableCitationRate: run.metrics.unverifiableCitationRate,
        citationVerificationCoverage: run.metrics.citationVerificationCoverage,
        retrievalRelevance: run.metrics.retrievalRelevance,
        evidenceSufficiency: run.metrics.evidenceSufficiency,
        evaluationFailureRate: run.metrics.evaluationFailureRate,
        averageLatencyMs: run.metrics.averageLatencyMs,
        status: "COMPLETED",
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        cases: {
          create: run.cases.map((c) => ({
            benchmarkCaseId: c.benchmarkCaseId,
            query: c.query,
            generatedAnswer: c.generatedAnswer,
            citations: c.citations,
            verificationStatus: c.verificationStatus,
            verificationDetails: c.verificationDetails,
            retrievalStatus: c.retrievalStatus,
            retrievalDetails: c.retrievalDetails,
            generationStatus: c.generationStatus,
            generationDetails: c.generationDetails,
            evaluationError: c.evaluationError,
            skippedReason: c.skippedReason,
          })),
        },
      },
      include: {
        cases: true,
      },
    });
    console.log(`Evaluation run persisted to database: ${runId}`);
  } catch (dbError: any) {
    console.error("Failed to persist evaluation run:", dbError.message);
    // Continue without persisting - the run data is still in memory
  }
  
  console.log(`Benchmark evaluation completed: ${runId}`);
  console.log(`Metrics:`, run.metrics);
  console.log(`Results: ${verifiedCount} verified, ${partiallySupportedCount} partially supported, ${unsupportedCount} unsupported, ${unverifiableCount} unverifiable`);
  console.log(`Failed: ${run.failedCases}, Skipped: ${run.skippedCases}, Passed: ${run.passedCases}`);
  
  return run;
}

// Export the benchmark cases and runner for use
export { GOLDEN_BENCHMARK_CASES, evaluateSingleCase, runBenchmarkEvaluation };

console.log("Evaluation runner loaded successfully");
console.log(`Benchmark contains ${GOLDEN_BENCHMARK_CASES.length} cases covering categories A-Y`);