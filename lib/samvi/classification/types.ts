/* ======================================================================
   Classification Types and Output Schema
   ====================================================================== */

/** Decision values for the final classification engine */
export type ClassificationDecision =
  | "ALLOW"
  | "ALLOW_WITH_SCOPE"
  | "CLARIFY"
  | "BLOCK";

/** Category values for classified queries */
export type ClassificationCategory =
  | "CONSTITUTIONAL_LAW"
  | "EDUCATIONAL"
  | "UNRELATED"
  | "OUT_OF_SCOPE"
  | "AMBIGUOUS"
  | "MIXED_TOPIC";

/** Reason codes for classification decisions */
export type ReasonCode =
  | "RELEVANT_CONSTITUTIONAL_QUERY"
  | "RELEVANT_EDUCATIONAL_QUERY"
  | "MIXED_RELEVANT_AND_UNRELATED"
  | "COMPLETELY_UNRELATED"
  | "AMBIGUOUS_INTENT"
  | "KEYWORD_BASED_BYPASS_ATTEMPT"
  | "PROMPT_INJECTION_DETECTED"
  | "CLASSIFIER_CONCERN_OVERRIDDEN"
  | "AI_CLASSIFICATION_PARSE_ERROR"
  | "AI_PROVIDER_FAILURE"
  | "POLICY_FINAL_AUTHORITY"
  | "POLICY_CONSIDERED"
  | "CLARIFICATION_NEEDED"
  | "OUT_OF_SCOPE"
  | "POLICY_VIOLATION";

/** Structured classification output */
export interface ClassificationOutput {
  decision: ClassificationDecision;
  category: ClassificationCategory;
  confidence: number;
  reasonCode: ReasonCode;
  matchedPolicies: string[];
  requiresClarification: boolean;
  policyVersion: string;
  classifierModelVersion: string;
  classificationDurationMs: number;
}

/** Policy rule match result */
export interface PolicyMatch {
  ruleName: string;
  ruleDescription: string;
  matched: boolean;
  reasonCode?: ReasonCode;
}

/** Semantic classification result from Layer B */
export interface SemanticClassification {
  intent: ClassificationDecision;
  category: ClassificationCategory;
  confidence: number;
  reasonCodes: ReasonCode[];
  explanation: string;
}

/** Bypass attempt detection result */
export interface BypassAttempt {
  detected: boolean;
  techniques: string[];
  confidence: number;
  description: string;
}
