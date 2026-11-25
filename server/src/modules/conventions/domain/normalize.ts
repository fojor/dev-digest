import type { NormalizedCandidate } from './types.js';
import { RULE_MAX, CATEGORY_MAX } from './policies.js';

/**
 * Lenient per-candidate parse of the model's answer (AC-03b): text fields are
 * trimmed and cut to their limit, confidence is clamped into 0..1, and a
 * candidate missing a required field (or with a wrong type) is dropped and
 * counted. Pure — the caller has already checked the answer is a list.
 */
export function normalizeCandidates(items: readonly unknown[]): {
  kept: NormalizedCandidate[];
  discarded: number;
} {
  const kept: NormalizedCandidate[] = [];
  let discarded = 0;
  for (const item of items) {
    const c = normalizeOne(item);
    if (c) kept.push(c);
    else discarded++;
  }
  return { kept, discarded };
}

function text(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function normalizeOne(item: unknown): NormalizedCandidate | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const o = item as Record<string, unknown>;
  const rule = text(o.rule);
  const category = text(o.category);
  const evidencePath = text(o.evidence_path);
  const evidenceSnippet = typeof o.evidence_snippet === 'string' && o.evidence_snippet.trim() ? o.evidence_snippet : null;
  const confidence = typeof o.confidence === 'number' && Number.isFinite(o.confidence) ? o.confidence : null;
  if (!rule || !category || !evidencePath || !evidenceSnippet || confidence === null) return null;
  return {
    rule: rule.slice(0, RULE_MAX),
    category: category.slice(0, CATEGORY_MAX),
    evidencePath,
    evidenceSnippet,
    confidence: Math.min(1, Math.max(0, confidence)),
  };
}
