export type AmendmentInput = {
  number: string;
  year: string;
  title: string;
  summary: string;
  whyItMatters: string;
  relatedArticles: string;
};

export type ValidationResult<T> = {
  ok: boolean;
  errors: string[];
  value: T | null;
};

export type ManifestRecord = AmendmentInput & {
  sourceUrl: string;
  sourceNotes: string;
  referencedArticles: string[];
};

export function normalizeNumber(value: unknown): string;
export function ordinalValue(number: string): number;
export function normalizeSlugList(value: unknown): string[];
export function validateAmendmentInput(input: unknown): ValidationResult<AmendmentInput>;
export function validateManifestRecord(record: unknown): ValidationResult<ManifestRecord>;
