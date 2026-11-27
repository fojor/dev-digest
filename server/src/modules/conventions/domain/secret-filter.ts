import type { NormalizedCandidate } from './types.js';

/**
 * Credential patterns (AC-24). A COPY of the `SECRET_PATTERNS` and
 * `GENERIC_SECRET` lists in .claude/skills/pr-self-review/scripts/checks.mjs —
 * assistant tooling the server cannot import. The server test
 * conventions-domain-filters.test.ts reads that file and fails when the two
 * lists drift; change both together.
 */
export const SECRET_PATTERNS: readonly RegExp[] = [
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/,
  /\bsk-ant-[A-Za-z0-9_-]{20,}/,
  /\bsk-or-v1-[A-Za-z0-9]{20,}/,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/,
  /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
];

export const GENERIC_SECRET = /\b(?:api[_-]?key|secret|token|passw(?:or)?d)\b["']?\s*[:=]\s*["'](?=[^"'\s]*\d)(?=[^"'\s]*[A-Za-z])[^"'\s]{16,}["']/i;

export function containsSecret(text: string): boolean {
  return SECRET_PATTERNS.some((re) => re.test(text)) || GENERIC_SECRET.test(text);
}

/** Drop candidates whose rule text, category or evidence fragment carries a credential. */
export function dropSecrets<C extends NormalizedCandidate>(
  candidates: readonly C[],
): { kept: C[]; discarded: number } {
  const kept = candidates.filter(
    (c) => !containsSecret(c.rule) && !containsSecret(c.category) && !containsSecret(c.evidenceSnippet),
  );
  return { kept, discarded: candidates.length - kept.length };
}
