import { describe, it, expect } from 'vitest';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';
import { EXPERIMENT_PRS } from '../src/db/seed-experiment.js';
import { TEST_QUALITY_SKILLS } from '../src/db/seed-skills.js';

/** Same assembly as reviews' diffFromPrFiles (the path a seeded PR is reviewed through). */
function diffOf(files: { path: string; patch: string }[]) {
  return parseUnifiedDiff(
    files.flatMap((f) => [`diff --git a/${f.path} b/${f.path}`, `--- a/${f.path}`, `+++ b/${f.path}`, f.patch]).join('\n'),
  );
}

describe('M2 control-experiment seed', () => {
  it('#501 parses into the refund module and its happy-path-only test', () => {
    const pr = EXPERIMENT_PRS.find((p) => p.number === 501)!;
    const diff = diffOf(pr.files);
    const refund = diff.files.find((f) => f.path === 'src/payments/refund.ts')!;
    expect(refund.additions).toBe(pr.files[0]!.additions);
    // the guard branches a skilled review should flag are grounded lines
    const covered = refund.hunks.flatMap((h) => h.newLineNumbers);
    for (const line of [12, 15, 18, 22]) expect(covered).toContain(line);
    expect(diff.files.map((f) => f.path)).toContain('src/payments/refund.test.ts');
  });

  it('#502 parses with hunk counts that match the patch', () => {
    const pr = EXPERIMENT_PRS.find((p) => p.number === 502)!;
    const [file] = diffOf(pr.files).files;
    expect(file).toMatchObject({ path: 'src/api/routes/users.ts', additions: 5, deletions: 4 });
    const [hunk] = file!.hunks;
    expect(hunk!.newLineNumbers).toHaveLength(hunk!.newLines);
  });

  it('seeded skills have directive descriptions and unique names', () => {
    expect(new Set(TEST_QUALITY_SKILLS.map((s) => s.name)).size).toBe(TEST_QUALITY_SKILLS.length);
    for (const s of TEST_QUALITY_SKILLS) expect(s.description).toMatch(/^(Flag|Check)/);
  });
});
