import type { PrIntentRecord, PrIntentResponse } from '@devdigest/shared';
import type { IntentView } from '../domain/types.js';

export function presentIntent(v: IntentView): PrIntentRecord {
  return {
    pr_id: v.prId,
    status: v.status,
    error: v.error,
    summary: v.summary,
    in_scope: v.inScope,
    out_of_scope: v.outOfScope,
    confidence: v.confidence,
    confidence_reasons: v.confidenceReasons,
    sources: v.sources,
    head_sha: v.headSha,
    stale: v.stale,
    provider: v.provider,
    model: v.model,
    tokens_in: v.tokensIn,
    tokens_out: v.tokensOut,
    cost_usd: v.costUsd,
    classified_at: v.classifiedAt.toISOString(),
  };
}

export function presentResponse(
  prId: string,
  intent: IntentView | null,
  classifying: boolean,
): PrIntentResponse {
  return { pr_id: prId, intent: intent ? presentIntent(intent) : null, classifying };
}
