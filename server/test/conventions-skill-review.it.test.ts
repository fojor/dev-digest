import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const DIFF = `diff --git a/src/api.ts b/src/api.ts
--- a/src/api.ts
+++ b/src/api.ts
@@ -1,2 +1,3 @@
 import { client } from './client';
+import axios from 'axios';
 export const load = () => client.get('/x');`;

const EMPTY_REVIEW: Review = { verdict: 'approve', summary: 'ok', score: 100, findings: [] };
const RULE = 'HTTP access goes through the shared client module';

/**
 * T15 / AC-22 — a saved conventions skill (type convention, source extracted)
 * reaches an agent's review prompt like any other skill once it is enabled and
 * linked; while it is still disabled (the default for a new one), it does not.
 */
d('conventions skill in the review prompt (Testcontainers pg)', () => {
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

  const makeApp = () =>
    buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: new MockLLMProvider('openai', { structured: EMPTY_REVIEW }) },
      },
    });

  let prNumber = 100;
  async function reviewSkillsBlock(app: Awaited<ReturnType<typeof makeApp>>, agentId: string): Promise<string> {
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: `conv-${prNumber}`, fullName: `acme/conv-${prNumber}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: prNumber++,
        title: 'Use axios',
        author: 'dev',
        branch: 'feat/axios',
        base: 'main',
        headSha: 'abc',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();
    const run = await app.inject({ method: 'POST', url: `/pulls/${pr!.id}/review`, payload: { agentId } });
    expect(run.statusCode).toBe(200);
    await waitForPrRuns(pg.handle.db, pr!.id, { expected: 1 });
    const runId = run.json().runs[0].run_id;
    let res = await app.inject({ method: 'GET', url: `/runs/${runId}/trace` });
    for (let i = 0; res.statusCode === 404 && i < 40; i++) {
      await new Promise((r) => setTimeout(r, 25));
      res = await app.inject({ method: 'GET', url: `/runs/${runId}/trace` });
    }
    return (res.json().prompt_assembly.skills as string | null) ?? '';
  }

  it('absent while disabled; present in the skills block once enabled and linked', async () => {
    const app = await makeApp();
    const skill = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: {
          name: 'repo-conventions',
          description: '1 house convention extracted from acme/web',
          type: 'convention',
          source: 'extracted',
          enabled: false,
          body: `# repo-conventions\n\nFlag changes that violate any rule below.\n\n## api layer\n${RULE}\nDetected in \`src/api.ts:1-1\`.\n`,
          evidence_files: ['src/api.ts'],
        },
      })
    ).json();
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Conventions reviewer', provider: 'openai', model: 'gpt-4.1', system_prompt: 'review' },
      })
    ).json();
    const link = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skills: [{ skill_id: skill.id, enabled: true }] },
    });
    expect(link.statusCode).toBe(200);

    const before = await reviewSkillsBlock(app, agent.id);
    expect(before).not.toContain(RULE);

    await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { enabled: true } });
    const after = await reviewSkillsBlock(app, agent.id);
    expect(after).toContain('### Skill: repo-conventions');
    expect(after).toContain(RULE);
  });
});
