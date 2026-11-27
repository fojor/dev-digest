import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dockerAvailable } from './helpers/pg.js';
import { runMigrations } from '../src/db/migrate.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '../src/db/migrations');

/** A copy of the live migrations folder that stops at `lastTag` (inclusive). */
function migrationsUpTo(lastTag: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'mig-'));
  cpSync(MIGRATIONS, dir, { recursive: true });
  const journalPath = join(dir, 'meta/_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
    entries: Array<{ tag: string }>;
  };
  const cut = journal.entries.findIndex((e) => e.tag === lastTag);
  if (cut < 0) throw new Error(`no migration ${lastTag}`);
  journal.entries = journal.entries.slice(0, cut + 1);
  writeFileSync(journalPath, JSON.stringify(journal));
  return dir;
}

/**
 * T1 — the conventions review-status migration (staged 01 expand → 02 backfill →
 * 03 contract, promoted into one drizzle migration). Legacy rows written under
 * the boolean `accepted` flag must read back as status accepted/pending with
 * original_rule = rule; a fresh DB gets the new columns and indexes.
 */
d('conventions review-status migration (Testcontainers pg)', () => {
  let container: StartedPostgreSqlContainer;
  let url: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();
    url = container.getConnectionUri();
  });
  afterAll(async () => {
    await container?.stop();
  });

  it('backfills legacy accepted rows into status + original_rule, then drops accepted', async () => {
    const sql = postgres(url, { max: 1 });
    const partial = migrationsUpTo('0013_skills_phase2');
    try {
      await sql`CREATE EXTENSION IF NOT EXISTS vector`;
      await migrate(drizzle(sql), { migrationsFolder: partial });

      const [ws] = await sql`INSERT INTO workspaces (name) VALUES ('ws') RETURNING id`;
      const [repo] = await sql`
        INSERT INTO repos (workspace_id, owner, name, full_name)
        VALUES (${ws!.id}, 'o', 'r', 'o/r') RETURNING id`;
      await sql`
        INSERT INTO conventions (workspace_id, repo_id, rule, accepted)
        VALUES (${ws!.id}, ${repo!.id}, 'legacy accepted rule', true),
               (${ws!.id}, ${repo!.id}, 'legacy open rule', false)`;

      await runMigrations(url);

      const rows = await sql`
        SELECT rule, original_rule, status, category, evidence_start_line, created_at
        FROM conventions ORDER BY rule`;
      expect(rows.map((r) => [r.rule, r.status, r.original_rule])).toEqual([
        ['legacy accepted rule', 'accepted', 'legacy accepted rule'],
        ['legacy open rule', 'pending', 'legacy open rule'],
      ]);
      expect(rows[0]!.category).toBeNull();
      expect(rows[0]!.created_at).not.toBeNull();

      const cols = await sql`
        SELECT column_name FROM information_schema.columns WHERE table_name = 'conventions'`;
      expect(cols.map((c) => c.column_name)).not.toContain('accepted');

      const repoCols = await sql`
        SELECT column_name FROM information_schema.columns WHERE table_name = 'repos'`;
      expect(repoCols.map((c) => c.column_name)).toEqual(
        expect.arrayContaining(['conventions_scanned_at', 'conventions_sample_count']),
      );

      const idx = await sql`SELECT indexname FROM pg_indexes WHERE tablename = 'conventions'`;
      expect(idx.map((i) => i.indexname)).toEqual(
        expect.arrayContaining(['conventions_repo_status_idx', 'conventions_ws_idx']),
      );

      // Idempotent: a second run applies nothing and changes nothing.
      await runMigrations(url);
      const again = await sql`SELECT count(*)::int AS n FROM conventions WHERE status = 'accepted'`;
      expect(again[0]!.n).toBe(1);
    } finally {
      await sql.end({ timeout: 5 });
      rmSync(partial, { recursive: true, force: true });
    }
  });

  it('a fresh database defaults new candidates to pending', async () => {
    const fresh = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();
    const sql = postgres(fresh.getConnectionUri(), { max: 1 });
    try {
      await runMigrations(fresh.getConnectionUri());
      const [ws] = await sql`INSERT INTO workspaces (name) VALUES ('ws') RETURNING id`;
      const [row] = await sql`
        INSERT INTO conventions (workspace_id, rule) VALUES (${ws!.id}, 'r') RETURNING status`;
      expect(row!.status).toBe('pending');
    } finally {
      await sql.end({ timeout: 5 });
      await fresh.stop();
    }
  });
});
