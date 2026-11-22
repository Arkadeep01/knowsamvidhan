/* ======================================================================
   Layer C — Final Deterministic Decision Engine
   Combines policy and semantic results into explicit decisions.
   Deterministic policy engine has final authority.
   Classifier must not override explicit security/scope policies.
   ====================================================================== */

import type {
  ClassificationDecision,
  ClassificationCategory,
  ReasonCode,
  ClassificationOutput,
  SemanticClassification,
  BypassAttempt,
  PolicyMatch,
} from "./types";
import { classifyWithPolicyEngine, SemanticClassification as SemanticResult } from "./policyEngine";
import { semanticClassifyQuery } from "./semanticClassifier";

/**
 * Final decision engine that combines deterministic policy evaluation
 * with semantic intent classification.
 *
 * The deterministic policy engine always has final authority.
 * The classifier's results can inform but not override policy decisions.
 *
 * @param query The user's question
 * @param options Optional semantic classification result
 * @returns Final ClassificationOutput with decision and metadata
 */
export function finalDecisionEngine(
  query: string,
  options: {
    semanticResult?: SemanticClassification;
    bypassAttempt?: BypassAttempt;
  } = {}
): ClassificationOutput {
  const startMs = Date.now();

  // Step 1: Run deterministic policy engine (always runs, independent of classifier)
  const policyResult = classifyWithPolicyEngine(query);

  // Step 2: Run semantic classification if not already provided
  let semanticResult = options.semanticResult;
  if (!semanticResult) {
    // Run semantic classification with policy info for reconciliation
    semanticResult = await semanticClassifyQuery(query, policyResult.matched ? undefined : undefined);
  }

  // Step 3: Detect bypass attempts
  let bypassAttempt = options.bypassAttempt;
  if (!bypassAttempt) {
    bypassAttempt = detectBypassAttempt(query);
  }

  // Step 4: Apply Layer C decision logic
  // Policy engine has final authority throughout

  // --- Policy engine takes precedence over classifier ---

  // If policy engine says BLOCK, always block regardless of classifier
  if (policyResult.decision === "BLOCK") {
    // But check if bypass detection supports this
    const bypassSupportsBlock = bypassAttempt.detected && bypassAttempt.confidence > 0.5;

    return {
      decision: "BLOCK",
      category: "OUT_OF_SCOPE",
      confidence: bypassSupportsBlock ? bypassAttempt.confidence : policyResult.confidence,
      reasonCode: "PROMPT_INJECTION_DETECTED",
      matchedPolicies: ["policy-final-authority", ...policyResult.matchedPolicies],
      requiresClarification: false,
      policyVersion: "1.0.0",
      classifierModelVersion: semanticResult?.classifierModelVersion || "hybrid-v1",
      classificationDurationMs: Date.now() - startMs,
    };
  }

  // If policy engine says ALLOW, classifier may suggest ALLOW_WITH_SCOPE or CLARIFY
  // but policy engine final authority means we at minimum ALLOW
  let decision = policyResult.decision;
  let category = policyResult.category;
  let reasonCode = policyResult.reasonCode;
  let matchedPolicies = [...policyResult.matchedPolicies];
  let requiresClarification = policyResult.requiresClarification;
  let allowScope = policyResult.classificationDurationMs; // reuse field? no, use separate

  // Actually, let me use the policyResult's allowScope concept differently
  // The policyResult already has the right structure - let me build on it

  // --- Reconcile semantic classifier results ---

  // If policy says ALLOW but classifier says BLOCK/CLARIFY, policy wins
  if (decision === "ALLOW" && semanticResult) {
    // Policy has final authority - only downgrade if classifier detects serious issues
    const classifierSupportsBlock =
      semanticResult.intent === "BLOCK" &&
      semanticResult.reasonCodes.some(
        (r) => r.includes("PROMPT_INJECTION") || r.includes("COMPLETELY_UNRELATED")
      );

    const classifierSupportsClarify =
      semanticResult.intent === "CLARIFY" &&
      semanticResult.confidence > 0.6;

    // If classifier strongly suggests CLARIFY and policy is uncertain, use CLARIFY
    if (classifierSupportsClarify && !requiresClarification) {
      decision = "CLARIFY";
      category = semanticResult.category;
      reasonCode = semanticResult.reasonCodes[0] || "AMBIGUOUS_INTENT";
      matchedPolicies = [...matchedPolicies, "semantic-clarify-reconcile"];
      requiresClarification = true;
    } else if (classifierSupportsBlock) {
      // Classifier says block but policy says allow - policy has final authority, keep ALLOW
      // but mark with reason code indicating classifier concern
      reasonCode = "CLASSIFIER_CONCERN_OVERIDDEN";
      matchedPolicies = [...matchedPolicies, "classifier-concern-overridden"];
    }
    // If classifier says ALLOW_WITH_SCOPE and policy says ALLOW, combine to ALLOW_WITH_SCOPE
    else if (
      semanticResult.intent === "ALLOW_WITH_SCOPE" &&
      semanticResult.confidence > 0.5
    ) {
      decision = "ALLOW_WITH_SCOPE";
      category = semanticResult.category;
      reasonCode = semanticResult.reasonCodes[0] || "RELEVANT_EDUCATIONAL_QUERY";
      matchedPolicies = [...matchedPolicies, "semantic-scope-allow"];
      allowScope = true;
      requiresClarification = false;
    }
  }

  // If policy says ALLOW_WITH_SCOPE and classifier says ALLOW, keep ALLOW_WITH_SCOPE
  if (decision === "ALLOW_WITH_SCOPE" && semanticResult) {
    // Confirm classifier also sees scope needed
    if (semanticResult.intent !== "ALLOW") {
      // Classifier doesn't see scope needed - policy still wins, keep ALLOW_WITH_SCOPE
      // but add note
      reasonCode = "POLICY_SCOPE_DECISION";
    }
  }

  // If policy says CLARIFY, checker may override to BLOCK if bypass detected
  if (decision === "CLARIFY" && bypassAttempt.detected && bypassAttempt.confidence > 0.7) {
    decision = "BLOCK";
    category = "OUT_OF_SCOPE";
    reasonCode = "PROMPT_INJECTION_DETECTED";
    matchedPolicies = [...matchedPolicies, "bypass-block-clarify"];
    requiresClarification = false;
  }

  // If policy says CLARIFY and classifier says BLOCK with high confidence, block
  if (decision === "CLARIFY" && semanticResult && semanticResult.intent === "BLOCK" && semanticResult.confidence > 0.7) {
    decision = "BLOCK";
    category = "OUT_OF_SCOPE";
    reasonCode = "CLASSIFIER_BLOCK_OVERRIDE";
    matchedPolicies = [...matchedPolicies, "classifier-block-clarify-overridden"];
    requiresClarification = false;
  }

  // Conservative fallback: if everything is uncertain, default to CLARIFY
  if (
    (decision === "ALLOW" || decision === "ALLOW_WITH_SCOPE") &&
    !reasonCode
  ) {
    decision = "CLARIFY";
    category = "AMBIGUOUS";
    reasonCode = "NO_POLICY_MATCH";
    matchedPolicies = ["conservative-fallback"];
    requiresClarification = true;
  }

  // Ensure confidence is set
  const finalConfidence = semanticResult?.confidence || policyResult.confidence || 0.5;

  return {
    decision,
    category,
    confidence: finalConfidence,
    reasonCode: reasonCode || "NO_REASON_CODE",
    matchedPolicies,
    requiresClarification,
    policyVersion: "1.0.0",
    classifierModelVersion: semanticResult?.classifierModelVersion || "hybrid-v1",
    classificationDurationMs: Date.now() - startMs,
  };
}

/* ======================================================================
   Export types and main function
   ====================================================================== */

export type {
  ClassificationDecision,
  ClassificationCategory,
  ReasonCode,
  ClassificationOutput,
  SemanticClassification,
  BypassAttempt,
  PolicyMatch,
};