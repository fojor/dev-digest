import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { ConventionsRepo, ConventionsRepository } from '../domain/ports.js';
import type {
  CandidateStatus,
  ConventionCandidateEntity,
  DecidedRule,
  ScanFacts,
  VerifiedCandidate,
} from '../domain/types.js';

type Row = typeof t.conventions.$inferSelect;

/**
 * Rows written before this feature (legacy boolean era) may lack the new
 * evidence fields; they are mapped to safe defaults so the contract holds.
 */
function toEntity(r: Row): ConventionCandidateEntity {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    repoId: r.repoId ?? '',
    rule: r.rule,
    originalRule: r.originalRule ?? r.rule,
    category: r.category ?? 'general',
    status: r.status,
    evidencePath: r.evidencePath ?? '',
    evidenceSnippet: r.evidenceSnippet ?? '',
    evidenceStartLine: r.evidenceStartLine ?? 1,
    evidenceEndLine: r.evidenceEndLine ?? r.evidenceStartLine ?? 1,
    confidence: r.confidence ?? 0,
  };
}

/**
 * Drizzle implementation of the ConventionsRepository port. Owns
 * `conventions` and the two `repos.conventions_*` scan-fact columns.
 */
export class DrizzleConventionsRepository implements ConventionsRepository {
  constructor(private readonly db: Db) {}

  async findRepo(workspaceId: string, repoId: string): Promise<ConventionsRepo | null> {
    const [r] = await this.db
      .select({
        id: t.repos.id,
        fullName: t.repos.fullName,
        scannedAt: t.repos.conventionsScannedAt,
        sampleCount: t.repos.conventionsSampleCount,
      })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    if (!r) return null;
    const scan: ScanFacts | null =
      r.scannedAt !== null ? { scannedAt: r.scannedAt, sampleCount: r.sampleCount ?? 0 } : null;
    return { id: r.id, fullName: r.fullName, scan };
  }

  async listByRepo(workspaceId: string, repoId: string): Promise<ConventionCandidateEntity[]> {
    const rows = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(desc(t.conventions.confidence), asc(t.conventions.createdAt), asc(t.conventions.id));
    return rows.map(toEntity);
  }

  async findById(workspaceId: string, id: string): Promise<ConventionCandidateEntity | null> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row ? toEntity(row) : null;
  }

  async decidedRules(workspaceId: string, repoId: string): Promise<DecidedRule[]> {
    const rows = await this.db
      .select({ rule: t.conventions.rule, originalRule: t.conventions.originalRule })
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          inArray(t.conventions.status, ['accepted', 'rejected']),
        ),
      )
      .orderBy(asc(t.conventions.createdAt), asc(t.conventions.id));
    return rows.map((r) => ({ rule: r.rule, originalRule: r.originalRule ?? r.rule }));
  }

  async replacePending(input: {
    workspaceId: string;
    repoId: string;
    candidates: VerifiedCandidate[];
    scan: ScanFacts;
  }): Promise<void> {
    const { workspaceId, repoId, candidates, scan } = input;
    await this.db.transaction(async (tx) => {
      await tx
        .delete(t.conventions)
        .where(
          and(
            eq(t.conventions.workspaceId, workspaceId),
            eq(t.conventions.repoId, repoId),
            eq(t.conventions.status, 'pending'),
          ),
        );
      if (candidates.length > 0) {
        await tx.insert(t.conventions).values(
          candidates.map((c) => ({
            workspaceId,
            repoId,
            rule: c.rule,
            originalRule: c.rule,
            category: c.category,
            status: 'pending' as const,
            evidencePath: c.evidencePath,
            evidenceSnippet: c.evidenceSnippet,
            evidenceStartLine: c.evidenceStartLine,
            evidenceEndLine: c.evidenceEndLine,
            confidence: c.confidence,
          })),
        );
      }
      await tx
        .update(t.repos)
        .set({ conventionsScannedAt: scan.scannedAt, conventionsSampleCount: scan.sampleCount })
        .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    });
  }

  async update(
    workspaceId: string,
    id: string,
    patch: { status?: CandidateStatus; rule?: string },
  ): Promise<ConventionCandidateEntity | null> {
    const set: Partial<Pick<Row, 'status' | 'rule'>> = {};
    if (patch.status !== undefined) set.status = patch.status;
    if (patch.rule !== undefined) set.rule = patch.rule;
    if (Object.keys(set).length === 0) return this.findById(workspaceId, id);
    const [row] = await this.db
      .update(t.conventions)
      .set(set)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row ? toEntity(row) : null;
  }
}
