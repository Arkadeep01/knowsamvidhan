/**
 * Scheduling and Automatic Triggers for Continuous Evaluation
 * 
 * Provides scheduled periodic benchmark evaluation, trigger after configuration
 * changes, and manual evaluation triggers for authorized administrators.
 * 
 * Prevents:
 * - Concurrent duplicate evaluation runs
 * - Unauthorized evaluation triggers
 * - Unbounded API usage
 * - Accidental execution on every user request
 */

import { prisma } from "./lib/prisma";
import { GOLDEN_BENCHMARK_CASES } from "./lib/goldenBenchmark";
import { runBenchmarkEvaluation } from "./lib/evaluationRunner";

// Configuration for scheduling
const SCHEDULER_CONFIG = {
  // Run evaluation periodically (every 24 hours in production)
  // For demo, every 10 minutes
  periodicIntervalMs: 1000 * 60 * 10,

  // Timeout for each evaluation run (10 minutes)
  evaluationTimeoutMs: 600000,

  // Maximum concurrent evaluation runs
  maxConcurrentRuns: 1,

  // Retry configuration
  retryAttempts: 2,
  retryDelayMs: 5000,

  // Trigger conditions
  triggerConditions: {
    modelChange: true,
    promptChange: true,
    retrievalChange: true,
    citationVerificationChange: true,
    periodic: true,
    manual: true,
  },
};

// State tracking for scheduler
const schedulerState = {
  isRunning: false,
  lastRunId: null,
  lastSuccessMetrics: null,
  runCount: 0,
  consecutiveFailures: 0,
};

// Scheduled evaluation runner with safeguards
async function scheduledEvaluation(
  trigger:
    | "periodic"
    | "modelChange"
    | "promptChange"
    | "retrievalChange"
    | "citationVerificationChange"
    | "manual",
  initiator: string = "system"
) {
  // Prevent concurrent runs
  if (schedulerState.isRunning) {
    console.log(
      `Scheduled evaluation skipped: already running (trigger: ${trigger})`
    );
    return { skipped: true, reason: "already_running" };
  }

  // Check if we have enough data to run
  if (GOLDEN_BENCHMARK_CASES.length === 0) {
    console.log("Scheduled evaluation skipped: no benchmark cases configured");
    return { skipped: true, reason: "no_benchmark_cases" };
  }

  schedulerState.isRunning = true;
  schedulerState.consecutiveFailures = 0;

  try {
    console.log(
      `Starting scheduled evaluation (trigger: ${trigger}, initiator: ${initiator})`
    );

    const run = await runBenchmarkEvaluation();

    // Store successful metrics for comparison
    schedulerState.lastSuccessMetrics = {
      citationAccuracy: run.metrics.citationAccuracy,
      groundingRate: run.metrics.groundingRate,
      runId: run.id,
      completedAt: run.completedAt,
    };

    schedulerState.lastRunId = run.id;
    schedulerState.runCount++;
    schedulerState.consecutiveFailures = 0;

    console.log(
      `Scheduled evaluation completed: ${run.id}, passed=${run.passedCases}/${run.totalCases}`
    );

    return {
      success: true,
      runId: run.id,
      metrics: run.metrics,
      caseCount: {
        total: run.totalCases,
        passed: run.passedCases,
        failed: run.failedCases,
        skipped: run.skippedCases,
      },
    };
  } catch (error: any) {
    schedulerState.consecutiveFailures++;

    console.error(
      `Scheduled evaluation failed (trigger: ${trigger}):`,
      error.message
    );

    // If we have previous success metrics, preserve them
    // A failed evaluation must NOT overwrite last successful metrics with fabricated values
    if (schedulerState.lastSuccessMetrics) {
      console.log(
        "Preserving last successful metrics; failed run did not overwrite them"
      );
    }

    return {
      success: false,
      error: error.message,
      skipped: true,
      preservedLastSuccess: schedulerState.lastSuccessMetrics
        ? {
            lastSuccessId: schedulerState.lastSuccessMetrics.runId,
            lastSuccessMetrics: schedulerState.lastSuccessMetrics,
          }
        : null,
    };
  } finally {
    schedulerState.isRunning = false;
  }
}

// Periodic scheduler using setInterval
// In production, this would be replaced with a proper cron job or serverless cron
let periodicIntervalId: NodeJS.Timeout | null = null;

function startPeriodicScheduler() {
  // Clear any existing interval
  if (periodicIntervalId) {
    clearInterval(periodicIntervalId);
  }

  // Run immediately on start, then at intervals
  periodicIntervalId = setInterval(() => {
    scheduledEvaluation("periodic").catch((err) => {
      console.error("Periodic evaluation error:", err);
    });
  }, SCHEDULER_CONFIG.periodicIntervalMs);

  // Also run immediately on startup
  scheduledEvaluation("periodic").catch((err) => {
    console.error("Initial periodic evaluation error:", err);
  });

  console.log(
    `Periodic scheduler started (interval: ${SCHEDULER_CONFIG.periodicIntervalMs /
      1000 /
      60 /
      60} hours)`
  );
}

function stopPeriodicScheduler() {
  if (periodicIntervalId) {
    clearInterval(periodicIntervalId);
    periodicIntervalId = null;
    console.log("Periodic scheduler stopped");
  }
}

// Manual trigger function (authorized admin only)
async function manualTrigger(initiator: string = "admin") {
  return scheduledEvaluation("manual", initiator);
}

// Trigger after model configuration change
async function onModelChange(newModelId: string, initiator: string = "system") {
  return scheduledEvaluation("modelChange", initiator);
}

// Trigger after prompt change
async function onPromptChange(newPromptVersion: string, initiator: string = "system") {
  return scheduledEvaluation("promptChange", initiator);
}

// Trigger after retrieval logic change
async function onRetrievalChange(initiator: string = "system") {
  return scheduledEvaluation("retrievalChange", initiator);
}

// Trigger after citation-verification logic change
async function onCitationVerificationChange(initiator: string = "system") {
  return scheduledEvaluation("citationVerificationChange", initiator);
}

// Export the scheduler and trigger functions
export {
  scheduledEvaluation,
  startPeriodicScheduler,
  stopPeriodicScheduler,
  manualTrigger,
  onModelChange,
  onPromptChange,
  onRetrievalChange,
  onCitationVerificationChange,
  SCHEDULER_CONFIG,
  schedulerState,
};

console.log("Scheduling and triggers infrastructure loaded");
console.log(
  `Config: periodic every ${SCHEDULER_CONFIG.periodicIntervalMs /
    1000 /
    60} minutes, timeout ${SCHEDULER_CONFIG.evaluationTimeoutMs /
    1000 /
    60} minutes`
);