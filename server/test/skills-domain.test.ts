import { describe, it, expect } from 'vitest';
import {
  applySkillPatch,
  creationNote,
  rate,
  statsWindowStart,
  versionNote,
  ignoredFilesOf,
  isExecutablePath,
  parseFrontmatter,
  parseSkillMarkdown,
  pickSkillFile,
  slugify,
} from '../src/modules/skills/domain/policies.js';
import type { Skill } from '../src/modules/skills/domain/types.js';

const skill: Skill = {
  id: 's1',
  workspaceId: 'w1',
  name: 'edge-cases',
  description: 'Flag missing corner cases.',
  type: 'rubric',
  source: 'manual',
  body: '# Rules',
  enabled: true,
  version: 3,
  evidenceFiles: null,
  createdAt: new Date(0),
};

describe('applySkillPatch', () => {
  it('bumps the version on a content change', () => {
    const { next, versionBumped } = applySkillPatch(skill, { body: '# Rules v2' });
    expect(versionBumped).toBe(true);
    expect(next).toMatchObject({ body: '# Rules v2', version: 4 });
  });

  it('keeps the version when only `enabled` changes or nothing changes', () => {
    expect(applySkillPatch(skill, { enabled: false })).toMatchObject({
      versionBumped: false,
      next: { enabled: false, version: 3 },
    });
    expect(applySkillPatch(skill, { name: 'edge-cases', body: undefined }).versionBumped).toBe(false);
  });
});

describe('parseFrontmatter', () => {
  it('reads plain, quoted and block-scalar values and strips the header', () => {
    const { meta, body } = parseFrontmatter(
      [
        '---',
        'name: "api-contract"',
        'description: >',
        '  Flag breaking changes',
        '  to public routes.',
        'type: security',
        'metadata:',
        '  nested: ignored',
        '---',
        '# Body',
      ].join('\n'),
    );
    expect(meta).toMatchObject({
      name: 'api-contract',
      description: 'Flag breaking changes to public routes.',
      type: 'security',
    });
    expect(body).toBe('# Body');
  });

  it('returns the whole text as body when there is no frontmatter', () => {
    expect(parseFrontmatter('# Just markdown')).toEqual({ meta: {}, body: '# Just markdown' });
  });
});

describe('parseSkillMarkdown', () => {
  it('falls back to the heading for the name, custom type, and warns', () => {
    const p = parseSkillMarkdown('# Test Quality Rubric\n\n- check branches', 'file');
    expect(p.name).toBe('test-quality-rubric');
    expect(p.type).toBe('custom');
    expect(p.warnings.join(' ')).toMatch(/name/);
    expect(p.warnings.join(' ')).toMatch(/description/);
  });

  it('ignores an unknown type', () => {
    const p = parseSkillMarkdown('---\nname: x\ndescription: d\ntype: magic\n---\nbody', 'f');
    expect(p).toMatchObject({ name: 'x', description: 'd', type: 'custom', body: 'body', warnings: [] });
  });
});

describe('archive rules', () => {
  it('flags runnable entries', () => {
    expect(isExecutablePath('scripts/run.txt')).toBe(true);
    expect(isExecutablePath('my-skill/scripts/check')).toBe(true);
    expect(isExecutablePath('tool.py')).toBe(true);
    expect(isExecutablePath('references/guide.md')).toBe(false);
  });

  it('picks the shallowest SKILL.md, case-insensitive, skipping OS junk', () => {
    expect(pickSkillFile(['__MACOSX/SKILL.md', 'a/b/SKILL.md', 'a/skill.md'])).toBe('a/skill.md');
    expect(pickSkillFile(['README.md'])).toBeUndefined();
  });

  it('lists everything but the core and directories as ignored', () => {
    expect(ignoredFilesOf(['s/', 's/SKILL.md', 's/scripts/x.sh', 's/ref.md'], 's/SKILL.md')).toEqual([
      { path: 's/scripts/x.sh', executable: true },
      { path: 's/ref.md', executable: false },
    ]);
  });

  it('slugifies free text', () => {
    expect(slugify('  PR Quality — Rubric! ')).toBe('pr-quality-rubric');
  });
});

describe('version notes + stats helpers', () => {
  const base = { name: 'a', description: 'd', type: 'custom' as const, body: 'b' };
  it('builds an auto note from the changed fields', () => {
    expect(versionNote(base, { ...base, body: 'x' })).toBe('Edited body');
    expect(versionNote(base, { ...base, name: 'z', description: 'e' })).toBe('Renamed to z; Edited description');
    expect(versionNote(base, { ...base, type: 'rubric' }, '   ')).toBe('Type: custom → rubric');
    expect(versionNote(base, { ...base, body: 'x' }, 'why')).toBe('why');
    expect(versionNote(base, base, 'x'.repeat(300))).toHaveLength(200);
  });
  it('creation notes', () => {
    expect(creationNote('manual')).toBe('Created');
    expect(creationNote('imported', 'SKILL.md')).toBe('Imported from SKILL.md');
    expect(creationNote('imported')).toBe('Imported');
  });
  it('rate and window', () => {
    expect(rate(1, 4)).toBe(0.25);
    expect(rate(0, 0)).toBeNull();
    expect(statsWindowStart(new Date('2026-02-01T00:00:00Z')).toISOString()).toBe('2026-01-02T00:00:00.000Z');
  });
});
