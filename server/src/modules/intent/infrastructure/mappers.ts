import { z } from 'zod';
import { IntentConfidence, IntentSource } from '@devdigest/shared';
import type * as t from '../../../db/schema.js';
import type { Confidence, IntentEntity, IntentSourceEntity } from '../domain/types.js';

type Row = typeof t.prIntent.$inferSelect;
type Insert = typeof t.prIntent.$inferInsert;

const Sources = z.array(IntentSource);

/** Rows are written by this module; a malformed jsonb column degrades to an empty list, not a 500. */
function parseSources(raw: unknown): IntentSourceEntity[] {
  const r = Sources.safeParse(raw);
  return r.success ? r.data : [];
}

function parseConfidence(raw: string): Confidence {
  const r = IntentConfidence.safeParse(raw);
  return r.success ? r.data : 'low';
}

export function toEntity(r: Row): IntentEntity {
  return {
    prId: r.prId,
    status: r.status === 'failed' ? 'failed' : 'ok',
    error: r.error,
    summary: r.intent,
    inScope: r.inScope,
    outOfScope: r.outOfScope,
    confidence: parseConfidence(r.confidence),
    confidenceReasons: r.confidenceReasons,
    sources: parseSources(r.sources),
    promptComponents: r.promptComponents,
    headSha: r.headSha,
    inputHash: r.inputHash,
    provider: r.provider,
    model: r.model,
    tokensIn: r.tokensIn,
    tokensOut: r.tokensOut,
    costUsd: r.costUsd,
    classifiedAt: r.classifiedAt,
  };
}

/** The DB column `intent` holds the summary text. */
export function toRow(e: IntentEntity): Insert {
  return {
    prId: e.prId,
    intent: e.summary,
    inScope: e.inScope,
    outOfScope: e.outOfScope,
    status: e.status,
    error: e.error,
    confidence: e.confidence,
    confidenceReasons: e.confidenceReasons,
    sources: e.sources,
    promptComponents: e.promptComponents,
    headSha: e.headSha,
    inputHash: e.inputHash,
    provider: e.provider,
    model: e.model,
    tokensIn: e.tokensIn,
    tokensOut: e.tokensOut,
    costUsd: e.costUsd,
    classifiedAt: e.classifiedAt,
  };
}
