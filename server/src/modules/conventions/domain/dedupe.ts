import type { DecidedRule, NormalizedCandidate } from './types.js';

/** Comparison key for rule texts: lower-cased, whitespace runs collapsed, trimmed. */
export function ruleKey(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Current + original texts of decided candidates, each once, in order (sent to the model). */
export function doNotRepeatList(decided: readonly DecidedRule[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of decided) {
    for (const t of [d.rule, d.originalRule]) {
      if (!seen.has(t)) {
        seen.add(t);
        out.push(t);
      }
    }
  }
  return out;
}

/** Drop candidates equal (by ruleKey) to the current or original text of a decided candidate (AC-13). */
export function dropRepeats<C extends NormalizedCandidate>(
  candidates: readonly C[],
  decided: readonly DecidedRule[],
): { kept: C[]; discarded: number } {
  const keys = new Set(decided.flatMap((d) => [ruleKey(d.rule), ruleKey(d.originalRule)]));
  const kept = candidates.filter((c) => !keys.has(ruleKey(c.rule)));
  return { kept, discarded: candidates.length - kept.length };
}
