/**
 * Evaluation Metrics Definitions for Samvi AI Quality Monitoring
 * 
 * All metrics must be reproducible from actual evaluation runs.
 * Hardcoded percentages (98.5%, 97.8%) are NOT measured values
 * unless reproduced by actual benchmark evaluation.
 */

/**
 * Citation Accuracy
 * 
 * Measures whether citations actually support the claims associated with them.
 * 
 * Numerator: Number of citations where verificationStatus ∈ {VERIFIED, PARTIALLY_SUPPORTED}
 * Denominator: Total number of citations evaluated
 * 
 * Treatment:
 * - VERIFIED: citation fully supports the claim → counted
 * - PARTIALLY_SUPPORTED: citation partially supports the claim → counted
 * - UNSUPPORTED: citation does not support the claim → NOT counted
 * - UNVERIFIABLE: insufficient evidence → NOT counted
 * - OTHER/NO_CITATION: no citation found → NOT counted (excluded from denominator)
 * 
 * Formula: citationAccuracy = VERIFIED_count + PARTIALLY_SUPPORTED_count / total_evaluated_citations
 * 
 * Range: 0.0 to 1.0 (or 0% to 100%)
 */

/**
 * Grounding Rate
 * 
 * Measures the proportion of evaluated factual claims that are adequately supported
 * by retrieved source evidence.
 * 
 * Numerator: Number of claims with verificationStatus ∈ {VERIFIED, PARTIALLY_SUPPORTED}
 * Denominator: Total number of claims evaluated
 * 
 * Treatment:
 * - VERIFIED: claim is directly supported by evidence → counted
 * - PARTIALLY_SUPPORTED: claim has partial support → counted
 * - UNSUPPORTED: claim is not supported → NOT counted
 * - UNVERIFIABLE: insufficient evidence → NOT counted
 * 
 * Formula: groundingRate = (VERIFIED_count + PARTIALLY_SUPPORTED_count) / total_claimed_claims
 * 
 * Range: 0.0 to 1.0 (or 0% to 100%)
 */

/**
 * Citation Verification Coverage
 * 
 * Measures the proportion of generated responses that were evaluated for citation support.
 * 
 * Numerator: Number of responses where citation verification was attempted
 * Denominator: Total number of responses in the evaluation set
 * 
 * Formula: coverage = responses_with_verification / total_responses
 * 
 * Range: 0.0 to 1.0
 */

/**
 * Unsupported Claim Rate
 * 
 * Measures the proportion of claims that are unsupported by evidence.
 * 
 * Numerator: Number of claims with verificationStatus = UNSUPPORTED
 * Denominator: Total number of claims evaluated
 * 
 * Formula: unsupportedRate = UNSUPPORTED_count / total_claimed_claims
 * 
 * Range: 0.0 to 1.0
 */

/**
 * Unverifiable Citation Rate
 * 
 * Measures the proportion of citations that could not be verified due to insufficient evidence.
 * 
 * Numerator: Number of citations with verificationStatus = UNVERIFIABLE
 * Denominator: Total number of citations evaluated
 * 
 * Formula: unverifiableRate = UNVERIFIABLE_count / total_citations_evaluated
 * 
 * Range: 0.0 to 1.0
 */

/**
 * Retrieval Relevance
 * 
 * Measures how often the retrieval pipeline returns relevant evidence for a query.
 * 
 * Numerator: Number of queries where at least one retrieved item is relevant
 * Denominator: Total number of queries evaluated
 * 
 * Formula: retrievalRelevance = queries_with_relevant_evidence / total_queries
 * 
 * Range: 0.0 to 1.0
 */

/**
 * Evidence Sufficiency
 * 
 * Measures whether retrieved evidence is sufficient to support the generated claims.
 * 
 * Numerator: Number of claims where evidencePassages.length > 0 AND
 *            verificationStatus ∈ {VERIFIED, PARTIALLY_SUPPORTED}
 * Denominator: Total number of claims with retrieved evidence
 * 
 * Formula: evidenceSufficiency = sufficient_claims / claims_with_evidence
 * 
 * Range: 0.0 to 1.0
 */

/**
 * Evaluation Failure Rate
 * 
 * Measures the proportion of benchmark cases that failed during evaluation
 * (pipeline error, model error, etc.) rather than producing a verification result.
 * 
 * Numerator: Number of cases with evaluationFailure = true
 * Denominator: Total number of benchmark cases
 * 
 * Formula: failureRate = failed_cases / total_benchmark_cases
 * 
 * Range: 0.0 to 1.0
 */

/**
 * Evaluation Latency
 * 
 * Measures the average time taken to evaluate a single benchmark case.
 * 
 * Numerator: Sum of evaluation durations (ms) for all cases
 * Denominator: Number of successfully evaluated cases
 * 
 * Formula: latencyMs = totalDurationMs / evaluatedCaseCount
 * 
 * Units: milliseconds
 */

/**
 * Model/Prompt Version Comparison
 * 
 * Tracks which model and prompt configuration was used for each evaluation run,
 * enabling regression comparison across runs.
 * 
 * Fields: modelId, promptVersion, retrievalK, temperature, topP, etc.
 * 
 * Used for: comparing metrics across different configurations
 */

/**
 * Benchmark Status States
 * 
 * - Measured: Latest evaluation run completed with actual results
 * - Pending: Evaluation scheduled but not yet run
 * - Stale: No evaluation run completed within expected interval
 * - Failed: Last evaluation run failed
 * - Insufficient data: Not enough cases to calculate metrics
 * 
 * Important: A failed evaluation must NOT overwrite last successful metrics
 * with fabricated values. The previous "Measured" state must be preserved.
 */

/**
 * Metric Evaluation Origin
 * 
 * - benchmark: Calculated from 120-case golden benchmark
 * - production: Calculated from sampled real user conversations
 * 
 * Must be explicitly tracked. Production metrics must not be presented as
 * exhaustive measurements of all conversations.
 */