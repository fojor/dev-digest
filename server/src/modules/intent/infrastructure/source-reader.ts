import type { GitClient, GitHubClient } from '@devdigest/shared';
import type { SafeFetcher } from '../../../adapters/safe-fetch/index.js';
import type { SourceReader } from '../domain/ports.js';
import type { PrFileInfo, ReadResult } from '../domain/types.js';
import { isSafeRepoPath, normalizeRepoPath } from '../domain/links.js';
import { MAX_DOC_BYTES } from '../domain/policies.js';

export interface SourceReaderDeps {
  github(): Promise<GitHubClient>;
  git: GitClient;
  fetcher: Pick<SafeFetcher, 'fetch'>;
}

function httpStatusOf(err: unknown): number | undefined {
  const s = (err as { status?: unknown } | null)?.status;
  return typeof s === 'number' ? s : undefined;
}

/** Rebuild a new file from its patch (all `+` lines) when the head object isn't in the clone. */
function contentFromPatch(file: PrFileInfo | undefined): string | null {
  if (!file?.patch || file.deletions > 0) return null;
  const lines = file.patch
    .split('\n')
    .filter((l) => !l.startsWith('@@') && l.startsWith('+') && !l.startsWith('+++'))
    .map((l) => l.slice(1));
  return lines.length > 0 ? lines.join('\n') : null;
}

/** Reads the PR's referenced sources. Maps every failure to a reason code; never throws. */
export class GitSourceReader implements SourceReader {
  constructor(private readonly deps: SourceReaderDeps) {}

  async issue(repo: { owner: string; name: string }, number: number): Promise<ReadResult> {
    let gh: GitHubClient;
    try {
      gh = await this.deps.github();
    } catch {
      return { status: 'unavailable', reason: 'no_github_token' };
    }
    try {
      const issue = await gh.getIssue(repo, number);
      if (issue.is_pull_request) return { status: 'skipped', reason: 'is_pull_request' };
      return { status: 'fetched', reason: null, title: issue.title, content: issue.body ?? '' };
    } catch (err) {
      const status = httpStatusOf(err);
      if (status === 404) return { status: 'unavailable', reason: 'not_found' };
      if (status === 429) return { status: 'unavailable', reason: 'rate_limited' };
      if (status === 401 || status === 403) return { status: 'unavailable', reason: 'forbidden' };
      return { status: 'unavailable', reason: 'fetch_failed' };
    }
  }

  async closingIssues(
    repo: { owner: string; name: string },
    prNumber: number,
  ): Promise<{ owner: string; name: string; number: number }[]> {
    try {
      return await (await this.deps.github()).listClosingIssues(repo, prNumber);
    } catch {
      return [];
    }
  }

  async repoDoc(
    repo: { owner: string; name: string },
    headSha: string,
    path: string,
    prNumber: number,
    prFiles: PrFileInfo[],
  ): Promise<ReadResult> {
    const rel = normalizeRepoPath(path);
    if (!isSafeRepoPath(rel)) return { status: 'unavailable', reason: 'invalid_path' };
    const changed = prFiles.find((f) => f.path === rel);
    const read = () => this.deps.git.showFile(repo, headSha, rel, MAX_DOC_BYTES);
    const codeOf = (e: unknown) => (e as { code?: unknown } | null)?.code;
    try {
      return { status: 'fetched', reason: null, content: await read() };
    } catch (first) {
      let err: unknown = first;
      if (codeOf(err) === 'missing_object') {
        try {
          await this.deps.git.fetchPullHead(repo, prNumber);
          return { status: 'fetched', reason: null, content: await read() };
        } catch (second) {
          err = second;
        }
      }
      const code = codeOf(err);
      if (code === 'too_large') return { status: 'unavailable', reason: 'too_large' };
      if (code === 'not_found') {
        const rebuilt = contentFromPatch(changed);
        return rebuilt !== null
          ? { status: 'fetched', reason: null, content: rebuilt }
          : { status: 'unavailable', reason: 'not_found' };
      }
      const rebuilt = contentFromPatch(changed);
      if (rebuilt !== null) return { status: 'fetched', reason: null, content: rebuilt };
      return { status: 'unavailable', reason: 'not_in_clone' };
    }
  }

  async external(url: string): Promise<ReadResult> {
    const res = await this.deps.fetcher.fetch(url);
    return res.ok
      ? { status: 'fetched', reason: null, content: res.text }
      : { status: 'unavailable', reason: res.reason };
  }
}
