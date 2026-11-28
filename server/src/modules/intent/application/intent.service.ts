import type {
  IntentClassifier,
  IntentRepository,
  SourceReader,
} from '../domain/ports.js';
import type {
  ClassifierInput,
  IntentEntity,
  IntentRunLogLine,
  IntentSourceEntity,
  IntentTrigger,
  IntentView,
  PrFileInfo,
  PullInfo,
  ReadResult,
  ReviewIntentView,
  SourceRef,
} from '../domain/types.js';
import { IntentClassificationFailed, PullNotFound } from '../domain/errors.js';
import { hunkHeaders } from '../domain/hunks.js';
import {
  changedPlanDocs,
  extractReferences,
  isSafeRepoPath,
  normalizeRepoPath,
  sanitizeRef,
} from '../domain/links.js';
import {
  MAX_DOCS,
  MAX_EXTERNAL,
  MAX_FILES,
  MAX_HUNKS_PER_FILE,
  MAX_HUNK_CHARS,
  MAX_ISSUES,
  SOURCE_TIMEOUT_MS,
  deriveConfidence,
  fitBudget,
  isStale,
  normalizeAnswer,
  scopeFilterEnabled,
} from '../domain/policies.js';

export interface IntentServiceDeps {
  repo: IntentRepository;
  sources: SourceReader;
  classifier: IntentClassifier;
  countTokens(text: string): number;
  /** sha256 hex of a string (injected: the domain/application stay free of node:crypto). */
  hash(text: string): string;
  log(line: IntentRunLogLine): void;
  /** Records a failure nobody awaits (no message content, just the event and error). */
  logError?(event: string, err: unknown): void;
  now?(): Date;
}

type Planned = {
  entity: IntentSourceEntity;
  /** Content to feed the classifier, when the source was fetched. */
  issue?: { title: string; body: string };
  doc?: string;
};

const CONTEXT_KINDS = new Set(['linked_issue', 'repo_doc', 'external_link']);

/** Intent use cases: read, classify (single-flight per PR) and resolve for a review run. */
export class IntentService {
  private readonly inflight = new Map<string, Promise<IntentView>>();

  constructor(private readonly deps: IntentServiceDeps) {}

  private inputHash(pull: { title: string; body: string | null }): string {
    return this.deps.hash(`${pull.title.trim()}\n${(pull.body ?? '').trim()}`);
  }

  private view(row: IntentEntity, pull: PullInfo): IntentView {
    return { ...row, stale: isStale(row, pull, this.inputHash(pull)) };
  }

  async get(
    workspaceId: string,
    prId: string,
  ): Promise<{ intent: IntentView | null; classifying: boolean }> {
    const pull = await this.deps.repo.findPull(workspaceId, prId);
    if (!pull) throw new PullNotFound();
    const row = await this.deps.repo.find(workspaceId, prId);
    return { intent: row ? this.view(row, pull) : null, classifying: this.inflight.has(prId) };
  }

  /** Classify (or join the in-flight classification of) the PR; the result replaces the stored row. */
  async classify(workspaceId: string, prId: string, trigger: IntentTrigger): Promise<IntentView> {
    const pull = await this.deps.repo.findPull(workspaceId, prId);
    if (!pull) throw new PullNotFound();
    const existing = this.inflight.get(prId);
    if (existing) return existing;
    const p = this.run(pull, trigger).finally(() => {
      this.inflight.delete(prId);
    });
    this.inflight.set(prId, p);
    // Nobody may await this promise (e.g. a second caller never joined): record, don't crash.
    p.catch((err: unknown) => this.deps.logError?.('intent.classify.failed', err));
    return p;
  }

  /** The intent for a review run: reuse a fresh one, else classify. Null when unavailable (fail-open). */
  async forReview(workspaceId: string, prId: string): Promise<ReviewIntentView | null> {
    const pull = await this.deps.repo.findPull(workspaceId, prId);
    if (!pull) throw new PullNotFound();
    const row = await this.deps.repo.find(workspaceId, prId);
    let view = row ? this.view(row, pull) : null;
    let outcome: ReviewIntentView['outcome'] = 'reused';
    if (!view || view.status !== 'ok' || view.stale) {
      view = await this.classify(workspaceId, prId, 'review');
      outcome = 'classified';
    }
    if (view.status !== 'ok') return null;
    const unavailable = view.sources.filter((s) => CONTEXT_KINDS.has(s.kind) && s.status === 'unavailable');
    const fetched = view.sources.filter((s) => s.status === 'fetched').length;
    return {
      summary: view.summary,
      inScope: view.inScope,
      outOfScope: view.outOfScope,
      confidence: view.confidence,
      missingContext: unavailable.map((s) => `${s.kind} ${s.ref}: ${s.reason ?? 'unavailable'}`),
      filterEnabled: scopeFilterEnabled(view, view.stale),
      sourcesSummary: `${fetched} fetched, ${unavailable.length} unavailable`,
      outcome,
    };
  }

  private async withTimeout(read: () => Promise<ReadResult>): Promise<ReadResult> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<ReadResult>((resolve) => {
        timer = setTimeout(() => resolve({ status: 'unavailable', reason: 'timeout' }), SOURCE_TIMEOUT_MS);
      });
      return await Promise.race([read(), timeout]);
    } catch {
      return { status: 'unavailable', reason: 'fetch_failed' };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async collect(pull: PullInfo, files: PrFileInfo[]): Promise<Planned[]> {
    const repo = { owner: pull.owner, name: pull.name };
    const refs = extractReferences(pull.body ?? '', repo);

    // Issues: GitHub-confirmed closing first, then parsed refs (closing before referenced).
    const confirmed = await this.deps.sources.closingIssues(repo, pull.number).catch(() => []);
    const issueRefs: Extract<SourceRef, { type: 'issue' }>[] = [];
    const seenIssue = new Set<string>();
    const pushIssue = (i: Extract<SourceRef, { type: 'issue' }>) => {
      const key = `${i.owner}/${i.name}#${i.number}`.toLowerCase();
      if (seenIssue.has(key)) return;
      seenIssue.add(key);
      issueRefs.push(i);
    };
    for (const c of confirmed) pushIssue({ type: 'issue', ...c, relation: 'closing' });
    const parsedIssues = refs.filter((r): r is Extract<SourceRef, { type: 'issue' }> => r.type === 'issue');
    for (const i of parsedIssues.filter((x) => x.relation === 'closing')) pushIssue(i);
    for (const i of parsedIssues.filter((x) => x.relation !== 'closing')) pushIssue(i);

    const docRefs: Extract<SourceRef, { type: 'repoDoc' }>[] = [];
    const seenDoc = new Set<string>();
    const pushDoc = (d: Extract<SourceRef, { type: 'repoDoc' }>) => {
      if (seenDoc.has(d.path)) return;
      seenDoc.add(d.path);
      docRefs.push(d);
    };
    for (const d of refs) if (d.type === 'repoDoc') pushDoc(d);
    for (const p of changedPlanDocs(files.map((f) => f.path))) {
      pushDoc({ type: 'repoDoc', path: normalizeRepoPath(p), relation: 'changed_in_pr' });
    }
    const extRefs = refs.filter((r): r is Extract<SourceRef, { type: 'external' }> => r.type === 'external');

    const skipped = (
      kind: IntentSourceEntity['kind'],
      ref: string,
      relation: IntentSourceEntity['relation'],
    ): Planned => ({
      entity: { kind, ref, status: 'skipped', reason: 'limit_reached', relation, truncated: false, tokens: null },
    });
    const done = (
      kind: IntentSourceEntity['kind'],
      ref: string,
      relation: IntentSourceEntity['relation'],
      r: ReadResult,
    ): Planned => ({
      entity: {
        kind,
        ref,
        status: r.status,
        reason: r.reason,
        relation,
        truncated: false,
        tokens: null,
      },
      ...(r.status === 'fetched' && kind === 'linked_issue'
        ? { issue: { title: r.title ?? '', body: r.content ?? '' } }
        : {}),
      ...(r.status === 'fetched' && kind !== 'linked_issue' && r.content ? { doc: r.content } : {}),
    });

    const issueTasks = issueRefs.map(async (i, idx): Promise<Planned> => {
      const sameRepo =
        i.owner.toLowerCase() === repo.owner.toLowerCase() && i.name.toLowerCase() === repo.name.toLowerCase();
      const ref = sameRepo ? `#${i.number}` : `${i.owner}/${i.name}#${i.number}`;
      // The PR body is author-controlled: never let it steer the user's GitHub token at another
      // (possibly private) repo and pull that issue's text into the prompt and the stored intent.
      if (!sameRepo) {
        return done('linked_issue', ref, i.relation, { status: 'unavailable', reason: 'cross_repo' });
      }
      if (idx >= MAX_ISSUES) return skipped('linked_issue', ref, i.relation);
      const r = await this.withTimeout(() => this.deps.sources.issue({ owner: i.owner, name: i.name }, i.number));
      return done('linked_issue', ref, i.relation, r);
    });
    const docTasks = docRefs.map(async (d, idx): Promise<Planned> => {
      if (!isSafeRepoPath(d.path)) {
        return done('repo_doc', '(invalid path)', d.relation, { status: 'unavailable', reason: 'invalid_path' });
      }
      if (idx >= MAX_DOCS) return skipped('repo_doc', d.path, d.relation);
      const r = await this.withTimeout(() =>
        this.deps.sources.repoDoc(repo, pull.headSha, d.path, pull.number, files),
      );
      return done('repo_doc', d.path, d.relation, r);
    });
    const extTasks = extRefs.map(async (e, idx): Promise<Planned> => {
      const ref = sanitizeRef(e.url);
      if (e.trackerHint) {
        return done('external_link', ref, 'referenced', { status: 'unavailable', reason: e.trackerHint });
      }
      if (idx >= MAX_EXTERNAL) return skipped('external_link', ref, 'referenced');
      const r = await this.withTimeout(() => this.deps.sources.external(e.url));
      return done('external_link', ref, 'referenced', r);
    });

    const settled = await Promise.allSettled([...issueTasks, ...docTasks, ...extTasks]);
    return settled.flatMap((s) => (s.status === 'fulfilled' ? [s.value] : []));
  }

  private async run(pull: PullInfo, trigger: IntentTrigger): Promise<IntentView> {
    const started = (this.deps.now?.() ?? new Date()).getTime();
    const files = await this.deps.repo.prFiles(pull.id);
    const planned = await this.collect(pull, files);

    const body = pull.body ?? '';
    const raw: ClassifierInput = {
      title: pull.title,
      description: body.trim().length > 0 ? body : '',
      issues: planned.flatMap((p) =>
        p.issue ? [{ ref: p.entity.ref, title: p.issue.title, body: p.issue.body }] : [],
      ),
      docs: planned.flatMap((p) => (p.doc !== undefined ? [{ ref: p.entity.ref, content: p.doc }] : [])),
      unavailable: planned
        .filter((p) => p.entity.status === 'unavailable')
        .map((p) => ({ ref: p.entity.ref, kind: p.entity.kind, reason: p.entity.reason ?? 'unavailable' })),
      files: files.slice(0, MAX_FILES).map((f) => ({
        path: f.path,
        additions: f.additions,
        deletions: f.deletions,
        hunks: hunkHeaders(f.patch ?? '', MAX_HUNKS_PER_FILE, MAX_HUNK_CHARS),
      })),
    };
    const fit = fitBudget(raw, (t) => this.deps.countTokens(t));

    // Per-source tokens/truncation from the fitted input.
    let issueIdx = 0;
    let docIdx = 0;
    for (const p of planned) {
      if (p.issue) {
        const m = fit.issues[issueIdx++];
        p.entity.tokens = m?.tokens ?? null;
        p.entity.truncated = m?.truncated ?? false;
      } else if (p.doc !== undefined) {
        const m = fit.docs[docIdx++];
        p.entity.tokens = m?.tokens ?? null;
        p.entity.truncated = m?.truncated ?? false;
      }
    }
    const sources: IntentSourceEntity[] = [
      { kind: 'pr_title', ref: 'title', status: 'fetched', reason: null, relation: null, truncated: pull.title.length > fit.input.title.length, tokens: fit.components.title },
      body.trim().length > 0
        ? { kind: 'pr_description', ref: 'description', status: 'fetched', reason: null, relation: null, truncated: fit.descriptionTruncated, tokens: fit.components.description }
        : { kind: 'pr_description', ref: 'description', status: 'missing', reason: 'empty_description', relation: null, truncated: false, tokens: 0 },
      ...planned.map((p) => p.entity),
      files.length > 0
        ? { kind: 'changed_files', ref: 'files', status: 'fetched', reason: null, relation: 'changed_in_pr', truncated: fit.filesTruncated, tokens: fit.components.files }
        : { kind: 'changed_files', ref: 'files', status: 'missing', reason: 'no_files', relation: null, truncated: false, tokens: 0 },
    ];

    const base = {
      prId: pull.id,
      sources,
      promptComponents: { ...fit.components },
      headSha: pull.headSha,
      inputHash: this.inputHash(pull),
    };
    let entity: IntentEntity;
    let failure: string | undefined;
    let usage: { tokensIn: number; tokensOut: number; costUsd: number | null } | undefined;
    try {
      const res = await this.deps.classifier.classify(pull.workspaceId, fit.input, `intent-${pull.id}`);
      const norm = normalizeAnswer(res.answer);
      const conf = deriveConfidence(norm.confidence, sources, pull.body);
      usage = res;
      entity = {
        ...base,
        status: 'ok',
        error: null,
        summary: norm.summary,
        inScope: norm.inScope,
        outOfScope: norm.outOfScope,
        confidence: conf.confidence,
        confidenceReasons: conf.reasons,
        provider: res.provider,
        model: res.model,
        tokensIn: res.tokensIn,
        tokensOut: res.tokensOut,
        costUsd: res.costUsd,
        classifiedAt: this.deps.now?.() ?? new Date(),
      };
    } catch (err) {
      failure = err instanceof IntentClassificationFailed ? err.reason : 'model_unavailable';
      const resolved = err instanceof IntentClassificationFailed ? err.model : null;
      entity = {
        ...base,
        status: 'failed',
        error: failure,
        summary: '',
        inScope: [],
        outOfScope: [],
        confidence: 'low',
        confidenceReasons: [],
        provider: resolved?.provider ?? null,
        model: resolved?.model ?? null,
        tokensIn: null,
        tokensOut: null,
        costUsd: null,
        classifiedAt: this.deps.now?.() ?? new Date(),
      };
    }
    await this.deps.repo.upsert(entity);

    this.deps.log({
      prId: pull.id,
      prNumber: pull.number,
      trigger,
      provider: entity.provider,
      model: entity.model,
      outcome: entity.status === 'ok' ? 'ok' : 'failed',
      ...(failure ? { reason: failure } : {}),
      ...(entity.status === 'ok' ? { confidence: entity.confidence } : {}),
      confidenceReasons: entity.confidenceReasons,
      sources: sources.map((s) => ({
        kind: s.kind,
        ref: s.ref,
        status: s.status,
        reason: s.reason,
        tokens: s.tokens,
        truncated: s.truncated,
      })),
      promptComponents: entity.promptComponents,
      tokensEstimated: fit.totalTokens,
      tokensIn: usage?.tokensIn ?? null,
      tokensOut: usage?.tokensOut ?? null,
      costUsd: usage?.costUsd ?? null,
      durationMs: (this.deps.now?.() ?? new Date()).getTime() - started,
      headSha: pull.headSha,
    });
    return { ...entity, stale: false };
  }
}
