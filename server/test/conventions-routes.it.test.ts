import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';
import type { LLMProvider } from '@devdigest/shared';
import { ConventionCandidate, ConventionList, ExtractionResult } from '@devdigest/shared';
import { DOMAIN_STATUS } from '../src/platform/errors.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const API_TS = "import { client } from './client';\n\nexport const load = () => client.get('/x');\n";
const CANDIDATE = {
  rule: 'Use the shared client',
  category: 'api layer',
  evidence_path: 'src/api.ts',
  evidence_snippet: "import { client } from './client';",
  confidence: 0.7,
};

/** T10 — conventions routes per contracts/openapi.yaml, wired through the container. */
d('conventions routes (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let clone: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    clone = mkdtempSync(join(tmpdir(), 'conv-clone-'));
    mkdirSync(join(clone, 'src'));
    writeFileSync(join(clone, 'src/api.ts'), API_TS);
  });
  afterAll(async () => {
    await pg?.stop();
    rmSync(clone, { recursive: true, force: true });
  });

  function repoIntel(indexed = true): RepoIntel {
    return {
      getIndexState: async () =>
        indexed ? { status: 'full' } : { status: 'degraded', degraded: true, degradedReason: 'no_data' },
      getConventionSamples: async () => ['src/api.ts'],
    } as unknown as RepoIntel;
  }

  function makeApp(o: { llm?: LLMProvider; indexed?: boolean } = {}) {
    return buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        llm: {
          openai:
            o.llm ??
            new MockLLMProvider('openai', { structuredBySchema: { ConventionExtraction: { candidates: [CANDIDATE] } } }),
        },
        repoIntel: repoIntel(o.indexed ?? true),
        git: new MockGitClient({ head: 'f00dcafe' }),
      },
    });
  }

  async function newRepo(ws = workspaceId) {
    const name = `r${Math.random().toString(36).slice(2, 8)}`;
    const [r] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'o', name, fullName: `o/${name}`, clonePath: clone })
      .returning();
    return r!.id;
  }

  it('maps the four new domain codes', () => {
    expect(DOMAIN_STATUS).toMatchObject({
      conventions_repo_not_indexed: 409,
      conventions_scan_in_progress: 409,
      conventions_extraction_failed: 502,
      convention_not_found: 404,
    });
  });

  it('GET list of a never-scanned repo; unknown repo → 404 repo_not_found', async () => {
    const app = await makeApp();
    const repoId = await newRepo();
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    expect(res.statusCode).toBe(200);
    expect(ConventionList.parse(res.json())).toEqual({ scan: null, scanning: false, candidates: [] });

    const missing = await app.inject({ method: 'GET', url: `/repos/00000000-0000-4000-8000-000000000000/conventions` });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('repo_not_found');
  });

  it('POST extract → 200 ExtractionResult; list shows the stored pending candidate', async () => {
    const llm = new MockLLMProvider('openai', { structuredBySchema: { ConventionExtraction: { candidates: [CANDIDATE] } } });
    const app = await makeApp({ llm });
    const repoId = await newRepo();
    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(res.statusCode).toBe(200);
    const body = ExtractionResult.parse(res.json());
    expect(body.new_count).toBe(1);
    expect(body.scanning).toBe(false);
    expect(body.scan).toMatchObject({ sample_count: 1 });
    expect(body.candidates[0]).toMatchObject({
      rule: CANDIDATE.rule,
      original_rule: CANDIDATE.rule,
      status: 'pending',
      evidence_start_line: 1,
      evidence_end_line: 1,
      evidence_commit_sha: 'f00dcafe',
    });
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);
    const list = ConventionList.parse((await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json());
    expect(list.candidates).toHaveLength(1);
  });

  it('POST extract on a not-indexed repo → 409 conventions_repo_not_indexed, no model call', async () => {
    const llm = new MockLLMProvider();
    const app = await makeApp({ llm, indexed: false });
    const repoId = await newRepo();
    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatchObject({ code: 'conventions_repo_not_indexed', details: { reason: 'not_indexed' } });
    expect(llm.calls).toHaveLength(0);
  });

  it('POST extract with a failing model → 502 conventions_extraction_failed with a reason', async () => {
    const llm = new MockLLMProvider('openai', { structuredBySchema: { ConventionExtraction: { candidates: 'nope' } } });
    const app = await makeApp({ llm });
    const repoId = await newRepo();
    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toMatchObject({
      code: 'conventions_extraction_failed',
      details: { reason: 'unreadable_answer' },
    });
  });

  it('PATCH: accept, edit (trimmed), field limits, unknown fields, not found, foreign workspace', async () => {
    const app = await makeApp();
    const repoId = await newRepo();
    const extracted = ExtractionResult.parse(
      (await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` })).json(),
    );
    const id = extracted.candidates[0]!.id;
    const patch = (payload: unknown, cid = id) =>
      app.inject({ method: 'PATCH', url: `/conventions/${cid}`, payload: payload as object });

    const acc = await patch({ status: 'accepted' });
    expect(acc.statusCode).toBe(200);
    expect(ConventionCandidate.parse(acc.json()).status).toBe('accepted');

    const edited = ConventionCandidate.parse((await patch({ rule: '  New rule text  ' })).json());
    expect(edited).toMatchObject({ rule: 'New rule text', original_rule: CANDIDATE.rule, status: 'accepted', category: 'api layer' });

    expect((await patch({ rule: 'x'.repeat(1000) })).statusCode).toBe(200);
    for (const bad of [{ rule: 'x'.repeat(1001) }, { rule: '   ' }, {}, { category: 'x' }, { confidence: 1 }, { status: 'maybe' }]) {
      const r = await patch(bad);
      expect(r.statusCode).toBe(422);
      expect(r.json().error.code).toBe('validation_error');
    }

    const nf = await patch({ status: 'accepted' }, '00000000-0000-4000-8000-000000000000');
    expect(nf.statusCode).toBe(404);
    expect(nf.json().error.code).toBe('convention_not_found');

    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other' }).returning();
    const foreignRepo = await newRepo(other!.id);
    const [foreign] = await pg.handle.db
      .insert(t.conventions)
      .values({ workspaceId: other!.id, repoId: foreignRepo, rule: 'secret rule' })
      .returning();
    const fr = await patch({ status: 'accepted' }, foreign!.id);
    expect(fr.statusCode).toBe(404);
    expect(JSON.stringify(fr.json())).not.toContain('secret rule');
    expect((await app.inject({ method: 'GET', url: `/repos/${foreignRepo}/conventions` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/repos/${foreignRepo}/conventions/extract` })).statusCode).toBe(404);
  });

  it('while a scan runs: second extract → 409, PATCH → 409, list shows scanning', async () => {
    let release!: () => void;
    const real = new MockLLMProvider('openai', { structuredBySchema: { ConventionExtraction: { candidates: [CANDIDATE] } } });
    const slow = new MockLLMProvider();
    slow.completeStructured = async (req) => {
      await new Promise<void>((r) => (release = r));
      return real.completeStructured(req);
    };
    const app = await makeApp({ llm: slow });
    const repoId = await newRepo();
    const [row] = await pg.handle.db
      .insert(t.conventions)
      .values({
        workspaceId,
        repoId,
        rule: 'existing',
        originalRule: 'existing',
        category: 'c',
        evidencePath: 'src/api.ts',
        evidenceSnippet: "import { client } from './client';",
        evidenceStartLine: 1,
        evidenceEndLine: 1,
        confidence: 0.5,
      })
      .returning();

    const first = app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    await new Promise((r) => setTimeout(r, 50));

    const second = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('conventions_scan_in_progress');
    const change = await app.inject({ method: 'PATCH', url: `/conventions/${row!.id}`, payload: { status: 'accepted' } });
    expect(change.statusCode).toBe(409);
    expect(change.json().error.code).toBe('conventions_scan_in_progress');
    const during = ConventionList.parse((await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json());
    expect(during.scanning).toBe(true);

    release();
    expect((await first).statusCode).toBe(200);
  });
});
