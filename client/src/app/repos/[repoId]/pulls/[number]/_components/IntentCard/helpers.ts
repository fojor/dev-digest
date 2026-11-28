import type { IntentConfidence, IntentSource, PrIntentResponse } from "@devdigest/shared";
import { CONFIDENCE_LEVELS, FALLBACK_REASON, KNOWN_REASONS } from "./constants";

export type CardStateName = "none" | "classifying" | "failed" | "ready";

export interface CardState {
  state: CardStateName;
  lowConfidence: boolean;
  stale: boolean;
  hasUnavailableSources: boolean;
  /** Scope filtering is applied to reviews: ready, fresh, not low confidence, has in-scope items. */
  filterActive: boolean;
}

/** Pure derivation of what the intent card shows. `pending` = a classify request is in flight. */
export function cardState(resp: PrIntentResponse | undefined, pending: boolean): CardState {
  const intent = resp?.intent ?? null;
  const classifying = pending || !!resp?.classifying;
  const base = { lowConfidence: false, stale: false, hasUnavailableSources: false, filterActive: false };
  if (classifying) return { ...base, state: "classifying" };
  if (!intent) return { ...base, state: "none" };
  if (intent.status === "failed") return { ...base, state: "failed" };
  const lowConfidence = intent.confidence === "low";
  return {
    state: "ready",
    lowConfidence,
    stale: intent.stale,
    hasUnavailableSources: intent.sources.some((s) => s.status === "unavailable"),
    filterActive: !intent.stale && !lowConfidence && intent.in_scope.length > 0,
  };
}

export function confidenceTone(c: IntentConfidence): { color: string; bg: string } {
  return CONFIDENCE_LEVELS[c];
}

/** i18n key (under `intent.reasons`) for a reason code; unknown codes fall back to a generic one. */
export function sourceReasonKey(reason: string | null | undefined): string {
  const code = reason && KNOWN_REASONS.includes(reason) ? reason : FALLBACK_REASON;
  return `reasons.${code}`;
}

export function sourcesSummary(sources: readonly IntentSource[]): { fetched: number; unavailable: number } {
  return {
    fetched: sources.filter((s) => s.status === "fetched").length,
    unavailable: sources.filter((s) => s.status === "unavailable").length,
  };
}
