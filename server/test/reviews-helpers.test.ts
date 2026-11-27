import { describe, it, expect } from 'vitest';
import { attributeFindings, taskLine } from '../src/modules/reviews/application/helpers.js';

/**
 * Unit coverage for the review task-line. The key invariant: our trusted
 * instruction always tells the model to review the whole diff and never
 * withhold a security/correctness finding — no matter what the PR text claims.
 */

describe('taskLine', () => {
  const pull = { number: 3, title: 'test: vulnerable fixture', author: 'burnjohn' } as never;

  it('names the PR being reviewed', () => {
    const line = taskLine(pull);
    expect(line).toContain('#3');
    expect(line).toContain('test: vulnerable fixture');
  });

  it('keeps the non-negotiable "never withhold security" rule', () => {
    const line = taskLine(pull);
    expect(line).toMatch(/never .*withhold .*(or downgrade )?.*security/i);
    expect(line).toMatch(/review the entire diff/i);
  });
});

describe('attributeFindings', () => {
  const f = (skill: string | null | undefined) =>
    ({ id: 'x', severity: 'WARNING', category: 'bug', title: 't', file: 'a', start_line: 1, end_line: 1, rationale: 'r', confidence: 1, skill }) as never;
  it('keeps only tags that name a skill from the run prompt', () => {
    const out = attributeFindings([f('alpha'), f('ghost'), f(null), f(undefined), f('')], [{ id: 'id-a', name: 'alpha' }]);
    expect(out.map((x) => x.skillId)).toEqual(['id-a', null, null, null, null]);
  });
});
