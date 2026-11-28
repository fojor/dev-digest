import { describe, expect, it, vi } from 'vitest';
import { IntentService } from '../src/modules/intent/application/intent.service.js';
import type { IntentRepository, SourceReader } from '../src/modules/intent/domain/ports.js';
import type { IntentEntity, PullInfo } from '../src/modules/intent/domain/types.js';

const pull: PullInfo = {
  id: 'pr-1',
  workspaceId: 'ws-1',
  number: 7,
  title: 'Fix login',
  body: 'Fixes #12. Closes Acme/Secret-Repo#5. See other/lib#9.',
  headSha: 'a'.repeat(40),
  owner: 'acme',
  name: 'app',
};

function build(confirmed: { owner: string; name: string; number: number }[] = []) {
  let stored: IntentEntity | undefined;
  const repo: IntentRepository = {
    findPull: async () => pull,
    find: async () => stored,
    upsert: async (e) => {
      stored = e;
    },
    prFiles: async () => [],
  };
  const issue = vi.fn<SourceReader['issue']>(async () => ({
    status: 'fetched',
    reason: null,
    title: 'issue title',
    content: 'issue body',
  }));
  const sources: SourceReader = {
    issue,
    closingIssues: async () => confirmed,
    repoDoc: async () => ({ status: 'unavailable', reason: 'not_found' }),
    external: async () => ({ status: 'unavailable', reason: 'host_not_allowed' }),
  };
  const classify = vi.fn(async () => ({
    answer: { summary: 's', inScope: [], outOfScope: [], confidence: 'high' },
    provider: 'mock',
    model: 'mock',
    tokensIn: 1,
    tokensOut: 1,
    costUsd: null,
  }));
  const service = new IntentService({
    repo,
    sources,
    classifier: { classify } as never,
    countTokens: (t) => t.length,
    hash: (t) => `h${t.length}`,
    log: () => {},
  });
  return { service, issue, classify };
}

describe('IntentService linked issues', () => {
  it('reads only same-repo issues; other-repo refs from the PR body are unavailable/cross_repo', async () => {
    const { service, issue, classify } = build();
    const view = await service.classify('ws-1', 'pr-1', 'manual');

    expect(issue).toHaveBeenCalledTimes(1);
    expect(issue).toHaveBeenCalledWith({ owner: 'acme', name: 'app' }, 12);

    const linked = view.sources.filter((s) => s.kind === 'linked_issue');
    expect(linked).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ref: '#12', status: 'fetched' }),
        expect.objectContaining({ ref: 'Acme/Secret-Repo#5', status: 'unavailable', reason: 'cross_repo' }),
        expect.objectContaining({ ref: 'other/lib#9', status: 'unavailable', reason: 'cross_repo' }),
      ]),
    );
    const input = (classify.mock.calls[0] as unknown[])[1] as { issues: { ref: string }[] };
    expect(input.issues.map((i) => i.ref)).toEqual(['#12']);
  });

  it('treats a GitHub-confirmed closing issue in another repo the same way', async () => {
    const { service, issue } = build([{ owner: 'other', name: 'private', number: 3 }]);
    const view = await service.classify('ws-1', 'pr-1', 'manual');

    expect(issue).not.toHaveBeenCalledWith({ owner: 'other', name: 'private' }, 3);
    expect(view.sources).toContainEqual(
      expect.objectContaining({ ref: 'other/private#3', status: 'unavailable', reason: 'cross_repo' }),
    );
  });
});
