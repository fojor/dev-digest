import type { UnitOfWork } from '../../_shared/domain/unit-of-work.js';
import type {
  NewSkill,
  NewSkillVersion,
  Skill,
  SkillStats,
  SkillStatsSummary,
  SkillVersionEntry,
} from './types.js';

/** Persistence port for skills and their body history. */
export interface SkillsRepository {
  list(workspaceId: string): Promise<Skill[]>;
  getById(workspaceId: string, id: string): Promise<Skill | undefined>;
  /** Insert at `version` (no history row — the use case records it). */
  create(input: NewSkill, version: number): Promise<Skill>;
  /** Persist every mutable field (incl. version); returns the stored skill. */
  save(skill: Skill): Promise<Skill>;
  /** False when no such skill exists in the workspace. Agent links cascade. */
  delete(workspaceId: string, id: string): Promise<boolean>;
  /** Record an immutable full snapshot; a duplicate (skill, version) is ignored. */
  appendVersion(entry: NewSkillVersion): Promise<void>;
  /** The skill's history, newest first (the caller has scoped the skill). */
  listVersions(skillId: string): Promise<SkillVersionEntry[]>;
  getVersion(skillId: string, version: number): Promise<SkillVersionEntry | undefined>;
  /**
   * Skills that reach an agent's prompt: linked AND enabled on the link AND
   * enabled globally, ordered by the link's position.
   */
  listEnabledForAgent(agentId: string): Promise<Skill[]>;
}

export type SkillsUnitOfWork = UnitOfWork<{ skills: SkillsRepository }>;

/** One entry of an uploaded archive. */
export interface ArchiveEntry {
  path: string;
  /** Uncompressed size as declared by the archive. */
  size: number;
}

/**
 * Reads a zip archive in memory. Never writes to disk and never executes
 * anything: it lists entries and returns the bytes of the ones `pick` selects.
 */
export interface ArchiveReader {
  read(
    bytes: Uint8Array,
    pick: (entry: ArchiveEntry) => boolean,
  ): { entries: ArchiveEntry[]; files: Record<string, Uint8Array> };
}

/**
 * Read-only usage numbers for skills over a time window (agent links, runs
 * whose prompt contained the skill, attributed findings and their decisions).
 */
export interface SkillStatsReader {
  /** One summary per workspace skill (Skills page cards). */
  summaries(workspaceId: string, since: Date): Promise<SkillStatsSummary[]>;
  /** Full stats of one skill; the caller has checked the skill exists. */
  forSkill(workspaceId: string, skillId: string, since: Date): Promise<Omit<SkillStats, 'windowDays'>>;
}
