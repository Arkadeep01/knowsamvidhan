import { NextRequest, NextResponse } from "next/server";

import { runBenchmarkEvaluation, GOLDEN_BENCHMARK_CASES } from "@/lib/evaluationRunner";
import { prisma } from "@/lib/prisma";

const MAX_CONCURRENT_RUNS = 1;
const EVALUATION_TIMEOUT_MS = 600000; // 10 minutes
const RETRY_ATTEMPTS = 2;
const RETRY_DELAY_MS = 5000;

const runningRuns = new Set();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      modelId,
      promptVersion,
      retrievalK,
      trigger = "manual",
    } = body;

    // Authorization check - in production, this would verify admin JWT
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Authorization header missing or invalid" },
        { status: 401 }
      );
    }

    const providedToken = authHeader.replace("Bearer ", "");
    // In production, validate against admin JWT tokens
    // For now, allow if token is provided

    // Prevent concurrent duplicate evaluation runs
    if (runningRuns.has(trigger)) {
      return NextResponse.json(
        { error: "An evaluation run is already in progress" },
        { status: 429 }
      );
    }

    runningRuns.add(trigger);

    try {
      // Set timeout for the evaluation
      const evaluationPromise = runBenchmarkEvaluation(
        modelId || "gemini-3.5-flash-lite",
        retrievalK || 5,
        promptVersion || "v1"
      );

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error("Evaluation timed out after 10 minutes"));
        }, EVALUATION_TIMEOUT_MS);
      });

      const run = await Promise.race([evaluationPromise, timeoutPromise]);

      return NextResponse.json({
        success: true,
        runId: run.id,
        benchmarkVersion: run.benchmarkVersion,
        modelId: run.modelId,
        promptVersion: run.promptVersion,
        retrievalK: run.retrievalK,
        status: run.status,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        metrics: {
          citationAccuracy: run.metrics.citationAccuracy,
          groundingRate: run.metrics.groundingRate,
          unsupportedClaimRate: run.metrics.unsupportedClaimRate,
          unverifiableCitationRate: run.metrics.unverifiableCitationRate,
          citationVerificationCoverage: run.metrics.citationVerificationCoverage,
          retrievalRelevance: run.metrics.retrievalRelevance,
          evidenceSufficiency: run.metrics.evidenceSufficiency,
          evaluationFailureRate: run.metrics.evaluationFailureRate,
          averageLatencyMs: run.metrics.averageLatencyMs,
        },
        caseCount: {
          total: run.totalCases,
          passed: run.passedCases,
          failed: run.failedCases,
          skipped: run.skippedCases,
        },
        caseResults: run.cases.map((c) => ({
          id: c.benchmarkCaseId,
          query: c.query,
          verificationStatus: c.verificationStatus,
          generationStatus: c.generationStatus,
          evaluationError: c.evaluationError,
          skippedReason: c.skippedReason,
        })),
        message: "Benchmark evaluation completed successfully",
      });
    } catch (error: any) {
      console.error("Evaluation run failed:", error);
      return NextResponse.json(
        {
          error: error.message || "Evaluation run failed",
        },
        { status: 500 }
      );
    } finally {
      runningRuns.delete(trigger);
    }
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}

/**
 * GET: Retrieve evaluation run status and historical results
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const runId = searchParams.get("runId");
  const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit") as string) : 10;

  if (runId) {
    // Retrieve specific run from database
    try {
      const run = await prisma.evaluationRun.findUnique({
        where: { id: runId },
        include: {
          cases: {
            orderBy: { startedAt: "desc" },
            take: 50,
          },
        },
      });

      if (!run) {
        return NextResponse.json(
          { error: "Evaluation run not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({ run });
    } catch (error: any) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }
  }

  // List latest runs
  try {
    const runs = await prisma.evaluationRun.findMany({
      orderBy: { startedAt: "desc" },
      take: limit,
      include: {
        _count: {
          select: { cases: true },
        },
      },
    });

    return NextResponse.json({ runs });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
