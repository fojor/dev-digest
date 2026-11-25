import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/**
 * T7 — the skills API learns what the conventions modal needs (ADR-0002):
 * source `extracted` on create (version kind create), `evidence_files` on
 * create and update, and `updated_at` (latest version time) on the list.
 */
d('skills API for extracted skills (Testcontainers pg)', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const makeApp = () =>
    buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: { llm: { openai: new MockLLMProvider('openai') } },
    });

  const extracted = {
    name: 'repo-conventions',
    description: '2 house conventions extracted from o/r',
    type: 'convention',
    source: 'extracted',
    enabled: false,
    body: '# repo-conventions\n\nFlag changes that violate any rule below.',
    evidence_files: ['src/a.ts', 'src/b.ts'],
  };

  it('creates an extracted convention skill at v1 with evidence files, kind create', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'POST', url: '/skills', payload: extracted });
    expect(res.statusCode).toBe(201);
    const s = res.json();
    expect(s).toMatchObject({
      type: 'convention',
      source: 'extracted',
      version: 1,
      enabled: false,
      evidence_files: ['src/a.ts', 'src/b.ts'],
    });
    const versions = (await app.inject({ method: 'GET', url: `/skills/${s.id}/versions` })).json();
    expect(versions[0]).toMatchObject({ version: 1, kind: 'create' });
  });

  it('update replaces content as a new version, sets evidence files, keeps agent links', async () => {
    const app = await makeApp();
    const s = (await app.inject({ method: 'POST', url: '/skills', payload: { ...extracted, name: 'conv-upd' } })).json();
    const [agent] = await pg.handle.db.select().from(t.agents);
    const link = await app.inject({
      method: 'POST',
      url: `/agents/${agent!.id}/skills`,
      payload: { skills: [{ skill_id: s.id, enabled: true }] },
    });
    expect(link.statusCode).toBeLessThan(300);

    const upd = await app.inject({
      method: 'PUT',
      url: `/skills/${s.id}`,
      payload: { name: 'conv-upd', description: 'new', body: 'new body', enabled: true, evidence_files: ['src/c.ts'] },
    });
    expect(upd.statusCode).toBe(200);
    expect(upd.json()).toMatchObject({ version: 2, body: 'new body', enabled: true, evidence_files: ['src/c.ts'] });

    const history = (await app.inject({ method: 'GET', url: `/skills/${s.id}/versions` })).json();
    expect(history.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(history[1].body).toBe(extracted.body);

    const links = await pg.handle.db.select().from(t.agentSkills);
    expect(links.some((l) => l.skillId === s.id && l.agentId === agent!.id)).toBe(true);
  });

  it('list exposes updated_at = the latest version time', async () => {
    const app = await makeApp();
    const s = (await app.inject({ method: 'POST', url: '/skills', payload: { ...extracted, name: 'conv-time' } })).json();
    const first = (await app.inject({ method: 'GET', url: '/skills' })).json().find((x: { id: string }) => x.id === s.id);
    expect(typeof first.updated_at).toBe('string');
    await new Promise((r) => setTimeout(r, 20));
    await app.inject({ method: 'PUT', url: `/skills/${s.id}`, payload: { body: 'v2 body' } });
    const second = (await app.inject({ method: 'GET', url: '/skills' })).json().find((x: { id: string }) => x.id === s.id);
    expect(new Date(second.updated_at).getTime()).toBeGreaterThan(new Date(first.updated_at).getTime());
  });

  it('existing validation stays: unknown source and over-long evidence list are refused', async () => {
    const app = await makeApp();
    const bad = await app.inject({ method: 'POST', url: '/skills', payload: { ...extracted, source: 'community' } });
    expect(bad.statusCode).toBe(422);
    const many = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { ...extracted, evidence_files: Array.from({ length: 21 }, (_, i) => `f${i}.ts`) },
    });
    expect(many.statusCode).toBe(422);
  });
});
