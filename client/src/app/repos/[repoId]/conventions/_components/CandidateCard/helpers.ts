import { RULE_MAX } from "./constants";

/** The edited rule to send, or null when it breaks the 1..1000 limit (AC-12). Trimmed like the API. */
export function validRule(draft: string): string | null {
  const rule = draft.trim();
  return rule.length >= 1 && rule.length <= RULE_MAX ? rule : null;
}

export function confidencePct(confidence: number): number {
  return Math.round(Math.max(0, Math.min(1, confidence)) * 100);
}
