import type {
  ClassifierAnswer,
  ClassifierInput,
  Confidence,
  IntentSourceEntity,
} from './types.js';

/** Caps and budgets of the intent layer. */
export const MAX_TITLE_CHARS = 300;
export const MAX_DESCRIPTION_CHARS = 4000;
export const MAX_ISSUES = 3;
export const MAX_DOCS = 3;
export const MAX_EXTERNAL = 3;
export const MAX_ISSUE_BODY_CHARS = 4000;
export const MAX_DOC_CHARS = 8000;
export const MAX_FILES = 200;
export const MAX_HUNKS_PER_FILE = 5;
export const MAX_HUNK_CHARS = 120;
export const MAX_DOC_BYTES = 1_000_000;
export const SOURCE_TIMEOUT_MS = 5_000;
export const CLASSIFIER_TIMEOUT_MS = 45_000;
/** Total input budget (cl100k tokens) and the fill ratio that leaves headroom for other tokenizers. */
export const INPUT_TOKEN_BUDGET = 12_000;
export const BUDGET_FILL = 0.75;
/** Rough token weight of the trusted system prompt (for the per-component log only). */
export const SYSTEM_TOKENS_ESTIMATE = 350;

const MAX_SUMMARY_CHARS = 500;
const MAX_ITEMS = 8;
const MAX_ITEM_CHARS = 200;

export function capText(text: string, max: number): { text: string; truncated: boolean } {
  return text.length > max ? { text: text.slice(0, max), truncated: true } : { text, truncated: false };
}

export interface FittedInput {
  input: ClassifierInput;
  descriptionTruncated: boolean;
  issues: { tokens: number; truncated: boolean }[];
  docs: { tokens: number; truncated: boolean }[];
  filesTruncated: boolean;
  components: { system: number; title: number; description: number; issues: number; docs: number; files: number };
  totalTokens: number;
}

function filesText(files: ClassifierInput['files']): string {
  return files.map((f) => `${f.path}\n${f.hunks.join('\n')}`).join('\n');
}

/**
 * Fit the classifier input into the token budget. Title and description are
 * only capped, never trimmed for budget. Trim order (lowest priority first):
 * hunk headers (down to paths only), then docs (last first), then issue bodies.
 */
export function fitBudget(
  raw: ClassifierInput,
  countTokens: (text: string) => number,
  budget: number = INPUT_TOKEN_BUDGET,
): FittedInput {
  const limit = Math.floor(budget * BUDGET_FILL);
  const title = capText(raw.title, MAX_TITLE_CHARS);
  const desc = capText(raw.description, MAX_DESCRIPTION_CHARS);
  const input: ClassifierInput = {
    ...raw,
    title: title.text,
    description: desc.text,
    issues: raw.issues.map((i) => ({ ...i, body: i.body.slice(0, MAX_ISSUE_BODY_CHARS) })),
    docs: raw.docs.map((d) => ({ ...d, content: d.content.slice(0, MAX_DOC_CHARS) })),
    files: raw.files.slice(0, MAX_FILES).map((f) => ({ ...f })),
  };
  const issueTrunc = raw.issues.map((i) => i.body.length > MAX_ISSUE_BODY_CHARS);
  const docTrunc = raw.docs.map((d) => d.content.length > MAX_DOC_CHARS);
  let filesTruncated = raw.files.length > MAX_FILES;

  const total = () =>
    SYSTEM_TOKENS_ESTIMATE +
    countTokens(input.title) +
    countTokens(input.description) +
    input.issues.reduce((n, i) => n + countTokens(`${i.title}\n${i.body}`), 0) +
    input.docs.reduce((n, d) => n + countTokens(d.content), 0) +
    countTokens(filesText(input.files));

  if (total() > limit && input.files.some((f) => f.hunks.length > 0)) {
    for (const f of input.files) f.hunks = [];
    filesTruncated = true;
  }
  for (let i = input.docs.length - 1; i >= 0 && total() > limit; i--) {
    const d = input.docs[i]!;
    while (total() > limit && d.content.length > 0) {
      d.content = d.content.length < 200 ? '' : d.content.slice(0, Math.floor(d.content.length / 2));
      docTrunc[i] = true;
    }
  }
  for (let i = input.issues.length - 1; i >= 0 && total() > limit; i--) {
    const it = input.issues[i]!;
    while (total() > limit && it.body.length > 0) {
      it.body = it.body.length < 200 ? '' : it.body.slice(0, Math.floor(it.body.length / 2));
      issueTrunc[i] = true;
    }
  }

  const components = {
    system: SYSTEM_TOKENS_ESTIMATE,
    title: countTokens(input.title),
    description: countTokens(input.description),
    issues: input.issues.reduce((n, i) => n + countTokens(`${i.title}\n${i.body}`), 0),
    docs: input.docs.reduce((n, d) => n + countTokens(d.content), 0),
    files: countTokens(filesText(input.files)),
  };
  return {
    input,
    descriptionTruncated: desc.truncated,
    issues: input.issues.map((i, k) => ({ tokens: countTokens(`${i.title}\n${i.body}`), truncated: issueTrunc[k]! })),
    docs: input.docs.map((d, k) => ({ tokens: countTokens(d.content), truncated: docTrunc[k]! })),
    filesTruncated,
    components,
    totalTokens: Object.values(components).reduce((a, b) => a + b, 0),
  };
}

const CONFIDENCE_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

function capConfidence(c: Confidence, cap: Confidence): Confidence {
  return CONFIDENCE_RANK[c] <= CONFIDENCE_RANK[cap] ? c : cap;
}

const CONTEXT_KINDS = new Set(['linked_issue', 'repo_doc', 'external_link']);

/**
 * Confidence policy applied on top of the model's own answer:
 * empty description with no fetched issue/doc → low; empty description with
 * one → at most medium; an unavailable referenced source → at most medium.
 */
export function deriveConfidence(
  answer: Confidence,
  sources: readonly IntentSourceEntity[],
  body: string | null,
): { confidence: Confidence; reasons: string[] } {
  const reasons: string[] = [];
  let confidence = answer;
  const hasFetchedContext = sources.some((s) => CONTEXT_KINDS.has(s.kind) && s.status === 'fetched');
  if (!body || body.trim().length === 0) {
    reasons.push('empty_description');
    confidence = capConfidence(confidence, hasFetchedContext ? 'medium' : 'low');
  }
  if (sources.some((s) => CONTEXT_KINDS.has(s.kind) && s.status === 'unavailable')) {
    reasons.push('source_unavailable');
    confidence = capConfidence(confidence, 'medium');
  }
  return { confidence, reasons };
}

export function isStale(
  row: { headSha: string | null; inputHash: string | null },
  pull: { headSha: string },
  currentInputHash: string,
): boolean {
  return row.headSha !== pull.headSha || row.inputHash !== currentInputHash;
}

/** Scope filtering is off when the intent failed, is stale, low-confidence, or has no in_scope. */
export function scopeFilterEnabled(
  intent: { status: 'ok' | 'failed'; confidence: Confidence; inScope: readonly string[] },
  stale: boolean,
): boolean {
  return intent.status === 'ok' && !stale && intent.confidence !== 'low' && intent.inScope.length > 0;
}

function cleanList(xs: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of xs) {
    const t = x.replace(/\s+/g, ' ').trim().slice(0, MAX_ITEM_CHARS);
    const key = t.toLowerCase();
    if (t.length === 0 || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

export function normalizeAnswer(raw: ClassifierAnswer): {
  summary: string;
  inScope: string[];
  outOfScope: string[];
  confidence: Confidence;
} {
  return {
    summary: raw.summary.replace(/\s+/g, ' ').trim().slice(0, MAX_SUMMARY_CHARS),
    inScope: cleanList(raw.in_scope),
    outOfScope: cleanList(raw.out_of_scope),
    confidence: raw.confidence,
  };
}
