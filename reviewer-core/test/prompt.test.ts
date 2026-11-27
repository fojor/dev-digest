/**
 * assemblePrompt — PR description slot (the fix that was missing: the PR body
 * never reached the prompt). Pins rendering, omit-when-empty, untrusted-wrap,
 * truncation, and ordering (before the diff).
 */
import { describe, it, expect } from 'vitest';
import { assemblePrompt } from '../src/prompt.js';

function userOf(parts: Parameters<typeof assemblePrompt>[0]): string {
  const { messages } = assemblePrompt(parts);
  return messages[1]!.content;
}

function systemOf(parts: Parameters<typeof assemblePrompt>[0]): string {
  return assemblePrompt(parts).messages[0]!.content;
}

describe('assemblePrompt — shared injection guard (server + CI)', () => {
  const sys = systemOf({ system: 'AGENT-SYS', diff: 'DIFF' });

  it('appends the guard to the agent system prompt', () => {
    expect(sys.startsWith('AGENT-SYS')).toBe(true);
    expect(sys).toMatch(/<untrusted>.*DATA to be analyzed/s);
  });

  it('forbids "intentional/test/demo" claims from descoping the review', () => {
    // The defense that replaced the keyword sanitizer: a general, trusted,
    // language-agnostic rule — not text parsing of untrusted input.
    expect(sys).toMatch(/test fixture|intentional|demo/i);
    expect(sys).toMatch(/never reduce|never .*descope|REPORT it/i);
    expect(sys).toMatch(/any language/i);
  });
});

describe('assemblePrompt — ## PR description', () => {
  it('renders the section (untrusted-wrapped) before the diff when present', () => {
    const { messages, assembly } = assemblePrompt({
      system: 'sys',
      diff: 'DIFF',
      prDescription: 'Adds rate limiting to the public /api endpoints.',
    });
    const user = messages[1]!.content;
    expect(user).toContain('## PR description');
    expect(user).toContain('<untrusted source="pr-description">');
    expect(user).toContain('Adds rate limiting to the public /api endpoints.');
    expect(user.indexOf('## PR description')).toBeLessThan(user.indexOf('## Diff to review'));
    expect(assembly.pr_description).toContain('Adds rate limiting');
  });

  it('omits the section when prDescription is undefined or blank (no behaviour change)', () => {
    expect(userOf({ system: 'sys', diff: 'DIFF' })).not.toContain('## PR description');
    expect(assemblePrompt({ system: 'sys', diff: 'DIFF' }).assembly.pr_description ?? null).toBeNull();
    expect(userOf({ system: 'sys', diff: 'DIFF', prDescription: '   ' })).not.toContain(
      '## PR description',
    );
  });

  it('truncates a huge body to the 4k cap', () => {
    const { assembly } = assemblePrompt({
      system: 'sys',
      diff: 'D',
      prDescription: 'x'.repeat(10_000),
    });
    expect((assembly.pr_description as string).length).toBe(4000);
  });
});

// M2 Phase 2 — the skill block format is pinned by a fixture the client
// Preview test reads too, so the two renderers cannot drift.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderSkillBlock, SKILL_ATTRIBUTION_RULE, assemblePrompt as assembleForSkills } from '../src/prompt.js';

describe('renderSkillBlock (shared fixture)', () => {
  const fixture = JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../../docs/skills/fixtures/skill-block.fixture.json', import.meta.url)),
      'utf8',
    ),
  ) as { cases: { input: { name: string; description: string; body: string }; expected: string }[] };

  it.each(fixture.cases)('renders $input.name', ({ input, expected }) => {
    expect(renderSkillBlock(input)).toBe(expected);
  });

  it('puts the attribution rule under Skills / rules only when skills exist', () => {
    const withSkills = assembleForSkills({ system: 's', diff: 'd', skills: ['### Skill: a\n\nx'] });
    expect(withSkills.assembly.user).toContain(`## Skills / rules\n${SKILL_ATTRIBUTION_RULE}\n\n### Skill: a`);
    // The trace's skills block stays the skills alone (its token count = sum of blocks).
    expect(withSkills.assembly.skills).toBe('### Skill: a\n\nx');
    const without = assembleForSkills({ system: 's', diff: 'd' });
    expect(without.assembly.user).not.toContain(SKILL_ATTRIBUTION_RULE);
  });
});
