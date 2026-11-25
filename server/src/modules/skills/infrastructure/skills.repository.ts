import { and, asc, desc, eq } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { SkillsRepository } from '../domain/ports.js';
import type { NewSkill, NewSkillVersion, Skill, SkillVersionEntry } from '../domain/types.js';
import { toSkill, toSkillVersion } from './mappers.js';

/**
 * Drizzle implementation of the SkillsRepository port. Owns `skills` and
 * `skill_versions`; reads the agent side of `agent_skills` for the prompt.
 * `db` is the root connection or a transaction (DrizzleSkillsUnitOfWork).
 */
export class DrizzleSkillsRepository implements SkillsRepository {
  constructor(private readonly db: Db) {}

  async list(workspaceId: string): Promise<Skill[]> {
    const rows = await this.db
      .select()
      .from(t.skills)
      .where(eq(t.skills.workspaceId, workspaceId))
      .orderBy(asc(t.skills.name));
    return rows.map(toSkill);
  }

  async getById(workspaceId: string, id: string): Promise<Skill | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row ? toSkill(row) : undefined;
  }

  async create(input: NewSkill, version: number): Promise<Skill> {
    const [row] = await this.db
      .insert(t.skills)
      .values({
        workspaceId: input.workspaceId,
        name: input.name,
        description: input.description,
        type: input.type,
        source: input.source ?? 'manual',
        body: input.body,
        enabled: input.enabled ?? true,
        version,
      })
      .returning();
    return toSkill(row!);
  }

  async save(skill: Skill): Promise<Skill> {
    const [row] = await this.db
      .update(t.skills)
      .set({
        name: skill.name,
        description: skill.description,
        type: skill.type,
        body: skill.body,
        enabled: skill.enabled,
        version: skill.version,
      })
      .where(and(eq(t.skills.workspaceId, skill.workspaceId), eq(t.skills.id, skill.id)))
      .returning();
    if (!row) throw new Error(`skill ${skill.id} vanished during save`);
    return toSkill(row);
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  async appendVersion(entry: NewSkillVersion): Promise<void> {
    await this.db.insert(t.skillVersions).values(entry).onConflictDoNothing();
  }

  async listVersions(skillId: string): Promise<SkillVersionEntry[]> {
    const rows = await this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
    return rows.map(toSkillVersion);
  }

  async getVersion(skillId: string, version: number): Promise<SkillVersionEntry | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skillVersions)
      .where(and(eq(t.skillVersions.skillId, skillId), eq(t.skillVersions.version, version)));
    return row ? toSkillVersion(row) : undefined;
  }

  async listEnabledForAgent(agentId: string): Promise<Skill[]> {
    const rows = await this.db
      .select({ skill: t.skills })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(
        and(
          eq(t.agentSkills.agentId, agentId),
          eq(t.agentSkills.enabled, true),
          eq(t.skills.enabled, true),
        ),
      )
      .orderBy(asc(t.agentSkills.order));
    return rows.map((r) => toSkill(r.skill));
  }
}
