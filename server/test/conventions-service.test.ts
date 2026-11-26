import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import type { LLMProvider } from '@devdigest/shared';
import { ConventionsService, type RunLogLine } from '../src/modules/conventions/application/conventions.service.js';
import { LlmExtractionModel } from '../src/modules/conventions/infrastructure/extraction-model.js';
import { CloneSampleSource } from '../src/modules/conventions/infrastructure/sample-source.js';
import {
  ConventionNotFound,
  ExtractionFailed,
  ExtractionInProgress,
  RepoNotFound,
  RepoNotIndexed,
} from '../src/modules/conventions/domain/errors.js';
import type { ConventionsRepository } from '../src/modules/conventions/domain/ports.js';
import type { ConventionCandidateEntity, ScanFacts } from '../src/modules/conventions/domain/types.js';

const WS = 'ws-1';
const REPO = 'repo-1';

const API_TS = [
  "import { client } from './client';",
  '',
  'export async function load() {',
  '  return client.get("/blogs");',
  '}',
].join('\n');

/** In-memory ConventionsRepository (one repo in WS). */
function fakeRepo() {
  let rows: ConventionCandidateEntity[] = [];
  let scan: ScanFacts | null = null;
  let seq = 0;
  let failNextStore = false;
  const repo: ConventionsRepository = {
    findRepo: async (ws, id) => (ws === WS && id === REPO ? { id, fullName: 'o/r', scan } : null),
    listByRepo: async (ws, id) => rows.filter((r) => r.workspaceId === ws && r.repoId === id),
    findById: async (ws, id) => rows.find((r) => r.workspaceId === ws && r.id === id) ?? null,
    decidedRules: async (ws, id) =>
      rows
        .filter((r) => r.workspaceId === ws && r.repoId === id && r.status !== 'pending')
        .map((r) => ({ rule: r.rule, originalRule: r.originalRule })),
    replacePending: async ({ workspaceId, repoId, candidates, scan: s }) => {
      if (failNextStore) throw new Error('db down');
      rows = rows.filter((r) => r.status !== 'pending');
      for (const c of candidates) {
        rows.push({ ...c, id: `c${++seq}`, workspaceId, repoId, originalRule: c.rule, status: 'pending' });
      }
      scan = s;
    },
    update: async (ws, id, patch) => {
      const r = rows.find((x) => x.workspaceId === ws && x.id === id);
      if (!r) return null;
      Object.assign(r, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)));
      return r;
    },
  };
  return {
    repo,
    seed(rule: string, status: ConventionCandidateEntity['status'], originalRule = rule) {
      const r: ConventionCandidateEntity = {
        id: `c${++seq}`,
        workspaceId: WS,
        repoId: REPO,
        rule,
        originalRule,
        category: 'c',
        status,
        evidencePath: 'src/api.ts',
        evidenceSnippet: "import { client } from './client';",
        evidenceStartLine: 1,
        evidenceEndLine: 1,
        confidence: 0.5,
      };
      rows.push(r);
      return r;
    },
    get rows() {
      return rows;
    },
    get scan() {
      return scan;
    },
    failStore() {
      failNextStore = true;
    },
  };
}

const good = (rule: string, o: Record<string, unknown> = {}) => ({
  rule,
  category: 'api layer',
  evidence_path: 'src/api.ts',
  evidence_snippet: "import { client } from './client';",
  confidence: 0.6,
  ...o,
});

describe('ConventionsService (T8)', () => {
  let clone: string;
  let db: ReturnType<typeof fakeRepo>;
  let logs: RunLogLine[];
  let indexed: boolean;
  let ranked: string[];

  beforeEach(() => {
    clone = mkdtempSync(join(tmpdir(), 'conv-'));
    mkdirSync(join(clone, 'src'));
    writeFileSync(join(clone, 'src/api.ts'), API_TS);
    writeFileSync(join(clone, 'src/b.ts'), 'export const b = 2;\n');
    writeFileSync(join(clone, '.editorconfig'), 'root = true\nindent_style = space\n');
    writeFileSync(join(clone, '.env'), `TOKEN=${'k3'.repeat(12)}`);
    db = fakeRepo();
    logs = [];
    indexed = true;
    ranked = ['src/api.ts', 'src/b.ts'];
  });
  afterEach(() => rmSync(clone, { recursive: true, force: true }));

  function service(llm: LLMProvider, o: { timeoutMs?: number } = {}) {
    return new ConventionsService({
      repo: db.repo,
      samples: new CloneSampleSource({
        indexState: async () => (indexed ? { status: 'full' } : { status: 'degraded', degraded: true }),
        rankedPaths: async (_id, n) => ranked.slice(0, n),
        clonePath: async () => clone,
      }),
      model: new LlmExtractionModel({
        resolveModel: async () => ({ provider: 'openai', model: 'conv-model' }),
        llmFor: async () => llm,
        countTokens: (s) => Math.ceil(s.length / 4),
        timeoutMs: o.timeoutMs,
      }),
      log: (line) => logs.push(line),
      now: () => new Date('2026-11-26T10:00:00Z'),
    });
  }

  const mock = (candidates: unknown) =>
    new MockLLMProvider('openai', { structuredBySchema: { ConventionExtraction: { candidates } } });
  const modelCalls = (llm: MockLLMProvider) => llm.calls.filter((c) => c.method === 'completeStructured').length;

  it('happy run: verified candidates stored as pending, scan facts recorded, one model call, one log line naming the model (AC-01, AC-05)', async () => {
    const llm = mock([
      good('Use the shared client'),
      good('Fragment absent', { evidence_snippet: 'axios.create()' }),
      good('Out of sample', { evidence_path: '.env' }),
      good('Partial line', { evidence_snippet: 'client' }),
      { rule: 'missing fields' },
    ]);
    const r = await service(llm).extract(WS, REPO);
    expect(modelCalls(llm)).toBe(1);
    expect(r.newCount).toBe(1);
    expect(r.scanning).toBe(false);
    expect(r.scan).toEqual({ scannedAt: new Date('2026-11-26T10:00:00Z'), sampleCount: 2 });
    expect(r.candidates.map((c) => [c.rule, c.status, c.evidenceStartLine])).toEqual([
      ['Use the shared client', 'pending', 1],
    ]);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      repoId: REPO,
      model: 'conv-model',
      outcome: 'ok',
      proposed: 5,
      stored: 1,
      discarded: { invalid: 1, unverified: 3, secret: 0, repeat: 0, overLimit: 0 },
    });
    expect(typeof logs[0]!.durationMs).toBe('number');
    expect(JSON.stringify(logs)).not.toContain("import { client }");
  });

  it('not indexed / no sample files: refused before any model call, nothing stored (AC-02)', async () => {
    const llm = mock([good('x')]);
    indexed = false;
    await expect(service(llm).extract(WS, REPO)).rejects.toMatchObject({
      code: 'conventions_repo_not_indexed',
      details: { reason: 'not_indexed' },
    });
    indexed = true;
    ranked = [];
    await expect(service(llm).extract(WS, REPO)).rejects.toBeInstanceOf(RepoNotIndexed);
    await expect(service(llm).extract(WS, REPO)).rejects.toMatchObject({ details: { reason: 'no_sample_files' } });
    expect(modelCalls(llm)).toBe(0);
    expect(db.rows).toEqual([]);
    expect(db.scan).toBeNull();
  });

  it('model failure stores nothing and keeps previous candidates + scan facts; repo not scanning afterwards (AC-03)', async () => {
    const kept = db.seed('Previous pending', 'pending');
    const svc = service(mock('not a list'));
    await expect(svc.extract(WS, REPO)).rejects.toMatchObject({ reason: 'unreadable_answer' });
    expect(db.rows).toEqual([kept]);
    expect(db.scan).toBeNull();
    expect((await svc.list(WS, REPO)).scanning).toBe(false);
    expect(logs[0]).toMatchObject({ outcome: 'failed', reason: 'unreadable_answer' });

    const hang = new MockLLMProvider();
    hang.completeStructured = () => new Promise(() => {});
    await expect(service(hang, { timeoutMs: 20 }).extract(WS, REPO)).rejects.toBeInstanceOf(ExtractionFailed);
  });

  it('a store failure leaves the repo not scanning', async () => {
    const svc = service(mock([good('A')]));
    db.failStore();
    await expect(svc.extract(WS, REPO)).rejects.toThrow('db down');
    expect((await svc.list(WS, REPO)).scanning).toBe(false);
  });

  it('a second concurrent run is refused; changes are refused while scanning, reads still work (AC-04, AC-04b)', async () => {
    const c = db.seed('Decide me', 'pending');
    let release!: () => void;
    let started!: () => void;
    // Wait until the run is actually inside the LLM call — a fixed timeout is flaky under load.
    const entered = new Promise<void>((r) => (started = r));
    const slow = new MockLLMProvider();
    const real = mock([good('Use the shared client')]);
    slow.completeStructured = async (req) => {
      started();
      await new Promise<void>((r) => (release = r));
      return real.completeStructured(req);
    };
    const svc = service(slow);
    const first = svc.extract(WS, REPO);
    await entered;

    await expect(svc.extract(WS, REPO)).rejects.toBeInstanceOf(ExtractionInProgress);
    await expect(svc.updateCandidate(WS, c.id, { status: 'accepted' })).rejects.toBeInstanceOf(ExtractionInProgress);
    await expect(svc.updateCandidate(WS, c.id, { rule: 'x' })).rejects.toBeInstanceOf(ExtractionInProgress);
    expect((await svc.list(WS, REPO)).scanning).toBe(true);

    release();
    await first;
    expect((await svc.list(WS, REPO)).scanning).toBe(false);
    const accepted = db.rows.find((r) => r.rule === 'Use the shared client')!;
    await expect(svc.updateCandidate(WS, accepted.id, { status: 'accepted' })).resolves.toMatchObject({ status: 'accepted' });
  });

  it('a fresh service (server restart) never reports a repo as scanning', async () => {
    expect((await service(mock([])).list(WS, REPO)).scanning).toBe(false);
  });

  it('foreign workspace: list, extract and change behave as not found (AC-08)', async () => {
    const c = db.seed('Mine', 'pending');
    const svc = service(mock([good('x')]));
    await expect(svc.list('other-ws', REPO)).rejects.toBeInstanceOf(RepoNotFound);
    await expect(svc.extract('other-ws', REPO)).rejects.toBeInstanceOf(RepoNotFound);
    await expect(svc.updateCandidate('other-ws', c.id, { status: 'accepted' })).rejects.toBeInstanceOf(ConventionNotFound);
    await expect(svc.updateCandidate(WS, 'nope', { status: 'accepted' })).rejects.toBeInstanceOf(ConventionNotFound);
  });

  it('re-scan: decisions kept, repeats of decided rules dropped, new_count 0 keeps the list (AC-07, AC-13)', async () => {
    db.seed('Accepted edited', 'accepted', 'Accepted original');
    db.seed('Rejected rule', 'rejected');
    db.seed('Old pending', 'pending');
    const llm = mock([good('ACCEPTED   original'), good('rejected rule'), good('accepted edited')]);
    const r = await service(llm).extract(WS, REPO);
    expect(r.newCount).toBe(0);
    expect(r.candidates.map((c) => c.rule).sort()).toEqual(['Accepted edited', 'Rejected rule']);
    expect(logs[0]!.discarded.repeat).toBe(3);
    const user = JSON.stringify((llm.calls[0]!.req as { messages: unknown }).messages);
    expect(user).toContain('Accepted original');
    expect(user).toContain('Accepted edited');
  });

  it('drops credential-bearing candidates and keeps at most 20, lowest confidence first (AC-24, §6)', async () => {
    const fake = `sk-ant-${'a1B2'.repeat(8)}`;
    const many = Array.from({ length: 22 }, (_, i) => good(`Rule ${i}`, { confidence: i / 100 }));
    const r = await service(mock([...many, good(`Key ${fake}`, { confidence: 1 })])).extract(WS, REPO);
    expect(r.newCount).toBe(20);
    expect(r.candidates.map((c) => c.rule)).not.toContain('Rule 0');
    expect(r.candidates.map((c) => c.rule)).not.toContain('Rule 1');
    expect(JSON.stringify(db.rows)).not.toContain(fake);
    expect(logs[0]!.discarded).toMatchObject({ secret: 1, overLimit: 2 });
  });

  it('updateCandidate: status and trimmed rule; not found otherwise (AC-09..AC-11)', async () => {
    const c = db.seed('Original', 'pending');
    const svc = service(mock([]));
    expect((await svc.updateCandidate(WS, c.id, { status: 'rejected' })).status).toBe('rejected');
    const edited = await svc.updateCandidate(WS, c.id, { rule: 'Edited' });
    expect(edited).toMatchObject({ rule: 'Edited', originalRule: 'Original', status: 'rejected' });
  });
});
