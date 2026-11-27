import { describe, it, expect } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { SkillsService } from '../src/modules/skills/application/skills.service.js';
import { FflateArchiveReader } from '../src/adapters/archive/index.js';
import { InvalidSkillImport, SkillNotFound, SkillVersionNotFound } from '../src/modules/skills/domain/errors.js';
import type { SkillsRepository } from '../src/modules/skills/domain/ports.js';
import type { NewSkill, Skill, SkillVersionEntry } from '../src/modules/skills/domain/types.js';

/** In-memory SkillsRepository; the UoW just hands it over. */
function fakeRepo() {
  const rows = new Map<string, Skill>();
  const versions: SkillVersionEntry[] = [];
  const repo: SkillsRepository = {
    list: async (ws) => [...rows.values()].filter((s) => s.workspaceId === ws),
    getById: async (ws, id) => {
      const s = rows.get(id);
      return s && s.workspaceId === ws ? s : undefined;
    },
    create: async (input: NewSkill, version) => {
      const s: Skill = {
        id: `s${rows.size + 1}`,
        workspaceId: input.workspaceId,
        name: input.name,
        description: input.description,
        type: input.type,
        source: input.source ?? 'manual',
        body: input.body,
        enabled: input.enabled ?? true,
        version,
        evidenceFiles: null,
        createdAt: new Date(0),
      };
      rows.set(s.id, s);
      return s;
    },
    save: async (s) => (rows.set(s.id, s), s),
    delete: async (ws, id) => rows.get(id)?.workspaceId === ws && rows.delete(id),
    appendVersion: async (e) => void versions.push({ ...e, createdAt: new Date(0) }),
    listVersions: async (skillId) =>
      versions.filter((v) => v.skillId === skillId).sort((a, b) => b.version - a.version),
    getVersion: async (skillId, version) =>
      versions.find((v) => v.skillId === skillId && v.version === version),
    listEnabledForAgent: async () => [],
  };
  return { repo, versions };
}

function makeService() {
  const { repo, versions } = fakeRepo();
  const service = new SkillsService({
    skills: repo,
    uow: { run: (work) => work({ skills: repo }) },
    archive: new FflateArchiveReader(),
    stats: {
      summaries: async () => [],
      forSkill: async (_ws, skillId) => ({
        skillId,
        usedBy: 0,
        pullRate: null,
        acceptRate: null,
        findings: 0,
        runsWithSkill: 0,
        runsTotal: 0,
        agents: [],
        categories: [],
      }),
    },
    // Deterministic stand-in for the tokenizer: one token per character.
    countTokens: (text) => text.length,
  });
  return { service, versions };
}

const SKILL_MD = '---\nname: api-contract\ndescription: Flag breaking route changes.\n---\n# Rules\n- check';

describe('SkillsService CRUD', () => {
  it('create records v1; a body edit records v2; toggling does not', async () => {
    const { service, versions } = makeService();
    const s = await service.create({
      workspaceId: 'w1',
      name: 'a',
      description: 'd',
      type: 'custom',
      body: 'b1',
    });
    await service.update('w1', s.id, { body: 'b2' });
    const toggled = await service.update('w1', s.id, { enabled: false });
    expect(toggled).toMatchObject({ version: 2, enabled: false, body: 'b2' });
    expect(versions.map((v) => [v.version, v.body, v.kind, v.note])).toEqual([
      [1, 'b1', 'create', 'Created'],
      [2, 'b2', 'edit', 'Edited body'],
    ]);
  });

  it('snapshots full content; a typed note wins over the auto note', async () => {
    const { service, versions } = makeService();
    const s = await service.create({ workspaceId: 'w1', name: 'a', description: 'd', type: 'custom', body: 'b' });
    await service.update('w1', s.id, { name: 'a2', type: 'rubric' });
    await service.update('w1', s.id, { body: 'b2' }, '  tightened rules  ');
    expect(versions[1]).toMatchObject({ name: 'a2', type: 'rubric', description: 'd', body: 'b', note: 'Renamed to a2; Type: custom → rubric' });
    expect(versions[2]!.note).toBe('tightened rules');
  });

  it('an import save records kind import with the source file', async () => {
    const { service, versions } = makeService();
    await service.create({
      workspaceId: 'w1', name: 'a', description: '', type: 'custom', body: 'b',
      source: 'imported', sourceFile: 'pkg/SKILL.md',
    });
    expect(versions[0]).toMatchObject({ kind: 'import', note: 'Imported from pkg/SKILL.md' });
  });

  it('restore appends a new version with the old content; history is not rewritten', async () => {
    const { service, versions } = makeService();
    const s = await service.create({ workspaceId: 'w1', name: 'a', description: 'd', type: 'custom', body: 'v1 body' });
    await service.update('w1', s.id, { body: 'v2 body', name: 'renamed' });
    const restored = await service.restoreVersion('w1', s.id, 1);
    expect(restored).toMatchObject({ version: 3, body: 'v1 body', name: 'a' });
    expect(versions.map((v) => v.version)).toEqual([1, 2, 3]);
    expect(versions[2]).toMatchObject({ kind: 'restore', note: 'Restored from v1' });
    const list = await service.listVersions('w1', s.id);
    expect(list.map((v) => [v.version, v.current])).toEqual([[3, true], [2, false], [1, false]]);
    await expect(service.restoreVersion('w1', s.id, 9)).rejects.toBeInstanceOf(SkillVersionNotFound);
    await expect(service.restoreVersion('w2', s.id, 1)).rejects.toBeInstanceOf(SkillNotFound);
  });

  it('restoring a body-only (Phase 1) snapshot keeps the current name/description/type', async () => {
    const { service, versions } = makeService();
    const s = await service.create({ workspaceId: 'w1', name: 'a', description: 'd', type: 'custom', body: 'old' });
    // Simulate a Phase 1 row: body only.
    Object.assign(versions[0]!, { name: null, description: null, type: null, note: null, kind: null });
    await service.update('w1', s.id, { body: 'new', type: 'security' });
    const restored = await service.restoreVersion('w1', s.id, 1);
    expect(restored).toMatchObject({ body: 'old', name: 'a', type: 'security' });
  });

  it('counts tokens of the rendered prompt block', () => {
    const { service } = makeService();
    const block = '### Skill: n\n_d_\n\nb';
    expect(service.countTokens({ name: 'n', description: ' d ', body: ' b ' })).toBe(block.length);
  });

  it('is workspace-scoped', async () => {
    const { service } = makeService();
    const s = await service.create({ workspaceId: 'w1', name: 'a', description: '', type: 'custom', body: 'b' });
    await expect(service.get('w2', s.id)).rejects.toBeInstanceOf(SkillNotFound);
    await expect(service.update('w2', s.id, { body: 'x' })).rejects.toBeInstanceOf(SkillNotFound);
    await expect(service.delete('w2', s.id)).rejects.toBeInstanceOf(SkillNotFound);
  });
});

describe('SkillsService.previewImport', () => {
  it('parses a markdown file', () => {
    const { service } = makeService();
    const p = service.previewImport({ filename: 'api.md', bytes: strToU8(SKILL_MD) });
    expect(p).toMatchObject({
      name: 'api-contract',
      description: 'Flag breaking route changes.',
      type: 'custom',
      body: '# Rules\n- check',
      sourceFile: 'api.md',
      ignoredFiles: [],
      warnings: [],
    });
  });

  it('takes only SKILL.md from a zip and lists (never reads) the scripts', () => {
    const { service } = makeService();
    const zip = zipSync({
      'api-contract/SKILL.md': strToU8(SKILL_MD),
      'api-contract/scripts/install.sh': strToU8('rm -rf /'),
      'api-contract/references/rest.md': strToU8('# REST'),
    });
    const p = service.previewImport({ filename: 'api-contract.zip', bytes: zip });
    expect(p.sourceFile).toBe('api-contract/SKILL.md');
    expect(p.body).toBe('# Rules\n- check');
    expect(p.body).not.toContain('rm -rf');
    expect(p.ignoredFiles).toEqual([
      { path: 'api-contract/scripts/install.sh', executable: true },
      { path: 'api-contract/references/rest.md', executable: false },
    ]);
    expect(p.warnings.join(' ')).toMatch(/1 executable file/);
  });

  it('rejects an archive without SKILL.md, a broken zip, other file types and empty files', () => {
    const { service } = makeService();
    const noCore = zipSync({ 'README.md': strToU8('# hi') });
    expect(() => service.previewImport({ filename: 'x.zip', bytes: noCore })).toThrow(/no SKILL\.md/);
    expect(() => service.previewImport({ filename: 'x.zip', bytes: strToU8('not a zip') })).toThrow(
      InvalidSkillImport,
    );
    expect(() => service.previewImport({ filename: 'x.sh', bytes: strToU8('echo') })).toThrow(/\.md file or a \.zip/);
    expect(() => service.previewImport({ filename: 'x.md', bytes: new Uint8Array() })).toThrow(/empty/);
  });

  it('rejects uploads over the size cap and non-text markdown', () => {
    const { service } = makeService();
    const big = new Uint8Array(512 * 1024 + 1).fill(65);
    expect(() => service.previewImport({ filename: 'x.md', bytes: big })).toThrow(/larger than/);
    expect(() => service.previewImport({ filename: 'x.md', bytes: new Uint8Array([0x61, 0x00]) })).toThrow(
      /not text/,
    );
  });
});
