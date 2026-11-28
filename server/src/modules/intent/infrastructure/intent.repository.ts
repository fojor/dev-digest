import { and, eq } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { IntentRepository } from '../domain/ports.js';
import type { IntentEntity, PrFileInfo, PullInfo } from '../domain/types.js';
import { toEntity, toRow } from './mappers.js';

/** `pr_intent` persistence. Workspace scoping goes through the PR's workspace_id. */
export class DrizzleIntentRepository implements IntentRepository {
  constructor(private readonly db: Db) {}

  async findPull(workspaceId: string, prId: string): Promise<PullInfo | undefined> {
    const [r] = await this.db
      .select({
        id: t.pullRequests.id,
        workspaceId: t.pullRequests.workspaceId,
        number: t.pullRequests.number,
        title: t.pullRequests.title,
        body: t.pullRequests.body,
        headSha: t.pullRequests.headSha,
        owner: t.repos.owner,
        name: t.repos.name,
      })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(and(eq(t.pullRequests.id, prId), eq(t.pullRequests.workspaceId, workspaceId)));
    return r;
  }

  async find(workspaceId: string, prId: string): Promise<IntentEntity | undefined> {
    const [r] = await this.db
      .select({ row: t.prIntent })
      .from(t.prIntent)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.prIntent.prId))
      .where(and(eq(t.prIntent.prId, prId), eq(t.pullRequests.workspaceId, workspaceId)));
    return r ? toEntity(r.row) : undefined;
  }

  async upsert(entity: IntentEntity): Promise<void> {
    const values = toRow(entity);
    await this.db
      .insert(t.prIntent)
      .values(values)
      .onConflictDoUpdate({ target: t.prIntent.prId, set: values });
  }

  async prFiles(prId: string): Promise<PrFileInfo[]> {
    return this.db
      .select({
        path: t.prFiles.path,
        additions: t.prFiles.additions,
        deletions: t.prFiles.deletions,
        patch: t.prFiles.patch,
      })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId))
      .orderBy(t.prFiles.path);
  }
}
