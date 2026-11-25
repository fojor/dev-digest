import { renderSkillBlock } from '@devdigest/reviewer-core';
import { InvalidSkillImport, SkillNotFound, SkillVersionNotFound } from '../domain/errors.js';
import {
  INITIAL_SKILL_VERSION,
  MAX_ARCHIVE_ENTRIES,
  MAX_IMPORT_BYTES,
  MAX_SKILL_FILE_BYTES,
  STATS_WINDOW_DAYS,
  applySkillPatch,
  creationNote,
  statsWindowStart,
  versionNote,
  ignoredFilesOf,
  isJunkEntry,
  looksBinary,
  parseSkillMarkdown,
  pickSkillFile,
} from '../domain/policies.js';
import type { ArchiveReader, SkillStatsReader, SkillsRepository, SkillsUnitOfWork } from '../domain/ports.js';
import type {
  NewSkill,
  Skill,
  SkillContent,
  SkillImportPreview,
  SkillPatch,
  SkillStats,
  SkillStatsSummary,
  SkillUpload,
  SkillVersionEntry,
} from '../domain/types.js';

export interface SkillsDeps {
  skills: SkillsRepository;
  uow: SkillsUnitOfWork;
  archive: ArchiveReader;
  stats: SkillStatsReader;
  /** Token count of a prompt fragment (the tokenizer adapter). */
  countTokens: (text: string) => number;
  now?: () => Date;
}

/** A version entry as the API shows it: is it the skill's current one? */
export type SkillVersionView = SkillVersionEntry & { current: boolean };

/**
 * M2 — skills use cases (Skills page, skill editor, import). Reads are
 * workspace-scoped; a missing skill raises SkillNotFound. A content edit bumps
 * the version and snapshots the body in the same transaction.
 */
export class SkillsService {
  constructor(private readonly d: SkillsDeps) {}

  list(workspaceId: string): Promise<Skill[]> {
    return this.d.skills.list(workspaceId);
  }

  async get(workspaceId: string, id: string): Promise<Skill> {
    const skill = await this.d.skills.getById(workspaceId, id);
    if (!skill) throw new SkillNotFound();
    return skill;
  }

  create(input: NewSkill): Promise<Skill> {
    return this.d.uow.run(async ({ skills }) => {
      const skill = await skills.create(input, INITIAL_SKILL_VERSION);
      await skills.appendVersion({
        ...contentOf(skill),
        skillId: skill.id,
        version: skill.version,
        kind: skill.source === 'imported' ? 'import' : 'create',
        note: creationNote(skill.source, input.sourceFile),
      });
      return skill;
    });
  }

  /**
   * Edit or toggle. A content change bumps the version and snapshots the full
   * content with `note` (or an auto note from the changed fields); toggling
   * `enabled` records nothing.
   */
  update(workspaceId: string, id: string, patch: SkillPatch, note?: string): Promise<Skill> {
    return this.d.uow.run(async ({ skills }) => {
      const current = await skills.getById(workspaceId, id);
      if (!current) throw new SkillNotFound();
      const { next, versionBumped } = applySkillPatch(current, patch);
      const saved = await skills.save(next);
      if (versionBumped) {
        await skills.appendVersion({
          ...contentOf(saved),
          skillId: id,
          version: saved.version,
          kind: 'edit',
          note: versionNote(contentOf(current), contentOf(saved), note),
        });
      }
      return saved;
    });
  }

  /** History, newest first; `current` marks the skill's live version. */
  async listVersions(workspaceId: string, id: string): Promise<SkillVersionView[]> {
    const skill = await this.get(workspaceId, id);
    const versions = await this.d.skills.listVersions(id);
    return versions.map((v) => ({ ...v, current: v.version === skill.version }));
  }

  /**
   * Restore = a NEW version carrying the old content (history is append-only).
   * Fields a body-only (Phase 1) snapshot lacks keep their current value.
   */
  restoreVersion(workspaceId: string, id: string, version: number): Promise<Skill> {
    return this.d.uow.run(async ({ skills }) => {
      const current = await skills.getById(workspaceId, id);
      if (!current) throw new SkillNotFound();
      const old = await skills.getVersion(id, version);
      if (!old) throw new SkillVersionNotFound();
      const saved = await skills.save({
        ...current,
        name: old.name ?? current.name,
        description: old.description ?? current.description,
        type: old.type ?? current.type,
        body: old.body,
        version: current.version + 1,
      });
      await skills.appendVersion({
        ...contentOf(saved),
        skillId: id,
        version: saved.version,
        kind: 'restore',
        note: `Restored from v${version}`,
      });
      return saved;
    });
  }

  /** Tokens the draft adds to a prompt: its rendered block, as a run counts it. */
  countTokens(draft: Pick<SkillContent, 'name' | 'description' | 'body'>): number {
    return this.d.countTokens(renderSkillBlock(draft));
  }

  statsSummaries(workspaceId: string): Promise<SkillStatsSummary[]> {
    return this.d.stats.summaries(workspaceId, statsWindowStart(this.now()));
  }

  async stats(workspaceId: string, id: string): Promise<SkillStats> {
    await this.get(workspaceId, id);
    const s = await this.d.stats.forSkill(workspaceId, id, statsWindowStart(this.now()));
    return { ...s, windowDays: STATS_WINDOW_DAYS };
  }

  private now(): Date {
    return this.d.now?.() ?? new Date();
  }

  /** Agent links and version history cascade. */
  async delete(workspaceId: string, id: string): Promise<void> {
    if (!(await this.d.skills.delete(workspaceId, id))) throw new SkillNotFound();
  }

  /**
   * Parse an uploaded `.md` or `.zip` into a preview — nothing is stored and
   * nothing in the upload is executed. From an archive only `SKILL.md` is
   * read; every other entry is listed as ignored (scripts flagged).
   */
  previewImport(upload: SkillUpload): SkillImportPreview {
    if (upload.bytes.byteLength === 0) throw new InvalidSkillImport('The file is empty.');
    if (upload.bytes.byteLength > MAX_IMPORT_BYTES) {
      throw new InvalidSkillImport(`The file is larger than ${MAX_IMPORT_BYTES / 1024} KB.`);
    }
    const lower = upload.filename.toLowerCase();
    const baseName = upload.filename.replace(/\.(md|markdown|zip)$/i, '');

    if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
      const text = decodeText(upload.bytes);
      return { ...parseSkillMarkdown(text, baseName), sourceFile: upload.filename, ignoredFiles: [] };
    }

    if (lower.endsWith('.zip')) {
      const { entries, files } = this.readArchive(upload.bytes);
      const paths = entries.map((e) => e.path);
      const core = pickSkillFile(paths);
      if (!core) throw new InvalidSkillImport('The archive has no SKILL.md.');
      const bytes = files[core];
      if (!bytes) throw new InvalidSkillImport(`SKILL.md is larger than ${MAX_SKILL_FILE_BYTES / 1024} KB.`);
      const parsed = parseSkillMarkdown(decodeText(bytes), baseName);
      const ignoredFiles = ignoredFilesOf(paths, core);
      const warnings = [...parsed.warnings];
      const runnable = ignoredFiles.filter((f) => f.executable).length;
      if (runnable > 0) {
        warnings.push(`${runnable} executable file(s) in the archive were ignored and never run.`);
      }
      return { ...parsed, warnings, sourceFile: core, ignoredFiles };
    }

    throw new InvalidSkillImport('Upload a .md file or a .zip archive.');
  }

  private readArchive(bytes: Uint8Array) {
    let result: ReturnType<ArchiveReader['read']>;
    try {
      // Read only the SKILL.md candidates (and only when small); list the rest.
      result = this.d.archive.read(
        bytes,
        (e) =>
          !isJunkEntry(e.path) &&
          (e.path.split('/').pop() ?? '').toLowerCase() === 'skill.md' &&
          e.size <= MAX_SKILL_FILE_BYTES,
      );
    } catch {
      throw new InvalidSkillImport('The archive could not be read (not a valid .zip).');
    }
    if (result.entries.length > MAX_ARCHIVE_ENTRIES) {
      throw new InvalidSkillImport(`The archive has more than ${MAX_ARCHIVE_ENTRIES} entries.`);
    }
    return result;
  }
}

function decodeText(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new InvalidSkillImport('The skill file is not UTF-8 text.');
  }
  if (looksBinary(text)) throw new InvalidSkillImport('The skill file is not text.');
  return text;
}

function contentOf(s: SkillContent): SkillContent {
  return { name: s.name, description: s.description, type: s.type, body: s.body };
}
