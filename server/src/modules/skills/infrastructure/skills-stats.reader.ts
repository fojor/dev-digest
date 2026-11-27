import { and, asc, eq, gte, inArray, isNotNull, sql, type AnyColumn } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import { rate } from '../domain/policies.js';
import type { SkillStatsReader } from '../domain/ports.js';
import type { SkillStats, SkillStatsSummary } from '../domain/types.js';

/** Non-null values of `col`, as a JS number. */
const count = (col: AnyColumn) => sql<number>`count(${col})::int`;

/**
 * Drizzle implementation of SkillStatsReader. Definitions (spec §9.4):
 *  - used_by:     agents with an ENABLED link to the skill (now);
 *  - pull_rate:   runs with a run_skills row for the skill ÷ finished runs
 *                 (status ≠ running) of agents linking it (any link), in window;
 *  - accept_rate: accepted ÷ (accepted + dismissed) over findings attributed
 *                 to the skill, in window (findings are timed by reviews.created_at).
 */
export class DrizzleSkillStatsReader implements SkillStatsReader {
  constructor(private readonly db: Db) {}

  async summaries(workspaceId: string, since: Date): Promise<SkillStatsSummary[]> {
    const skills = await this.db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(eq(t.skills.workspaceId, workspaceId))
      .orderBy(asc(t.skills.name));
    if (skills.length === 0) return [];
    const ids = skills.map((s) => s.id);
    const [usedBy, pulls, decisions] = await Promise.all([
      this.usedBy(ids),
      this.pulls(ids, since),
      this.decisions(ids, since),
    ]);
    return ids.map((id) => {
      const p = pulls.get(id);
      const d = decisions.get(id);
      return {
        skillId: id,
        usedBy: usedBy.get(id) ?? 0,
        pullRate: rate(p?.withSkill ?? 0, p?.total ?? 0),
        acceptRate: rate(d?.accepted ?? 0, (d?.accepted ?? 0) + (d?.dismissed ?? 0)),
      };
    });
  }

  async forSkill(
    _workspaceId: string,
    skillId: string,
    since: Date,
  ): Promise<Omit<SkillStats, 'windowDays'>> {
    const ids = [skillId];
    const [pulls, decisions, agents, categories] = await Promise.all([
      this.pulls(ids, since),
      this.decisions(ids, since),
      this.db
        .select({ id: t.agents.id, name: t.agents.name })
        .from(t.agentSkills)
        .innerJoin(t.agents, eq(t.agents.id, t.agentSkills.agentId))
        .where(and(eq(t.agentSkills.skillId, skillId), eq(t.agentSkills.enabled, true)))
        .orderBy(asc(t.agents.name)),
      this.db
        .select({ category: t.findings.category, count: count(t.findings.id) })
        .from(t.findings)
        .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
        .where(and(eq(t.findings.skillId, skillId), gte(t.reviews.createdAt, since)))
        .groupBy(t.findings.category)
        .orderBy(asc(t.findings.category)),
    ]);
    const p = pulls.get(skillId) ?? { total: 0, withSkill: 0 };
    const d = decisions.get(skillId) ?? { accepted: 0, dismissed: 0, findings: 0 };
    return {
      skillId,
      usedBy: agents.length,
      pullRate: rate(p.withSkill, p.total),
      acceptRate: rate(d.accepted, d.accepted + d.dismissed),
      findings: d.findings,
      runsWithSkill: p.withSkill,
      runsTotal: p.total,
      agents,
      categories: categories.filter((c) => c.count > 0),
    };
  }

  /** Enabled links per skill. */
  private async usedBy(ids: string[]): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ skillId: t.agentSkills.skillId, n: count(t.agentSkills.agentId) })
      .from(t.agentSkills)
      .where(and(inArray(t.agentSkills.skillId, ids), eq(t.agentSkills.enabled, true)))
      .groupBy(t.agentSkills.skillId);
    return new Map(rows.map((r) => [r.skillId, r.n]));
  }

  /**
   * Finished runs in the window of the agents that link each skill (any
   * link — the (agent, skill) PK makes each run count once per skill), and
   * how many of them had the skill in their prompt.
   */
  private async pulls(
    ids: string[],
    since: Date,
  ): Promise<Map<string, { total: number; withSkill: number }>> {
    const rows = await this.db
      .select({
        skillId: t.agentSkills.skillId,
        total: count(t.agentRuns.id),
        withSkill: count(t.runSkills.runId),
      })
      .from(t.agentSkills)
      .innerJoin(
        t.agentRuns,
        and(
          eq(t.agentRuns.agentId, t.agentSkills.agentId),
          gte(t.agentRuns.ranAt, since),
          // status is nullable on legacy rows: only an explicit 'running' is unfinished.
          sql`coalesce(${t.agentRuns.status}, '') <> 'running'`,
        ),
      )
      .leftJoin(
        t.runSkills,
        and(eq(t.runSkills.runId, t.agentRuns.id), eq(t.runSkills.skillId, t.agentSkills.skillId)),
      )
      .where(inArray(t.agentSkills.skillId, ids))
      .groupBy(t.agentSkills.skillId);
    return new Map(rows.map((r) => [r.skillId, { total: r.total, withSkill: r.withSkill }]));
  }

  /** Attributed findings in the window, and how many were accepted / dismissed. */
  private async decisions(
    ids: string[],
    since: Date,
  ): Promise<Map<string, { accepted: number; dismissed: number; findings: number }>> {
    const rows = await this.db
      .select({
        skillId: t.findings.skillId,
        findings: count(t.findings.id),
        accepted: sql<number>`count(*) filter (where ${t.findings.acceptedAt} is not null)::int`,
        // A finding that was accepted and later dismissed counts once, as accepted.
        dismissed: sql<number>`count(*) filter (where ${t.findings.acceptedAt} is null and ${t.findings.dismissedAt} is not null)::int`,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .where(
        and(isNotNull(t.findings.skillId), inArray(t.findings.skillId, ids), gte(t.reviews.createdAt, since)),
      )
      .groupBy(t.findings.skillId);
    return new Map(rows.map((r) => [r.skillId!, r]));
  }
}
