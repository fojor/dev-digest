import type { ConventionsRepository, ExtractionModel, SampleSource } from '../domain/ports.js';
import type {
  CandidateStatus,
  ConventionCandidateEntity,
  ScanFacts,
  VerifiedCandidate,
} from '../domain/types.js';
import {
  ConventionNotFound,
  ExtractionFailed,
  ExtractionInProgress,
  RepoNotFound,
  RepoNotIndexed,
} from '../domain/errors.js';
import { normalizeCandidates } from '../domain/normalize.js';
import { verifyEvidence } from '../domain/verify-evidence.js';
import { dropSecrets } from '../domain/secret-filter.js';
import { doNotRepeatList, dropRepeats } from '../domain/dedupe.js';
import { SAMPLE_LIMIT, STORE_LIMIT, keepMostConfident } from '../domain/policies.js';

/** One line per extraction run (spec §6 observability). Never carries fragments. */
export interface RunLogLine {
  repoId: string;
  model: string | null;
  outcome: 'ok' | 'blocked' | 'failed';
  reason?: string;
  proposed: number;
  discarded: { invalid: number; unverified: number; secret: number; repeat: number; overLimit: number };
  stored: number;
  durationMs: number;
}

export interface ConventionsDeps {
  repo: ConventionsRepository;
  samples: SampleSource;
  model: ExtractionModel;
  log(line: RunLogLine): void;
  now?: () => Date;
}

export interface ConventionListView {
  repoFullName: string;
  scan: ScanFacts | null;
  scanning: boolean;
  candidates: ConventionCandidateEntity[];
}

export interface ExtractionView extends ConventionListView {
  newCount: number;
}

/**
 * Conventions use cases (sad §5, ADR-0003). Extraction runs synchronously; a
 * process-local set is the single source of the «scanning» state — it refuses
 * a second run for the repo and makes its candidates read-only. A server
 * restart clears it, so no repo stays scanning.
 */
export class ConventionsService {
  private readonly scanning = new Set<string>();

  constructor(private readonly d: ConventionsDeps) {}

  private now(): Date {
    return this.d.now?.() ?? new Date();
  }

  async list(workspaceId: string, repoId: string): Promise<ConventionListView> {
    const repo = await this.d.repo.findRepo(workspaceId, repoId);
    if (!repo) throw new RepoNotFound();
    return {
      repoFullName: repo.fullName,
      scan: repo.scan,
      scanning: this.scanning.has(repoId),
      candidates: await this.d.repo.listByRepo(workspaceId, repoId),
    };
  }

  async extract(workspaceId: string, repoId: string): Promise<ExtractionView> {
    const repo = await this.d.repo.findRepo(workspaceId, repoId);
    if (!repo) throw new RepoNotFound();
    if (this.scanning.has(repoId)) throw new ExtractionInProgress();

    this.scanning.add(repoId);
    const started = Date.now();
    const line: RunLogLine = {
      repoId,
      model: null,
      outcome: 'failed',
      proposed: 0,
      discarded: { invalid: 0, unverified: 0, secret: 0, repeat: 0, overLimit: 0 },
      stored: 0,
      durationMs: 0,
    };
    let newCount: number;
    try {
      newCount = await this.run(workspaceId, repoId, line);
      line.outcome = 'ok';
    } catch (err) {
      if (err instanceof RepoNotIndexed) line.outcome = 'blocked';
      line.reason =
        err instanceof ExtractionFailed
          ? err.reason
          : err instanceof RepoNotIndexed
            ? (err.details as { reason: string }).reason
            : 'store_failed';
      throw err;
    } finally {
      this.scanning.delete(repoId);
      line.durationMs = Date.now() - started;
      this.d.log(line);
    }
    // Read after the guard is released, so the result reports scanning: false.
    return { ...(await this.list(workspaceId, repoId)), newCount };
  }

  /** Sampling → one model call → screening → one-transaction store. Returns the stored count. */
  private async run(workspaceId: string, repoId: string, line: RunLogLine): Promise<number> {
    if (!(await this.d.samples.isIndexed(repoId))) throw new RepoNotIndexed('not_indexed');
    const files = await this.d.samples.read(repoId, SAMPLE_LIMIT);
    if (!files.some((f) => f.kind === 'sample')) throw new RepoNotIndexed('no_sample_files');

    const decided = await this.d.repo.decidedRules(workspaceId, repoId);
    const answer = await this.d.model.extract({
      workspaceId,
      files,
      doNotRepeat: doNotRepeatList(decided),
    });
    line.model = answer.model;
    line.proposed = answer.items.length;

    const normalized = normalizeCandidates(answer.items);
    line.discarded.invalid = normalized.discarded;

    const analysed = new Map(answer.files.map((f) => [f.path, f.content]));
    const verified: VerifiedCandidate[] = [];
    for (const c of normalized.kept) {
      const v = verifyEvidence({ path: c.evidencePath, snippet: c.evidenceSnippet }, analysed);
      if (v.ok) verified.push({ ...c, evidenceStartLine: v.startLine, evidenceEndLine: v.endLine });
      else line.discarded.unverified++;
    }

    const clean = dropSecrets(verified);
    line.discarded.secret = clean.discarded;
    const fresh = dropRepeats(clean.kept, decided);
    line.discarded.repeat = fresh.discarded;
    const top = keepMostConfident(fresh.kept, STORE_LIMIT);
    line.discarded.overLimit = top.discarded;

    await this.d.repo.replacePending({
      workspaceId,
      repoId,
      candidates: top.kept,
      scan: {
        scannedAt: this.now(),
        sampleCount: answer.files.filter((f) => f.kind === 'sample').length,
      },
    });
    line.stored = top.kept.length;
    return top.kept.length;
  }

  /** Accept / reject / edit one candidate; refused while its repo is scanning (AC-04b). */
  async updateCandidate(
    workspaceId: string,
    id: string,
    patch: { status?: CandidateStatus; rule?: string },
  ): Promise<ConventionCandidateEntity> {
    const current = await this.d.repo.findById(workspaceId, id);
    if (!current) throw new ConventionNotFound();
    if (this.scanning.has(current.repoId)) throw new ExtractionInProgress();
    const updated = await this.d.repo.update(workspaceId, id, patch);
    if (!updated) throw new ConventionNotFound();
    return updated;
  }
}
