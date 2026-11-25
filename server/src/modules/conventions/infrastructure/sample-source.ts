import { readdir } from 'node:fs/promises';
import type { SampleSource } from '../domain/ports.js';
import type { AnalysedFile } from '../domain/types.js';
import { isAllowedStyleConfig, truncateLines } from '../domain/policies.js';
import { readContainedFile } from '../../../platform/contained-read.js';

const SPARE_RANKS = 8;

export interface SampleSourceDeps {
  indexState(repoId: string): Promise<{ status: string; degraded?: boolean }>;
  /** Ranked repo-relative paths, highest first, equal ranks by path. */
  rankedPaths(repoId: string, n: number): Promise<string[]>;
  clonePath(repoId: string): Promise<string | null>;
}

/**
 * The files one extraction run analyses (AC-24, spec §6): the ranked sample
 * files from repo-intel, then the allow-listed root style configs. Everything is
 * read through the containment-checked reader and cut to 400 lines; files that
 * can't be read safely (symlink escape, missing, too big) are skipped. Nothing
 * else in the clone — env files, package-manager auth, CI — is ever opened.
 */
export class CloneSampleSource implements SampleSource {
  constructor(private readonly deps: SampleSourceDeps) {}

  async isIndexed(repoId: string): Promise<boolean> {
    const s = await this.deps.indexState(repoId);
    return !s.degraded && (s.status === 'full' || s.status === 'partial');
  }

  async read(repoId: string, limit: number): Promise<AnalysedFile[]> {
    const clone = await this.deps.clonePath(repoId);
    if (!clone) return [];

    const samples: AnalysedFile[] = [];
    // A few spare ranks cover configs filtered out here and files that can't be read.
    for (const path of await this.deps.rankedPaths(repoId, limit + SPARE_RANKS)) {
      if (samples.length >= limit) break;
      if (isAllowedStyleConfig(path)) continue; // configs are read below, not as samples
      const content = await readContainedFile(clone, path);
      if (content !== null) samples.push({ path, kind: 'sample', content: truncateLines(content) });
    }

    const configs: AnalysedFile[] = [];
    let entries: string[] = [];
    try {
      entries = await readdir(clone);
    } catch {
      entries = [];
    }
    for (const name of entries.filter(isAllowedStyleConfig).sort()) {
      const content = await readContainedFile(clone, name);
      if (content !== null) configs.push({ path: name, kind: 'config', content: truncateLines(content) });
    }
    return [...samples, ...configs];
  }
}
