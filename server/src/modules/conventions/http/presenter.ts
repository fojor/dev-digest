import type {
  ConventionCandidate as ConventionCandidateDto,
  ConventionList as ConventionListDto,
  ExtractionResult as ExtractionResultDto,
} from '@devdigest/shared';
import type { ConventionListView, ExtractionView } from '../application/conventions.service.js';
import type { ConventionCandidateEntity } from '../domain/types.js';

/** Domain → API contract (snake_case). */
export function presentCandidate(c: ConventionCandidateEntity): ConventionCandidateDto {
  return {
    id: c.id,
    rule: c.rule,
    original_rule: c.originalRule,
    category: c.category,
    evidence_path: c.evidencePath,
    evidence_snippet: c.evidenceSnippet,
    evidence_start_line: c.evidenceStartLine,
    evidence_end_line: c.evidenceEndLine,
    confidence: c.confidence,
    status: c.status,
  };
}

export function presentList(v: ConventionListView): ConventionListDto {
  return {
    scan: v.scan
      ? { scanned_at: v.scan.scannedAt.toISOString(), sample_count: v.scan.sampleCount }
      : null,
    scanning: v.scanning,
    candidates: v.candidates.map(presentCandidate),
  };
}

export function presentExtraction(v: ExtractionView): ExtractionResultDto {
  return { ...presentList(v), new_count: v.newCount };
}
