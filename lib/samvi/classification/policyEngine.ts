/* ======================================================================
   Layer A — Deterministic Policy Engine
   Independent of LLM decisions, auditable, explicit policy rules.
   ====================================================================== */

import type {
  ClassificationDecision,
  ClassificationCategory,
  ReasonCode,
  ClassificationOutput,
  PolicyMatch,
  SemanticClassification,
  BypassAttempt,
} from "./types";

/** Constitutional article numbers that constitute relevant topics */
const CONSTITUTIONAL_ARTICLE_PATTERNS = [
  /^article\s+[1-9]\d{0,2}$/i,
  /^art\.?\s*[1-9]\d{0,2}$/i,
  /^article\s+[1-9]\d{0,2}\s*\([^)]*\)$/i,
  /^fundamental\s+rights?$/i,
  /^part\s+iii$/i,
  /^part\s+iv$/i,
  /^directive\s+principles?\s+of\s+state\s+policy$/i,
  /^fundamental\s+duties?$/i,
  /^article\s+31c$/i,
  /^article\s+368$/i,
  /^basic\s+structure$/i,
  /^constitutional Amendment\s+\d+/i,
  /^amendment\s+[1-9]\d{0,2}$/i,
  /^schedule\s+\d+/i,
  /^preamble$/i,
  /^part\s+iv[a-z]?$/i,
  /^part\s+V[a-z]?$/i,
  /^article\s+14$/i,
  /^article\s+21$/i,
  /^article\s+19$/i,
  /^article\s+25$/i,
  /^article\s+32$/i,
  /^article\s+356$/i,
  /^article\s+352$/i,
  /^article\s+360$/i,
];

/** Unrelated topic keywords/patterns that suggest off-topic intent */
const UNRELATED_TOPIC_PATTERNS = [
  /(cricket|ipl|sports?).?(?:match|tournament|series|score|team)/i,
  /(bollywood|movie|film|celebrity|actor|actress)/i,
  /(recipe|cook|food|eat|drink)/i,
  /(weather|temperature|rain|sun|forecast)/i,
  /(coding|programming|python|javascript|java|html|css)/i,
  /(crypto|bitcoin|ethereum|market|price)/i,
  /(facebook|twitter|instagram|social.?media\s?post)/i,
  /(game|games|playing|xbox|playstation)/i,
  /(music|song|album|concert)/i,
  /(tech|gadget|phone|android|ios)/i,
  /(horoscope|astrology|palm|tarot)/i,
  /(joke|funny|meme|mem)/i,
  /(dream|interpretation)/i,
  /(love|dating|relationship|marriage)/i,
  /(buy|sell|shop|price|discount|amazon)/i,
  /(horoscope|palm|tarot|psychic)/i,
];

/** Educational/relevant keyword patterns that indicate constitutional learning */
const EDUCATIONAL_PATTERNS = [
  /(learn|teach|education|study|understand)/i,
  /(what does|explain|describe|define)/i,
  /(history|historical|background)/i,
  /(concept|conceptual)/i,
  /(example|illustration)/i,
  /(compare|contrasting)/i,
  /(significance|meaning|implication)/i,
];

/** Prompt injection / scope override attempts */
const PROMPT_INJECTION_PATTERNS = [
  /(you are|as an|pretend|role.?play)/i,
  /(ignore.*previous|disregard.*all|forget.*previous)/i,
  /(override|bypass|break|jailbreak)/i,
  /(system.*instruction|prompt|system.prompt)/i,
  /(you must|you will|you should)/i,
  /(not.?constitution|off.*topic|off-topic)/i,
  /(out.*scope|outside.*scope)/i,
  /(iam\.? asking|we\.? asking)/i,
];

/** Mixed-topic patterns: relevant constitutional keyword with unrelated content */
const MIXED_TOPIC_PATTERNS = [
  /article\s+[1-9]\d{0,2}.*(cricket|ipl|bollywood|recipe)/i,
  /(cricket|ipl|bollywood|recipe).*article\s+[1-9]\d{0,2}/i,
  /(fundamental.right|article).*and.*(cricket|bollywood)/i,
];

/** Policy rules ordered by precedence */
const POLICY_RULES = [
  {
    name: "PROMPT_INJECTION_BLOCK",
    description: "Detects prompt injection attempts trying to override Samvi's scope",
    evaluate: (query: string): PolicyMatch => {
      const lower = query.toLowerCase();
      for (const pattern of PROMPT_INJECTION_PATTERNS) {
        if (pattern.test(lower)) {
          return {
            ruleName: "PROMPT_INJECTION_BLOCK",
            ruleDescription: "Prompt injection attempt detected",
            matched: true,
            reasonCode: "PROMPT_INJECTION_DETECTED",
          };
        }
      }
      return {
        ruleName: "PROMPT_INJECTION_BLOCK",
        ruleDescription: "Prompt injection attempt detected",
        matched: false,
      };
    },
  },
  {
    name: "COMPLETELY_UNRELATED_BLOCK",
    description: "Blocks queries completely unrelated to constitutional topics",
    evaluate: (query: string): PolicyMatch => {
      const lower = query.toLowerCase();
      let unrelatedCount = 0;
      for (const pattern of UNRELATED_TOPIC_PATTERNS) {
        if (pattern.test(lower)) {
          unrelatedCount++;
        }
      }

      // If more than 2 unrelated topic patterns match, treat as completely unrelated
      if (unrelatedCount >= 2) {
        return {
          ruleName: "COMPLETELY_UNRELATED_BLOCK",
          ruleDescription: "Query contains multiple unrelated topic patterns",
          matched: true,
          reasonCode: "COMPLETELY_UNRELATED",
        };
      }

      // If exactly 1 unrelated pattern but the query also has constitutional content, it's mixed
      if (unrelatedCount === 1) {
        // Check for constitutional content too
        const hasConstitutional = CONSTITUTIONAL_ARTICLE_PATTERNS.some((p) => p.test(lower));
        if (hasConstitutional) {
          return {
            ruleName: "COMPLETELY_UNRELATED_BLOCK",
            ruleDescription: "Query mixes unrelated topic with constitutional reference",
            matched: true,
            reasonCode: "MIXED_RELEVANT_AND_UNRELATED",
          };
        }
        return {
          ruleName: "COMPLETELY_UNRELATED_BLOCK",
          ruleDescription: "Query contains unrelated topic pattern",
          matched: true,
          reasonCode: "COMPLETELY_UNRELATED",
        };
      }

      return {
        ruleName: "COMPLETELY_UNRELATED_BLOCK",
        ruleDescription: "Query contains unrelated topic patterns",
        matched: false,
      };
    },
  },
  {
    name: "MIXED_TOPIC_SCOPE",
    description: "Handles queries mixing constitutional and unrelated topics",
    evaluate: (query: string): PolicyMatch => {
      const lower = query.toLowerCase();
      const hasConstitutional = CONSTITUTIONAL_ARTICLE_PATTERNS.some((p) => p.test(lower));
      const hasUnrelated = UNRELATED_TOPIC_PATTERNS.some((p) => p.test(lower));

      if (hasConstitutional && hasUnrelated) {
        return {
          ruleName: "MIXED_TOPIC_SCOPE",
          ruleDescription: "Query mixes constitutional and unrelated topics",
          matched: true,
          reasonCode: "MIXED_RELEVANT_AND_UNRELATED",
        };
      }

      return {
        ruleName: "MIXED_TOPIC_SCOPE",
        ruleDescription: "Query mixes constitutional and unrelated topics",
        matched: false,
      };
    },
  },
  {
    name: "CONSTITUTIONAL_ARTICLE_ALLOW",
    description: "Allows explicit constitutional/legal queries",
    evaluate: (query: string): PolicyMatch => {
      const lower = query.toLowerCase();

      // Check for direct article references
      if (/article\s+\d+/i.test(lower) || /art\.?\s*\d+/i.test(lower)) {
        return {
          ruleName: "CONSTITUTIONAL_ARTICLE_ALLOW",
          ruleDescription: "Direct article reference detected",
          matched: true,
          reasonCode: "RELEVANT_CONSTITUTIONAL_QUERY",
        };
      }

      // Check for fundamental rights
      if (/fundamental.rights?/i.test(lower) || /part.?iii/i.test(lower)) {
        return {
          ruleName: "CONSTITUTIONAL_ARTICLE_ALLOW",
          ruleDescription: "Fundamental rights or Part III reference detected",
          matched: true,
          reasonCode: "RELEVANT_CONSTITUTIONAL_QUERY",
        };
      }

      // Check for directive principles
      if (/directive.principles?|part.?iv/i.test(lower)) {
        return {
          ruleName: "CONSTITUTIONAL_ARTICLE_ALLOW",
          ruleDescription: "Directive Principles reference detected",
          matched: true,
          reasonCode: "RELEVANT_CONSTITUTIONAL_QUERY",
        };
      }

      // Check for fundamental duties
      if (/fundamental.duties?/i.test(lower)) {
        return {
          ruleName: "CONSTITUTIONAL_ARTICLE_ALLOW",
          ruleDescription: "Fundamental duties reference detected",
          matched: true,
          reasonCode: "RELEVANT_CONSTITUTIONAL_QUERY",
        };
      }

      // Check for amendment references
      if (/amendment\s+\d+/i.test(lower)) {
        return {
          ruleName: "CONSTITUTIONAL_ARTICLE_ALLOW",
          ruleDescription: "Amendment reference detected",
          matched: true,
          reasonCode: "RELEVANT_CONSTITUTIONAL_QUERY",
        };
      }

      // Check for schedule references
      if (/schedule\s+\d+/i.test(lower)) {
        return {
          ruleName: "CONSTITUTIONAL_ARTICLE_ALLOW",
          ruleDescription: "Schedule reference detected",
          matched: true,
          reasonCode: "RELEVANT_CONSTITUTIONAL_QUERY",
        };
      }

      // Check for preamble
      if (/preamble/i.test(lower)) {
        return {
          ruleName: "CONSTITUTIONAL_ARTICLE_ALLOW",
          ruleDescription: "Preamble reference detected",
          matched: true,
          reasonCode: "RELEVANT_CONSTITUTIONAL_QUERY",
        };
      }

      // Check for basic structure doctrine
      if (/basic.structure/i.test(lower)) {
        return {
          ruleName: "CONSTITUTIONAL_ARTICLE_ALLOW",
          ruleDescription: "Basic structure doctrine reference detected",
          matched: true,
          reasonCode: "RELEVANT_CONSTITUTIONAL_QUERY",
        };
      }

      // Check for specific constitutional articles
      const specificArticles = [
        "article 14", "article 19", "article 21", "article 25",
        "article 32", "article 356", "article 352", "article 360",
        "article 31c", "article 368",
      ];
      for (const article of specificArticles) {
        if (new RegExp(article, "i").test(lower)) {
          return {
            ruleName: "CONSTITUTIONAL_ARTICLE_ALLOW",
            ruleDescription: `Specific constitutional article reference: ${article}`,
            matched: true,
            reasonCode: "RELEVANT_CONSTITUTIONAL_QUERY",
          };
        }
      }

      return {
        ruleName: "CONSTITUTIONAL_ARTICLE_ALLOW",
        ruleDescription: "Constitutional/legal query detected",
        matched: false,
      };
    },
  },
  {
    name: "EDUCATIONAL_ALLOW_WITH_SCOPE",
    description: "Allows educational queries related to constitutional learning",
    evaluate: (query: string): PolicyMatch => {
      const lower = query.toLowerCase();
      const educationalMatches = EDUCATIONAL_PATTERNS.filter((p) => p.test(lower)).length;

      // If the query is primarily educational about constitutional topics, allow with scope
      if (educationalMatches >= 2) {
        // Verify it's not just using educational language for unrelated content
        const hasUnrelated = UNRELATED_TOPIC_PATTERNS.some((p) => p.test(lower));
        if (hasUnrelated) {
          return {
            ruleName: "EDUCATIONAL_ALLOW_WITH_SCOPE",
            ruleDescription: "Educational query with unrelated content - scope limited",
            matched: true,
            reasonCode: "RELEVANT_EDUCATIONAL_QUERY",
          };
        }
        return {
          ruleName: "EDUCATIONAL_ALLOW_WITH_SCOPE",
          ruleDescription: "Educational constitutional learning query",
          matched: true,
          reasonCode: "RELEVANT_EDUCATIONAL_QUERY",
        };
      }

      return {
        ruleName: "EDUCATIONAL_ALLOW_WITH_SCOPE",
        ruleDescription: "Educational query related to constitutional learning",
        matched: false,
      };
    },
  },
  {
    name: "CLARIFICATION_NEEDED",
    description: "Flags ambiguous questions that need user clarification",
    evaluate: (query: string): PolicyMatch => {
      const lower = query.toLowerCase().trim();

      // Very short queries (1-3 words) that aren't clearly constitutional
      if (lower.split(/\s+/).length <= 3 && !CONSTITUTIONAL_ARTICLE_PATTERNS.some((p) => p.test(lower))) {
        return {
          ruleName: "CLARIFICATION_NEEDED",
          ruleDescription: "Very short query - may need clarification",
          matched: true,
          reasonCode: "AMBIGUOUS_INTENT",
        };
      }

      // Questions starting with "what is" about non-constitutional topics
      const whatIsPatterns = [
        /^what is .*(cricket|ipl|bollywood|recipe|weather|tech)/i,
        /^who is .*(celebrity|politician)/i,
      ];

      for (const pattern of whatIsPatterns) {
        if (pattern.test(lower)) {
          return {
            ruleName: "CLARIFICATION_NEEDED",
            ruleDescription: "Question about non-constitutional topic needing clarification",
            matched: true,
            reasonCode: "AMBIGUOUS_INTENT",
          };
        }
      }

      // Questions that use constitutional words but in unclear context
      const ambiguousContextPatterns = [
        /what.*constitution/i,
        /constitution.*about/i,
      ];

      for (const pattern of ambiguousContextPatterns) {
        if (pattern.test(lower)) {
          return {
            ruleName: "CLARIFICATION_NEEDED",
            ruleDescription: "Ambiguous constitutional context - needs clarification",
            matched: true,
            reasonCode: "AMBIGUOUS_INTENT",
          };
        }
      }

      return {
        ruleName: "CLARIFICATION_NEEDED",
        ruleDescription: "Query ambiguous - may need user clarification",
        matched: false,
      };
    },
  },
];

/**
 * Evaluates a user query against the deterministic policy engine.
 * The policy engine has final authority - its results cannot be overridden
 * by the semantic classifier's confidence score.
 *
 * @param query The user's question
 * @returns PolicyMatch result with rule evaluation
 */
export function evaluatePolicy(query: string): PolicyMatch {
  const lower = query.toLowerCase().trim();

  // Empty query handling
  if (lower.length === 0) {
    return {
      ruleName: "EMPTY_QUERY",
      ruleDescription: "Empty query provided",
      matched: true,
      reasonCode: "COMPLETELY_UNRELATED",
    };
  }

  // Run each policy rule in precedence order
  for (const rule of POLICY_RULES) {
    const result = rule.evaluate(query);

    // If a rule matches (matched: true), return immediately
    // This ensures precedence: earlier rules override later ones
    if (result.matched) {
      return result;
    }
  }

  // Default: no specific policy matched, treat as ambiguous needing clarification
  return {
    ruleName: "NO_POLICY_MATCHED",
    ruleDescription: "No specific policy rule matched the query",
    matched: false,
    reasonCode: "AMBIGUOUS_INTENT",
  };
}

/**
 * Detects bypass attempts in the user query.
 * Uses structural analysis rather than regex normalization alone.
 *
 * @param query The user's question
 * @returns BypassAttempt result
 */
export function detectBypassAttempt(query: string): BypassAttempt {
  const lower = query.toLowerCase();
  const techniques: string[] = [];

  // Check for prompt injection patterns
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(lower)) {
      techniques.push(pattern.toString());
    }
  }

  // Check for keyword substitution (replacing letters with unicode)
  const hasUnicodeSubstitution = /[^\x00-\x7F]/.test(query) && !/article|constitution|fundamental/.test(lower);
  if (hasUnicodeSubstitution) {
    techniques.push("unicode_substitution");
  }

  // Check for extra whitespace/punctuation obfuscation
  const normalized = lower.replace(/\s+/g, " ").replace(/[^\w\s]/g, " ");
  if (normalized !== lower.toLowerCase()) {
    techniques.push("whitespace_padding");
  }

  // Check for mixed-language bypass
  const hasMixedLanguage = /[a-zA-Z]/.test(query) && /[^\x00-\x7F]/.test(query);
  if (hasMixedLanguage) {
    techniques.push("mixed_language");
  }

  // Check for partial keyword matching (mentioning constitutional keyword but unrelated intent)
  const constitutionalKeywordMatch = CONSTITUTIONAL_ARTICLE_PATTERNS.some((p) => p.test(lower));
  const unrelatedKeywordMatch = UNRELATED_TOPIC_PATTERNS.some((p) => p.test(lower));

  if (constitutionalKeywordMatch && unrelatedKeywordMatch) {
    techniques.push("keyword_substitution_mixed_topic");
  }

  const detected = techniques.length > 0;
  const confidence = detected ? Math.min(techniques.length * 0.25, 1.0) : 0.0;

  return {
    detected,
    techniques,
    confidence,
    description: detected
      ? `Bypass attempt detected using: ${techniques.join(", ")}`
      : "No bypass attempt detected",
  };
}

/**
 * Main entry point for the deterministic policy engine.
 * Combines policy evaluation and bypass detection into a classification output.
 *
 * @param query The user's question
 * @param classifierResult Optional semantic classifier result (policy has final authority)
 * @returns ClassificationOutput with the deterministic policy decision
 */
export function classifyWithPolicyEngine(
  query: string,
  classifierResult?: SemanticClassification
): ClassificationOutput {
  const startMs = Date.now();

  // Step 1: Evaluate deterministic policy
  const policyMatch = evaluatePolicy(query);

  // Step 2: Detect bypass attempts
  const bypass = detectBypassAttempt(query);

  // Step 3: Apply policy engine final authority
  // The policy engine's decision cannot be overridden by the classifier
  let decision: ClassificationDecision = "CLARIFY";
  let category: ClassificationCategory = "AMBIGUOUS";
  let reasonCode: ReasonCode = "AMBIGUOUS_INTENT";
  let matchedPolicies: string[] = [];
  let requiresClarification = false;
  let allowScope = false; // ALLOW_WITH_SCOPE flag

  // Apply policy engine results with final authority
  switch (policyMatch.ruleName) {
    case "PROMPT_INJECTION_BLOCK":
      decision = "BLOCK";
      category = "OUT_OF_SCOPE";
      reasonCode = "PROMPT_INJECTION_DETECTED";
      matchedPolicies = [policyMatch.ruleName];
      requiresClarification = false;
      break;

    case "COMPLETELY_UNRELATED_BLOCK":
      decision = "BLOCK";
      category = "UNRELATED";
      reasonCode = policyMatch.reasonCode || "COMPLETELY_UNRELATED";
      matchedPolicies = [policyMatch.ruleName];
      requiresClarification = false;
      break;

    case "MIXED_TOPIC_SCOPE":
      decision = "ALLOW_WITH_SCOPE";
      category = "MIXED_TOPIC";
      reasonCode = "MIXED_RELEVANT_AND_UNRELATED";
      matchedPolicies = [policyMatch.ruleName];
      allowScope = true;
      requiresClarification = false;
      break;

    case "CONSTITUTIONAL_ARTICLE_ALLOW":
      decision = "ALLOW";
      category = "CONSTITUTIONAL_LAW";
      reasonCode = "RELEVANT_CONSTITUTIONAL_QUERY";
      matchedPolicies = [policyMatch.ruleName];
      allowScope = false;
      requiresClarification = false;
      break;

    case "EDUCATIONAL_ALLOW_WITH_SCOPE":
      decision = "ALLOW_WITH_SCOPE";
      category = "EDUCATIONAL";
      reasonCode = "RELEVANT_EDUCATIONAL_QUERY";
      matchedPolicies = [policyMatch.ruleName];
      allowScope = true;
      requiresClarification = false;
      break;

    case "CLARIFICATION_NEEDED":
      decision = "CLARIFY";
      category = "AMBIGUOUS";
      reasonCode = "AMBIGUOUS_INTENT";
      matchedPolicies = [policyMatch.ruleName];
      requiresClarification = true;
      break;

    case "EMPTY_QUERY":
      decision = "BLOCK";
      category = "UNRELATED";
      reasonCode = "COMPLETELY_UNRELATED";
      matchedPolicies = [policyMatch.ruleName];
      requiresClarification = false;
      break;

    default:
      // No specific policy matched - check classifier result if available
      if (classifierResult) {
        // Policy has final authority - only use classifier if it aligns with safe defaults
        // If classifier says ALLOW but policy is uncertain, default to CLARIFY
        if (classifierResult.intent === "ALLOW" && classifierResult.confidence > 0.7) {
          decision = "ALLOW_WITH_SCOPE";
          category = "EDUCATIONAL";
          reasonCode = "RELEVANT_EDUCATIONAL_QUERY";
          matchedPolicies = ["policy-uncertainty", "classifier-fallback"];
          allowScope = true;
          requiresClarification = false;
        } else if (classifierResult.intent === "BLOCK") {
          decision = "BLOCK";
          category = "UNRELATED";
          reasonCode = "COMPLETELY_UNRELATED";
          matchedPolicies = ["policy-uncertainty", "classifier-block"];
          requiresClarification = false;
        } else {
          decision = "CLARIFY";
          category = "AMBIGUOUS";
          reasonCode = "AMBIGUOUS_INTENT";
          matchedPolicies = ["policy-uncertainty"];
          requiresClarification = true;
        }
      } else {
        // No classifier available, conservative fallback
        decision = "CLARIFY";
        category = "AMBIGUOUS";
        reasonCode = "AMBIGUOUS_INTENT";
        matchedPolicies = ["policy-uncertainty-no-classifier"];
        requiresClarification = true;
      }
  }

  // Step 4: Policy engine final authority - override classifier if needed
  // If policy says BLOCK, always block regardless of classifier confidence
  if (decision !== "BLOCK" && bypass.detected && bypass.confidence > 0.5) {
    // Strong bypass attempt - policy engine overrides
    decision = "BLOCK";
    category = "OUT_OF_SCOPE";
    reasonCode = "PROMPT_INJECTION_DETECTED";
    matchedPolicies = [...matchedPolicies, "bypass-override"];
    requiresClarification = false;
  }

  // If policy says ALLOW but bypass is detected, downgrade to ALLOW_WITH_SCOPE
  if (decision === "ALLOW" && bypass.detected && bypass.confidence > 0.3) {
    decision = "ALLOW_WITH_SCOPE";
    reasonCode = "KEYWORD_BASED_BYPASS_ATTEMPT";
    matchedPolicies = [...matchedPolicies, "bypass-detected"];
    allowScope = true;
  }

  // If policy says CLARIFY but bypass detected with high confidence, block instead
  if (decision === "CLARIFY" && bypass.detected && bypass.confidence > 0.7) {
    decision = "BLOCK";
    category = "OUT_OF_SCOPE";
    reasonCode = "PROMPT_INJECTION_DETECTED";
    matchedPolicies = [...matchedPolicies, "bypass-block"];
    requiresClarification = false;
  }

  const classificationDurationMs = Date.now() - startMs;

  return {
    decision,
    category,
    confidence: bypass.confidence,
    reasonCode,
    matchedPolicies,
    requiresClarification,
    policyVersion: "1.0.0",
    classifierModelVersion: "hybrid-v1",
    classificationDurationMs,
  };
}

/* ======================================================================
   Export types and main functions
   ====================================================================== */

export type {
  ClassificationDecision,
  ClassificationCategory,
  ReasonCode,
  ClassificationOutput,
  PolicyMatch,
  SemanticClassification,
  BypassAttempt,
};