import type {
  Skill as SkillDto,
  SkillImportPreview as SkillImportPreviewDto,
  SkillStats as SkillStatsDto,
  SkillStatsSummary as SkillStatsSummaryDto,
  SkillVersion as SkillVersionDto,
} from '@devdigest/shared';
import type { SkillVersionView } from '../application/skills.service.js';
import type {
  NewSkill,
  Skill,
  SkillImportPreview,
  SkillPatch,
  SkillStats,
  SkillStatsSummary,
} from '../domain/types.js';
import type { CreateSkillBody, UpdateSkillBody } from './schemas.js';

/** Domain → API contract (snake_case). */
export function presentSkill(s: Skill): SkillDto {
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    type: s.type,
    source: s.source,
    body: s.body,
    enabled: s.enabled,
    version: s.version,
    evidence_files: s.evidenceFiles,
  };
}

export function presentImportPreview(p: SkillImportPreview): SkillImportPreviewDto {
  return {
    name: p.name,
    description: p.description,
    type: p.type,
    body: p.body,
    source_file: p.sourceFile,
    ignored_files: p.ignoredFiles,
    warnings: p.warnings,
  };
}

export function toNewSkill(body: CreateSkillBody, ctx: { workspaceId: string }): NewSkill {
  return {
    workspaceId: ctx.workspaceId,
    name: body.name,
    description: body.description,
    type: body.type,
    body: body.body,
    source: body.source ?? 'manual',
    enabled: body.enabled,
    sourceFile: body.source_file,
  };
}

export function toSkillPatch(body: UpdateSkillBody): SkillPatch {
  return {
    name: body.name,
    description: body.description,
    type: body.type,
    body: body.body,
    enabled: body.enabled,
  };
}

export function presentVersion(v: SkillVersionView): SkillVersionDto {
  return {
    version: v.version,
    name: v.name,
    description: v.description,
    type: v.type,
    body: v.body,
    note: v.note,
    kind: v.kind,
    created_at: v.createdAt.toISOString(),
    current: v.current,
  };
}

export function presentStatsSummary(s: SkillStatsSummary): SkillStatsSummaryDto {
  return {
    skill_id: s.skillId,
    used_by: s.usedBy,
    pull_rate: s.pullRate,
    accept_rate: s.acceptRate,
  };
}

export function presentStats(s: SkillStats): SkillStatsDto {
  return {
    ...presentStatsSummary(s),
    window_days: s.windowDays,
    findings: s.findings,
    runs_with_skill: s.runsWithSkill,
    runs_total: s.runsTotal,
    agents: s.agents,
    categories: s.categories,
  };
}
