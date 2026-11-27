const NUMBER_PATTERN = /^\d{1,3}(st|nd|rd|th)$/;
const YEAR_PATTERN = /^\d{4}$/;
const SLUG_PATTERN = /^article-[a-z0-9-]+$/;

export function normalizeNumber(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function ordinalValue(number) {
  const match = normalizeNumber(number).match(/^(\d+)/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

export function normalizeSlugList(value) {
  if (typeof value !== "string" || !value.trim()) return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export function validateAmendmentInput(input) {
  const errors = [];
  if (!input || typeof input !== "object") {
    return { ok: false, errors: ["Input must be an object"], value: null };
  }

  const number = normalizeNumber(input.number);
  const year = typeof input.year === "string" ? input.year.trim() : "";
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const summary = typeof input.summary === "string" ? input.summary.trim() : "";
  const whyItMatters = typeof input.whyItMatters === "string" ? input.whyItMatters.trim() : "";
  const relatedArticles = typeof input.relatedArticles === "string" ? input.relatedArticles.trim() : "";

  if (!NUMBER_PATTERN.test(number)) errors.push("number must be a lowercase ordinal such as 1st or 106th");
  if (!YEAR_PATTERN.test(year)) errors.push("year must be a four digit year");
  if (!title) errors.push("title is required");
  else if (title.length > 300) errors.push("title must be at most 300 characters");
  if (!summary) errors.push("summary is required");
  else if (summary.length > 4000) errors.push("summary must be at most 4000 characters");
  if (whyItMatters.length > 4000) errors.push("whyItMatters must be at most 4000 characters");

  const slugs = normalizeSlugList(relatedArticles);
  if (slugs.some((slug) => !SLUG_PATTERN.test(slug))) {
    errors.push("relatedArticles must be a comma separated list of article-* slugs");
  }

  return {
    ok: errors.length === 0,
    errors,
    value: { number, year, title, summary, whyItMatters, relatedArticles },
  };
}

export function validateManifestRecord(record) {
  const result = validateAmendmentInput(record);
  if (!result.ok) return result;
  if (!record || typeof record !== "object") return result;

  const sourceUrl = typeof record.sourceUrl === "string" ? record.sourceUrl.trim() : "";
  if (!/^https?:\/\//i.test(sourceUrl)) {
    result.ok = false;
    result.errors.push("sourceUrl must be an http(s) URL");
  }

  const referencedArticles = Array.isArray(record.referencedArticles)
    ? record.referencedArticles.filter((item) => typeof item === "string")
    : [];
  if (referencedArticles.some((item) => !/^\d{1,4}[A-Z]{0,2}$/i.test(item))) {
    result.ok = false;
    result.errors.push("referencedArticles must contain only article numbers");
  }

  result.value.sourceUrl = sourceUrl;
  result.value.referencedArticles = referencedArticles;
  result.value.sourceNotes = typeof record.sourceNotes === "string" ? record.sourceNotes.trim() : "";
  return result;
}
