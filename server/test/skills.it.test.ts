import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { Review } from '@devdigest/shared';
import { eq } from 'drizzle-orm';
import { renderSkillBlock } from '@devdigest/reviewer-core';
import { TiktokenTokenizer } from '../src/adapters/tokenizer/index.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  retries: 3,
   redisUrl: x,`;

const EMPTY_REVIEW: Review = { verdict: 'approve', summary: 'ok', score: 100, findings: [] };

/**
 * M2 skills: CRUD + import preview over HTTP, per-agent links with order and
 * enabled, and the review prompt — only skills enabled on the link AND
 * globally reach the trace's prompt-assembly, in link order, with a token count.
 */
d('M2 skills (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    return buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: new MockLLMProvider('openai', { structured: EMPTY_REVIEW }) },
      },
    });
  }

  async function createSkill(app: Awaited<ReturnType<typeof makeApp>>, name: string, body = `${name} rules`) {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name, description: `Use when ${name}.`, type: 'rubric', body },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; version: number };
  }

  it('CRUD: create (v1, manual), edit bumps version, toggle does not, delete → 404', async () => {
    const app = await makeApp();
    const s = await createSkill(app, 'crud-skill');
    expect(s.version).toBe(1);

    const edited = (
      await app.inject({ method: 'PUT', url: `/skills/${s.id}`, payload: { body: 'new rules' } })
    ).json();
    expect(edited).toMatchObject({ version: 2, body: 'new rules', source: 'manual' });

    const toggled = (
      await app.inject({ method: 'PUT', url: `/skills/${s.id}`, payload: { enabled: false } })
    ).json();
    expect(toggled).toMatchObject({ version: 2, enabled: false });

    const list = (await app.inject({ method: 'GET', url: '/skills' })).json();
    expect(list.some((x: { id: string }) => x.id === s.id)).toBe(true);

    expect((await app.inject({ method: 'DELETE', url: `/skills/${s.id}` })).statusCode).toBe(200);
    const gone = await app.inject({ method: 'GET', url: `/skills/${s.id}` });
    expect(gone.statusCode).toBe(404);
    expect(gone.json().error.code).toBe('skill_not_found');
    await app.close();
  });

  it('import preview stores nothing; confirm saves with source "imported"', async () => {
    const app = await makeApp();
    const before = (await app.inject({ method: 'GET', url: '/skills' })).json().length;
    const md = '---\nname: imported-one\ndescription: Flag X.\n---\n# Rules';
    const preview = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'imported-one.md', content_base64: Buffer.from(md).toString('base64') },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({ name: 'imported-one', body: '# Rules', ignored_files: [] });
    expect((await app.inject({ method: 'GET', url: '/skills' })).json()).toHaveLength(before);

    const bad = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'x.zip', content_base64: Buffer.from('nope').toString('base64') },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('invalid_skill_import');

    const saved = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { ...preview.json(), source: 'imported' },
    });
    expect(saved.statusCode).toBe(201);
    expect(saved.json().source).toBe('imported');
    await app.close();
  });

  it('agent links keep order + per-agent enabled; only enabled skills reach the prompt', async () => {
    const app = await makeApp();
    const first = await createSkill(app, 'first-skill');
    const second = await createSkill(app, 'second-skill');
    const unchecked = await createSkill(app, 'unchecked-skill');
    const globallyOff = await createSkill(app, 'globally-off-skill');
    await app.inject({ method: 'PUT', url: `/skills/${globallyOff.id}`, payload: { enabled: false } });

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Skilled', provider: 'openai', model: 'gpt-4.1', system_prompt: 'review' },
      })
    ).json();

    const links = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: {
        skills: [
          { skill_id: second.id, enabled: true },
          { skill_id: unchecked.id, enabled: false },
          { skill_id: first.id, enabled: true },
          { skill_id: globallyOff.id, enabled: true },
        ],
      },
    });
    expect(links.statusCode).toBe(200);
    expect(links.json().map((l: { skill_id: string; enabled: boolean; order: number }) => [l.skill_id, l.enabled, l.order])).toEqual([
      [second.id, true, 0],
      [unchecked.id, false, 1],
      [first.id, true, 2],
      [globallyOff.id, true, 3],
    ]);

    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'skills-repo', fullName: 'acme/skills-repo' })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 7,
        title: 'Add retries',
        author: 'dev',
        branch: 'feat/retries',
        base: 'main',
        headSha: 'abc',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();

    const run = await app.inject({ method: 'POST', url: `/pulls/${pr!.id}/review`, payload: { agentId: agent.id } });
    expect(run.statusCode).toBe(200);
    await waitForPrRuns(pg.handle.db, pr!.id, { expected: 1 });
    // agent_runs flips to `done` just before the trace document is written.
    const runId = run.json().runs[0].run_id;
    let res = await app.inject({ method: 'GET', url: `/runs/${runId}/trace` });
    for (let i = 0; res.statusCode === 404 && i < 40; i++) {
      await new Promise((r) => setTimeout(r, 25));
      res = await app.inject({ method: 'GET', url: `/runs/${runId}/trace` });
    }
    const trace = res.json();
    const block: string = trace.prompt_assembly.skills;
    expect(block).toContain('### Skill: second-skill');
    expect(block).toContain('### Skill: first-skill');
    expect(block.indexOf('second-skill')).toBeLessThan(block.indexOf('first-skill'));
    expect(block).not.toContain('unchecked-skill');
    expect(block).not.toContain('globally-off-skill');
    expect(trace.prompt_assembly.skills_tokens).toBeGreaterThan(0);
    expect(trace.prompt_assembly.user).toContain('## Skills / rules');
    expect(trace.log.some((l: { msg: string }) => l.msg.includes('Loaded 2 skill(s): second-skill, first-skill'))).toBe(true);
    await app.close();
  });

  // ---- Phase 2: run_skills, attribution, stats, versions ------------------

  function finding(id: string, skill: string | null, category: 'bug' | 'test' = 'bug') {
    return {
      id, severity: 'WARNING', category, title: `t-${id}`, file: 'src/config.ts',
      start_line: 11, end_line: 11, rationale: 'r', confidence: 0.9, kind: 'finding', skill,
    };
  }

  async function makePull(number: number) {
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: `p2-repo-${number}`, fullName: `acme/p2-repo-${number}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId, repoId: repo!.id, number, title: 'Phase 2', author: 'dev', branch: 'f', base: 'main',
        headSha: 'abc', additions: 1, deletions: 0, filesCount: 1, status: 'needs_review',
      })
      .returning();
    return pr!;
  }

  it('records run_skills, attributes findings to prompt skills only, and serves stats', async () => {
    const tagged: Review = {
      verdict: 'comment', summary: 's', score: 80,
      findings: [finding('a', 'p2-alpha'), finding('b', 'not-a-skill'), finding('c', null, 'test'), finding('d', 'p2-beta')],
    } as Review;
    const app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: new MockLLMProvider('openai', { structured: tagged }) },
      },
    });
    const alpha = await createSkill(app, 'p2-alpha', 'alpha rules');
    const beta = await createSkill(app, 'p2-beta', 'beta rules');
    const agent = (
      await app.inject({
        method: 'POST', url: '/agents',
        payload: { name: 'P2 agent', provider: 'openai', model: 'gpt-4.1', system_prompt: 'review' },
      })
    ).json();
    await app.inject({
      method: 'POST', url: `/agents/${agent.id}/skills`,
      payload: { skills: [{ skill_id: alpha.id, enabled: true }, { skill_id: beta.id, enabled: false }] },
    });

    // An old run (outside the 30-day window) must not count.
    const [old] = await pg.handle.db
      .insert(t.agentRuns)
      .values({ workspaceId, agentId: agent.id, status: 'done', ranAt: new Date(Date.now() - 40 * 86_400_000) })
      .returning();
    await pg.handle.db.insert(t.runSkills).values({ runId: old!.id, skillId: beta.id, skillVersion: 1, position: 0, tokens: 1 });

    const pr = await makePull(501_001);
    const run = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    expect(run.statusCode).toBe(200);
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const runId = run.json().runs[0].run_id;
    let traceRes = await app.inject({ method: 'GET', url: `/runs/${runId}/trace` });
    for (let i = 0; traceRes.statusCode === 404 && i < 40; i++) {
      await new Promise((r) => setTimeout(r, 25));
      traceRes = await app.inject({ method: 'GET', url: `/runs/${runId}/trace` });
    }

    // AC20 — one run_skills row per prompt skill (the unchecked link has none).
    const rs = await pg.handle.db.select().from(t.runSkills).where(eq(t.runSkills.runId, runId));
    const expectedTokens = new TiktokenTokenizer().count(
      renderSkillBlock({ name: 'p2-alpha', description: 'Use when p2-alpha.', body: 'alpha rules' }),
    );
    expect(rs).toEqual([{ runId, skillId: alpha.id, skillVersion: 1, position: 0, tokens: expectedTokens }]);
    expect(traceRes.json().prompt_assembly.skills_tokens).toBe(expectedTokens);

    // AC18 — the editor's counter equals the run's per-skill tokens.
    const tokens = await app.inject({
      method: 'POST', url: '/skills/tokens',
      payload: { name: 'p2-alpha', description: 'Use when p2-alpha.', body: 'alpha rules' },
    });
    expect(tokens.json()).toEqual({ tokens: expectedTokens });

    // AC21 — only a tag naming a skill from THIS run's prompt is kept.
    const [review] = await pg.handle.db.select().from(t.reviews).where(eq(t.reviews.runId, runId));
    const rows = await pg.handle.db.select().from(t.findings).where(eq(t.findings.reviewId, review!.id));
    const byTitle = Object.fromEntries(rows.map((r) => [r.title, r.skillId]));
    expect(byTitle).toEqual({ 't-a': alpha.id, 't-b': null, 't-c': null, 't-d': null });

    // AC22/23/24 — stats.
    let stats = (await app.inject({ method: 'GET', url: `/skills/${alpha.id}/stats` })).json();
    expect(stats).toMatchObject({
      skill_id: alpha.id, window_days: 30, used_by: 1, pull_rate: 1, accept_rate: null, findings: 1,
      runs_with_skill: 1, runs_total: 1, agents: [{ id: agent.id, name: 'P2 agent' }],
      categories: [{ category: 'bug', count: 1 }],
    });
    const findingA = rows.find((r) => r.title === 't-a')!;
    expect((await app.inject({ method: 'POST', url: `/findings/${findingA.id}/accept` })).statusCode).toBe(200);
    stats = (await app.inject({ method: 'GET', url: `/skills/${alpha.id}/stats` })).json();
    expect(stats.accept_rate).toBe(1);

    // Beta: unchecked link → not "used by", pulled in 0 of 1 window runs.
    const betaStats = (await app.inject({ method: 'GET', url: `/skills/${beta.id}/stats` })).json();
    expect(betaStats).toMatchObject({ used_by: 0, pull_rate: 0, runs_total: 1, findings: 0, agents: [], categories: [] });

    // AC25 — one batch call for the cards.
    const summary = (await app.inject({ method: 'GET', url: '/skills/stats' })).json();
    expect(summary.find((x: { skill_id: string }) => x.skill_id === alpha.id)).toEqual({
      skill_id: alpha.id, used_by: 1, pull_rate: 1, accept_rate: 1,
    });

    // An unlinked skill: empty states.
    const lonely = await createSkill(app, 'p2-lonely');
    expect((await app.inject({ method: 'GET', url: `/skills/${lonely.id}/stats` })).json()).toMatchObject({
      used_by: 0, pull_rate: null, accept_rate: null, findings: 0,
    });
    await app.close();
  });

  it('versions: notes, newest first, restore appends; 404 for unknown version', async () => {
    const app = await makeApp();
    const s = await createSkill(app, 'p2-versioned', 'first body');
    await app.inject({ method: 'PUT', url: `/skills/${s.id}`, payload: { body: 'second body', note: 'tightened' } });
    await app.inject({ method: 'PUT', url: `/skills/${s.id}`, payload: { enabled: false } });
    await app.inject({ method: 'PUT', url: `/skills/${s.id}`, payload: { name: 'p2-renamed' } });

    let versions = (await app.inject({ method: 'GET', url: `/skills/${s.id}/versions` })).json();
    expect(versions.map((v: { version: number; note: string; kind: string; current: boolean }) => [v.version, v.kind, v.note, v.current])).toEqual([
      [3, 'edit', 'Renamed to p2-renamed', true],
      [2, 'edit', 'tightened', false],
      [1, 'create', 'Created', false],
    ]);

    const restored = await app.inject({ method: 'POST', url: `/skills/${s.id}/versions/1/restore` });
    expect(restored.statusCode).toBe(200);
    expect(restored.json()).toMatchObject({ version: 4, body: 'first body', name: 'p2-versioned' });
    versions = (await app.inject({ method: 'GET', url: `/skills/${s.id}/versions` })).json();
    expect(versions[0]).toMatchObject({ version: 4, kind: 'restore', note: 'Restored from v1', current: true });
    expect(versions).toHaveLength(4);

    const missing = await app.inject({ method: 'POST', url: `/skills/${s.id}/versions/99/restore` });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('skill_version_not_found');

    const imported = await app.inject({
      method: 'POST', url: '/skills',
      payload: { name: 'p2-imp', description: '', type: 'custom', body: 'x', source: 'imported', source_file: 'SKILL.md' },
    });
    const iv = (await app.inject({ method: 'GET', url: `/skills/${imported.json().id}/versions` })).json();
    expect(iv[0]).toMatchObject({ kind: 'import', note: 'Imported from SKILL.md' });
    await app.close();
  });
});
