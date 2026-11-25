import { describe, it, expect } from 'vitest';
import {
  ConventionCandidate,
  ConventionStatus,
  ConventionScan,
  ConventionList,
  ExtractionResult,
  ConventionPatch,
  Skill,
} from '@devdigest/shared';

/** T2 — the shared conventions / skill contracts (openapi.yaml components). */
const CANDIDATE = {
  id: '00000000-0000-7000-8000-000000000001',
  rule: 'Errors are surfaced via toast',
  original_rule: 'Errors are surfaced via toast',
  category: 'error handling',
  evidence_path: 'client/src/context/AppContext.jsx',
  evidence_snippet: 'toast.error(error.message)',
  evidence_start_line: 25,
  evidence_end_line: 25,
  confidence: 0.6,
  status: 'accepted',
};

describe('conventions contracts', () => {
  it('ConventionCandidate carries status, category, line range and original_rule (no accepted flag)', () => {
    const c = ConventionCandidate.parse(CANDIDATE);
    expect(c.status).toBe('accepted');
    expect(c).not.toHaveProperty('accepted');
    expect(ConventionStatus.options).toEqual(['pending', 'accepted', 'rejected']);
    expect(ConventionCandidate.safeParse({ ...CANDIDATE, status: 'maybe' }).success).toBe(false);
    expect(ConventionCandidate.safeParse({ ...CANDIDATE, evidence_start_line: 0 }).success).toBe(false);
  });

  it('rule 1..1000 and category 1..40 at the boundary', () => {
    const ok = (o: object) => ConventionCandidate.safeParse({ ...CANDIDATE, ...o }).success;
    expect(ok({ rule: 'x'.repeat(1000), category: 'c'.repeat(40) })).toBe(true);
    expect(ok({ rule: 'x'.repeat(1001) })).toBe(false);
    expect(ok({ category: 'c'.repeat(41) })).toBe(false);
    expect(ok({ rule: '' })).toBe(false);
    expect(ok({ category: '' })).toBe(false);
  });

  it('ConventionList and ExtractionResult', () => {
    expect(ConventionList.parse({ scan: null, scanning: false, candidates: [] }).scan).toBeNull();
    const scan = { scanned_at: '2026-11-26T10:00:00Z', sample_count: 12 };
    expect(ConventionScan.safeParse({ ...scan, sample_count: 13 }).success).toBe(false);
    const r = ExtractionResult.parse({ scan, scanning: false, candidates: [CANDIDATE], new_count: 1 });
    expect(r.new_count).toBe(1);
    expect(ExtractionResult.safeParse({ scan, scanning: false, candidates: [] }).success).toBe(false);
    expect(
      ExtractionResult.safeParse({ scan, scanning: false, candidates: [], new_count: 21 }).success,
    ).toBe(false);
  });

  it('ConventionPatch: status or trimmed rule, at least one, nothing else', () => {
    expect(ConventionPatch.parse({ status: 'rejected' })).toEqual({ status: 'rejected' });
    expect(ConventionPatch.parse({ rule: '  new rule  ' })).toEqual({ rule: 'new rule' });
    expect(ConventionPatch.safeParse({}).success).toBe(false);
    expect(ConventionPatch.safeParse({ rule: '   ' }).success).toBe(false);
    expect(ConventionPatch.safeParse({ rule: 'x'.repeat(1001) }).success).toBe(false);
    expect(ConventionPatch.safeParse({ category: 'x' }).success).toBe(false);
    expect(ConventionPatch.safeParse({ confidence: 1 }).success).toBe(false);
  });

  it('Skill accepts an optional updated_at', () => {
    const base = {
      id: 's1',
      name: 'repo-conventions',
      description: 'd',
      type: 'convention',
      source: 'extracted',
      body: 'b',
      enabled: false,
      version: 1,
    };
    expect(Skill.parse(base).updated_at).toBeUndefined();
    expect(Skill.parse({ ...base, updated_at: '2026-11-26T10:00:00Z' }).updated_at).toBe(
      '2026-11-26T10:00:00Z',
    );
  });
});
