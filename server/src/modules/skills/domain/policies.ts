import type { SkillType } from '@devdigest/shared';
import type { IgnoredFile, Skill, SkillContent, SkillPatch } from './types.js';

/** Version recorded for a newly created skill. */
export const INITIAL_SKILL_VERSION = 1;

/** Every time-based skill metric covers this many days. */
export const STATS_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Start of the stats window ending at `now`. */
export function statsWindowStart(now: Date, days = STATS_WINDOW_DAYS): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

/** A rate as 0..1, or null when the denominator is 0 ("—" in the UI). */
export function rate(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

/** Longest version note a user may type. */
export const MAX_VERSION_NOTE = 200;

/**
 * Note for a content edit: the user's text when given, otherwise one built
 * from what changed ("Renamed to x; Type: a → b; Edited description; Edited body").
 */
export function versionNote(before: SkillContent, after: SkillContent, typed?: string): string {
  const note = typed?.trim();
  if (note) return note.slice(0, MAX_VERSION_NOTE);
  const parts: string[] = [];
  if (after.name !== before.name) parts.push(`Renamed to ${after.name}`);
  if (after.type !== before.type) parts.push(`Type: ${before.type} → ${after.type}`);
  if (after.description !== before.description) parts.push('Edited description');
  if (after.body !== before.body) parts.push('Edited body');
  return parts.join('; ') || 'Edited';
}

/** Note recorded when a skill is first saved. */
export function creationNote(source: Skill['source'] | undefined, sourceFile?: string): string {
  if (source !== 'imported') return 'Created';
  return sourceFile?.trim() ? `Imported from ${sourceFile.trim()}` : 'Imported';
}

/** Largest upload accepted for import (raw .md or .zip, before base64). */
export const MAX_IMPORT_BYTES = 512 * 1024;
/** Largest SKILL.md read out of an archive (uncompressed). */
export const MAX_SKILL_FILE_BYTES = 256 * 1024;
/** More entries than this is not a skill package. */
export const MAX_ARCHIVE_ENTRIES = 500;

const SKILL_TYPES: readonly SkillType[] = ['rubric', 'convention', 'security', 'custom'];

/** The core file of an agent-skill package. */
const SKILL_FILE = 'skill.md';

/** Extensions / folders that mark an archive entry as runnable code. */
const EXECUTABLE_EXT = new Set([
  'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd', 'py', 'rb', 'pl', 'php', 'js', 'mjs',
  'cjs', 'ts', 'mts', 'cts', 'jsx', 'tsx', 'go', 'rs', 'java', 'jar', 'exe', 'bin', 'so',
  'dylib', 'dll', 'wasm', 'app', 'command',
]);
const EXECUTABLE_DIRS = ['scripts/', 'bin/', 'hooks/'];

/** True when a patch changes the skill's content (anything but `enabled`). */
export function isContentChange(skill: Skill, patch: SkillPatch): boolean {
  return (
    (patch.name !== undefined && patch.name !== skill.name) ||
    (patch.description !== undefined && patch.description !== skill.description) ||
    (patch.type !== undefined && patch.type !== skill.type) ||
    (patch.body !== undefined && patch.body !== skill.body)
  );
}

/** Apply a patch: defined fields overwrite, a content change bumps the version. */
export function applySkillPatch(
  skill: Skill,
  patch: SkillPatch,
): { next: Skill; versionBumped: boolean } {
  const versionBumped = isContentChange(skill, patch);
  const defined = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined),
  ) as SkillPatch;
  return {
    next: { ...skill, ...defined, version: versionBumped ? skill.version + 1 : skill.version },
    versionBumped,
  };
}

/** Archive entries the importer never looks at (OS metadata). */
export function isJunkEntry(path: string): boolean {
  return path.startsWith('__MACOSX/') || path.endsWith('/.DS_Store') || path === '.DS_Store';
}

/** True for entries that look like runnable code — listed, never read or run. */
export function isExecutablePath(path: string): boolean {
  const lower = path.toLowerCase();
  if (EXECUTABLE_DIRS.some((d) => lower.startsWith(d) || lower.includes(`/${d}`))) return true;
  const base = lower.split('/').pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot > 0 && EXECUTABLE_EXT.has(base.slice(dot + 1));
}

/**
 * Pick the skill core inside an archive: the shallowest `SKILL.md`
 * (case-insensitive), so both `SKILL.md` and `my-skill/SKILL.md` work.
 */
export function pickSkillFile(paths: string[]): string | undefined {
  return paths
    .filter((p) => !isJunkEntry(p) && (p.split('/').pop() ?? '').toLowerCase() === SKILL_FILE)
    .sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))[0];
}

/** Every archive file other than the core, flagged when it looks executable. */
export function ignoredFilesOf(paths: string[], core: string): IgnoredFile[] {
  return paths
    .filter((p) => p !== core && !p.endsWith('/') && !isJunkEntry(p))
    .map((path) => ({ path, executable: isExecutablePath(path) }));
}

/** lowercase-kebab name from free text ("PR Quality Rubric" → "pr-quality-rubric"). */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function unquote(v: string): string {
  const t = v.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

/**
 * Minimal YAML-frontmatter reader for skill files: top-level `key: value`
 * pairs, quoted values and `>` / `|` block scalars. Nested keys are skipped —
 * a skill only needs name / description / type.
 */
export function parseFrontmatter(text: string): { meta: Record<string, string>; body: string } {
  const normalized = text.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(normalized);
  if (!m) return { meta: {}, body: normalized };
  const meta: Record<string, string> = {};
  const lines = m[1]!.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const kv = /^([A-Za-z_][\w-]*):(.*)$/.exec(lines[i]!);
    if (!kv) continue;
    const key = kv[1]!;
    const raw = kv[2]!.trim();
    if (raw === '>' || raw === '|' || raw === '>-' || raw === '|-') {
      const block: string[] = [];
      // Continuation lines are indented (or blank); the next top-level key ends it.
      while (i + 1 < lines.length && (/^\s/.test(lines[i + 1]!) || lines[i + 1]!.trim() === '')) {
        block.push(lines[i + 1]!.trim());
        i++;
      }
      meta[key] = raw.startsWith('>') ? block.filter(Boolean).join(' ') : block.join('\n').trim();
    } else {
      meta[key] = unquote(raw);
    }
  }
  return { meta, body: normalized.slice(m[0].length) };
}

/** First `# heading` of a markdown body, if any. */
function firstHeading(body: string): string | undefined {
  return /^#\s+(.+)$/m.exec(body)?.[1]?.trim();
}

/**
 * Turn a skill markdown file into the editable preview fields. Missing pieces
 * fall back (name ← heading ← filename; type ← custom) and add a warning so
 * the user fixes them before saving.
 */
export function parseSkillMarkdown(
  text: string,
  fallbackName: string,
): { name: string; description: string; type: SkillType; body: string; warnings: string[] } {
  const warnings: string[] = [];
  const { meta, body: rawBody } = parseFrontmatter(text);
  const body = rawBody.trim();

  let name = meta.name?.trim() ?? '';
  if (!name) {
    name = slugify(firstHeading(body) ?? fallbackName) || 'imported-skill';
    warnings.push('No `name` in frontmatter — derived one; check it.');
  }
  const description = meta.description?.trim() ?? '';
  if (!description) {
    warnings.push('No `description` — write one that says when the skill applies.');
  }
  const declared = meta.type?.trim().toLowerCase();
  const type: SkillType = SKILL_TYPES.includes(declared as SkillType)
    ? (declared as SkillType)
    : 'custom';
  if (!body) warnings.push('The skill body is empty.');
  return { name, description, type, body, warnings };
}

/** Rejects text that is clearly not markdown (binary content). */
export function looksBinary(text: string): boolean {
  return text.includes('\u0000');
}
