import type { FindingCategory, SkillSource, SkillType, SkillVersionKind } from '@devdigest/shared';

/**
 * Skills domain types — plain TS, camelCase. A skill is a reusable block of
 * markdown instructions that agents link to; it is text only and never runs.
 * Field names mirror the persisted row (see agents/domain/types.ts for why).
 */
export interface Skill {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  enabled: boolean;
  version: number;
  evidenceFiles: string[] | null;
  createdAt: Date;
}

/** What a caller supplies to create a skill; omitted fields take defaults. */
export interface NewSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  body: string;
  source?: SkillSource;
  enabled?: boolean;
  /** For an import: the file the core came from (goes into the version note). */
  sourceFile?: string;
}

/** Fields an update may change. `undefined` = leave as is. */
export type SkillPatch = Partial<Pick<Skill, 'name' | 'description' | 'type' | 'body' | 'enabled'>>;

/** An uploaded file to be previewed as a skill. Nothing is stored. */
export interface SkillUpload {
  filename: string;
  bytes: Uint8Array;
}

export interface IgnoredFile {
  path: string;
  executable: boolean;
}

/** The parsed core of an uploaded skill, shown to the user before saving. */
export interface SkillImportPreview {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  sourceFile: string;
  ignoredFiles: IgnoredFile[];
  warnings: string[];
}

/** The content a version snapshots (everything a content edit can change). */
export type SkillContent = Pick<Skill, 'name' | 'description' | 'type' | 'body'>;

/**
 * One immutable history entry. name / description / type / note / kind are
 * null on rows written before full snapshots existed (body only).
 */
export interface SkillVersionEntry {
  skillId: string;
  version: number;
  body: string;
  name: string | null;
  description: string | null;
  type: SkillType | null;
  note: string | null;
  kind: SkillVersionKind | null;
  createdAt: Date;
}

/** What the use case records for a new version. */
export interface NewSkillVersion extends SkillContent {
  skillId: string;
  version: number;
  note: string;
  kind: SkillVersionKind;
}

/** Card numbers for one skill (rates 0..1, null = no data in the window). */
export interface SkillStatsSummary {
  skillId: string;
  usedBy: number;
  pullRate: number | null;
  acceptRate: number | null;
}

/** The skill panel's Stats tab. */
export interface SkillStats extends SkillStatsSummary {
  windowDays: number;
  findings: number;
  runsWithSkill: number;
  runsTotal: number;
  agents: { id: string; name: string }[];
  categories: { category: FindingCategory | string; count: number }[];
}
