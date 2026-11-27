import type { SkillRow, SkillVersionRow } from '../../../db/rows.js';
import type { Skill, SkillVersionEntry } from '../domain/types.js';

/** Row → domain. Enum columns are already narrowed by the schema. */
export function toSkill(row: SkillRow): Skill {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    description: row.description,
    type: row.type,
    source: row.source,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidenceFiles: row.evidenceFiles ?? null,
    createdAt: row.createdAt,
  };
}

/** Version row → domain (Phase 1 rows carry only the body; the rest is null). */
export function toSkillVersion(row: SkillVersionRow): SkillVersionEntry {
  return {
    skillId: row.skillId,
    version: row.version,
    body: row.body,
    name: row.name ?? null,
    description: row.description ?? null,
    type: row.type ?? null,
    note: row.note ?? null,
    kind: row.kind ?? null,
    createdAt: row.createdAt,
  };
}
