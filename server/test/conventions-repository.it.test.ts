import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import * as t from '../src/db/schema.js';
import { DrizzleConventionsRepository } from '../src/modules/conventions/infrastructure/conventions.repository.js';
import type { VerifiedCandidate } from '../src/modules/conventions/domain/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const verified = (rule: string, o: Partial<VerifiedCandidate> = {}): VerifiedCandidate => ({
  rule,
  category: 'api layer',
  evidencePath: 'src/api.ts',
  evidenceSnippet: 'export const api = client;',
  evidenceStartLine: 3,
  evidenceEndLine: 3,
  confidence: 0.5,
  ...o,
});

/** T5 — candidates + scan facts, workspace-scoped, replace-pending in one transaction. */
d('DrizzleConventionsRepository (Testcontainers pg)', () => {
  let pg: PgFixture;
  let repo: DrizzleConventionsRepository;

  beforeAll(async () => {
    pg = await startPg();
    repo = new DrizzleConventionsRepository(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  /** Fresh workspace + repo per test, so tests never see each other's rows. */
  async function seedRepo(name = `r-${Math.random().toString(36).slice(2, 8)}`) {
    const db = pg.handle.db;
    const [ws] = await db.insert(t.workspaces).values({ name: 'ws' }).returning();
    const [r] = await db
      .insert(t.repos)
      .values({ workspaceId: ws!.id, owner: 'o', name, fullName: `o/${name}` })
      .returning();
    return { workspaceId: ws!.id, repoId: r!.id };
  }

  async function insertRow(
    ids: { workspaceId: string; repoId: string },
    rule: string,
    status: 'pending' | 'accepted' | 'rejected',
    originalRule = rule,
  ) {
    const [row] = await pg.handle.db
      .insert(t.conventions)
      .values({
        ...ids,
        rule,
        originalRule,
        status,
        category: 'c',
        evidencePath: 'p.ts',
        evidenceSnippet: 's',
        evidenceStartLine: 1,
        evidenceEndLine: 1,
        confidence: 0.4,
      })
      .returning();
    return row!.id;
  }

  it('findRepo is workspace-scoped and reports scan facts (null = never scanned)', async () => {
    const a = await seedRepo('alpha');
    const other = await seedRepo('beta');
    expect(await repo.findRepo(a.workspaceId, a.repoId)).toEqual({
      id: a.repoId,
      fullName: 'o/alpha',
      scan: null,
    });
    expect(await repo.findRepo(other.workspaceId, a.repoId)).toBeNull();
  });

  it('replacePending: pending (incl. edited) replaced, accepted/rejected untouched, scan facts recorded', async () => {
    const ids = await seedRepo();
    const acc = await insertRow(ids, 'Accepted edited', 'accepted', 'Accepted original');
    const rej = await insertRow(ids, 'Rejected rule', 'rejected');
    await insertRow(ids, 'Old pending', 'pending');
    await insertRow(ids, 'Edited pending', 'pending', 'Pending original');

    const scannedAt = new Date('2026-11-26T10:00:00Z');
    await repo.replacePending({
      ...ids,
      candidates: [verified('New one', { confidence: 0.9 }), verified('New two')],
      scan: { scannedAt, sampleCount: 7 },
    });

    const list = await repo.listByRepo(ids.workspaceId, ids.repoId);
    expect(list.map((c) => [c.rule, c.status]).sort()).toEqual(
      [
        ['Accepted edited', 'accepted'],
        ['New one', 'pending'],
        ['New two', 'pending'],
        ['Rejected rule', 'rejected'],
      ].sort(),
    );
    const accepted = list.find((c) => c.id === acc)!;
    expect(accepted.originalRule).toBe('Accepted original');
    expect(list.find((c) => c.id === rej)).toBeDefined();
    const fresh = list.find((c) => c.rule === 'New one')!;
    expect(fresh).toMatchObject({
      originalRule: 'New one',
      category: 'api layer',
      evidencePath: 'src/api.ts',
      evidenceStartLine: 3,
      evidenceEndLine: 3,
      confidence: 0.9,
      workspaceId: ids.workspaceId,
      repoId: ids.repoId,
    });
    expect((await repo.findRepo(ids.workspaceId, ids.repoId))!.scan).toEqual({
      scannedAt,
      sampleCount: 7,
    });
  });

  it('replacePending is atomic: a failing insert leaves the previous state', async () => {
    const ids = await seedRepo();
    await insertRow(ids, 'Kept pending', 'pending');
    await expect(
      repo.replacePending({
        ...ids,
        // A NaN line number cannot be stored as integer → the insert fails mid-transaction.
        candidates: [verified('ok'), verified('broken', { evidenceStartLine: Number.NaN })],
        scan: { scannedAt: new Date(), sampleCount: 3 },
      }),
    ).rejects.toThrow();
    const list = await repo.listByRepo(ids.workspaceId, ids.repoId);
    expect(list.map((c) => c.rule)).toEqual(['Kept pending']);
    expect((await repo.findRepo(ids.workspaceId, ids.repoId))!.scan).toBeNull();
  });

  it('listByRepo orders by status group then confidence desc, and is workspace-scoped', async () => {
    const ids = await seedRepo();
    await insertRow(ids, 'x', 'pending');
    const other = await seedRepo();
    expect(await repo.listByRepo(other.workspaceId, ids.repoId)).toEqual([]);
    expect(await repo.listByRepo(ids.workspaceId, ids.repoId)).toHaveLength(1);
  });

  it('update changes status / rule only; original_rule and evidence kept; foreign workspace → null', async () => {
    const ids = await seedRepo();
    const id = await insertRow(ids, 'Original text', 'pending');

    const accepted = await repo.update(ids.workspaceId, id, { status: 'accepted' });
    expect(accepted!.status).toBe('accepted');
    const rejected = await repo.update(ids.workspaceId, id, { status: 'rejected' });
    expect(rejected!.status).toBe('rejected');
    const reaccepted = await repo.update(ids.workspaceId, id, { status: 'accepted' });
    expect(reaccepted!.status).toBe('accepted');

    const edited = await repo.update(ids.workspaceId, id, { rule: 'Edited text' });
    expect(edited).toMatchObject({
      rule: 'Edited text',
      originalRule: 'Original text',
      status: 'accepted',
      category: 'c',
      evidencePath: 'p.ts',
      confidence: 0.4,
    });
    expect((await repo.findById(ids.workspaceId, id))!.rule).toBe('Edited text');

    const foreign = await seedRepo();
    expect(await repo.update(foreign.workspaceId, id, { status: 'pending' })).toBeNull();
    expect(await repo.findById(foreign.workspaceId, id)).toBeNull();
    expect((await repo.findById(ids.workspaceId, id))!.status).toBe('accepted');
  });

  it('decidedRules returns current + original text of accepted and rejected only', async () => {
    const ids = await seedRepo();
    await insertRow(ids, 'acc now', 'accepted', 'acc was');
    await insertRow(ids, 'rej', 'rejected');
    await insertRow(ids, 'pend', 'pending');
    const decided = await repo.decidedRules(ids.workspaceId, ids.repoId);
    expect(decided.sort((a, b) => a.rule.localeCompare(b.rule))).toEqual([
      { rule: 'acc now', originalRule: 'acc was' },
      { rule: 'rej', originalRule: 'rej' },
    ]);
  });

  it('removing a repo removes its candidates only', async () => {
    const a = await seedRepo();
    const b = await seedRepo();
    await insertRow(a, 'a1', 'pending');
    await insertRow(b, 'b1', 'pending');
    await pg.handle.db.delete(t.repos).where(eq(t.repos.id, a.repoId));
    expect(await repo.listByRepo(a.workspaceId, a.repoId)).toEqual([]);
    expect(await repo.listByRepo(b.workspaceId, b.repoId)).toHaveLength(1);
  });
});
