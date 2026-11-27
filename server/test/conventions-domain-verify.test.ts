import { describe, it, expect } from 'vitest';
import { normalizeCandidates } from '../src/modules/conventions/domain/normalize.js';
import { verifyEvidence } from '../src/modules/conventions/domain/verify-evidence.js';
import {
  RepoNotIndexed,
  ExtractionInProgress,
  ExtractionFailed,
  ConventionNotFound,
} from '../src/modules/conventions/domain/errors.js';

const raw = (o: Record<string, unknown> = {}) => ({
  rule: 'Use the shared API client',
  category: 'api layer',
  evidence_path: 'src/api.ts',
  evidence_snippet: "import { client } from './client';",
  confidence: 0.7,
  ...o,
});

describe('normalizeCandidates (AC-03b)', () => {
  it('cuts rule to 1000 and category to 40, clamps confidence into 0..1', () => {
    const { kept, discarded } = normalizeCandidates([
      raw({ rule: 'r'.repeat(1500), category: 'c'.repeat(60), confidence: 7 }),
      raw({ confidence: -0.5 }),
    ]);
    expect(discarded).toBe(0);
    expect(kept[0]!.rule).toHaveLength(1000);
    expect(kept[0]!.category).toHaveLength(40);
    expect(kept[0]!.confidence).toBe(1);
    expect(kept[1]!.confidence).toBe(0);
  });

  it('trims text fields before cutting', () => {
    const { kept } = normalizeCandidates([raw({ rule: '  spaced rule  ', category: ' api ' })]);
    expect(kept[0]).toMatchObject({ rule: 'spaced rule', category: 'api' });
  });

  it('drops candidates missing a required field and counts them', () => {
    const { kept, discarded } = normalizeCandidates([
      raw({ rule: undefined }),
      raw({ category: '   ' }),
      raw({ evidence_path: 42 }),
      raw({ evidence_snippet: '' }),
      raw({ confidence: 'high' }),
      raw({ confidence: Number.NaN }),
      null,
      'not an object',
      raw(),
    ]);
    expect(kept).toHaveLength(1);
    expect(discarded).toBe(8);
  });
});

describe('verifyEvidence (AC-05)', () => {
  const file = [
    "import { client } from './client';",
    '',
    'export async function load() {',
    '  const res = await client.get("/blogs");',
    '  return res.data;',
    '}',
    '',
    '  const res = await client.get("/blogs");',
  ].join('\n');
  const analysed = new Map([
    ['src/api.ts', file],
    ['src/crlf.ts', 'const a = 1;\r\nconst b = 2;\r\n'],
  ]);

  it('keeps an exact single full line and records its line range', () => {
    expect(verifyEvidence({ path: 'src/api.ts', snippet: "import { client } from './client';" }, analysed)).toEqual({
      ok: true,
      startLine: 1,
      endLine: 1,
    });
  });

  it('matches across whitespace and indentation differences, multi-line, first occurrence', () => {
    const r = verifyEvidence(
      { path: 'src/api.ts', snippet: 'const res   = await client.get("/blogs");\n return res.data;' },
      analysed,
    );
    expect(r).toEqual({ ok: true, startLine: 4, endLine: 5 });
  });

  it('first occurrence wins when the fragment appears twice', () => {
    const r = verifyEvidence({ path: 'src/api.ts', snippet: 'const res = await client.get("/blogs");' }, analysed);
    expect(r).toEqual({ ok: true, startLine: 4, endLine: 4 });
  });

  it('ignores CRLF vs LF', () => {
    expect(verifyEvidence({ path: 'src/crlf.ts', snippet: 'const a = 1;\nconst b = 2;' }, analysed)).toEqual({
      ok: true,
      startLine: 1,
      endLine: 2,
    });
  });

  it('discards a path outside the analysed set', () => {
    expect(verifyEvidence({ path: 'src/other.ts', snippet: 'x' }, analysed)).toEqual({
      ok: false,
      reason: 'not_analysed',
    });
  });

  it('discards traversal and absolute paths even if they normalise to an analysed file', () => {
    for (const path of ['../src/api.ts', 'src/../src/api.ts', '/src/api.ts', './src/api.ts', 'src\\api.ts']) {
      expect(verifyEvidence({ path, snippet: "import { client } from './client';" }, analysed)).toEqual({
        ok: false,
        reason: 'not_analysed',
      });
    }
  });

  it('discards an absent fragment', () => {
    expect(verifyEvidence({ path: 'src/api.ts', snippet: 'axios.get(url)' }, analysed)).toEqual({
      ok: false,
      reason: 'fragment_absent',
    });
  });

  it('discards a fragment shorter than one complete non-blank line', () => {
    expect(verifyEvidence({ path: 'src/api.ts', snippet: 'client.get' }, analysed)).toEqual({
      ok: false,
      reason: 'partial_line',
    });
    // The tail of one line + the head of the next covers no complete line.
    expect(verifyEvidence({ path: 'src/api.ts', snippet: '("/blogs");\n return' }, analysed)).toEqual({
      ok: false,
      reason: 'partial_line',
    });
    expect(verifyEvidence({ path: 'src/api.ts', snippet: '   \n  ' }, analysed)).toEqual({
      ok: false,
      reason: 'partial_line',
    });
  });

  it('a partial line next to a full one is still kept (≥ 1 complete line)', () => {
    expect(
      verifyEvidence({ path: 'src/api.ts', snippet: 'return res.data;\n}' }, analysed),
    ).toEqual({ ok: true, startLine: 5, endLine: 6 });
  });
});

describe('conventions domain errors', () => {
  it('carry stable codes and no HTTP status', () => {
    expect(new RepoNotIndexed('not_indexed').code).toBe('conventions_repo_not_indexed');
    expect(new RepoNotIndexed('no_sample_files').details).toEqual({ reason: 'no_sample_files' });
    expect(new ExtractionInProgress().code).toBe('conventions_scan_in_progress');
    expect(new ExtractionFailed('timeout').code).toBe('conventions_extraction_failed');
    expect(new ExtractionFailed('timeout').details).toEqual({ reason: 'timeout' });
    expect(new ConventionNotFound().code).toBe('convention_not_found');
  });
});
