import type {
  AnalysedFile,
  CandidateStatus,
  ConventionCandidateEntity,
  DecidedRule,
  ScanFacts,
  VerifiedCandidate,
} from './types.js';

/** Repo as the conventions module sees it (always within one workspace). */
export interface ConventionsRepo {
  id: string;
  fullName: string;
  scan: ScanFacts | null;
}

/** Persistence of candidates + per-repo scan facts. Every read is workspace-scoped. */
export interface ConventionsRepository {
  findRepo(workspaceId: string, repoId: string): Promise<ConventionsRepo | null>;
  listByRepo(workspaceId: string, repoId: string): Promise<ConventionCandidateEntity[]>;
  findById(workspaceId: string, id: string): Promise<ConventionCandidateEntity | null>;
  /** Current + original text of accepted and rejected candidates (do-not-repeat list). */
  decidedRules(workspaceId: string, repoId: string): Promise<DecidedRule[]>;
  /**
   * One transaction: delete the repo's pending candidates, insert the new
   * verified ones as pending (original_rule = rule), record the scan facts.
   * Accepted and rejected rows are never touched.
   */
  replacePending(input: {
    workspaceId: string;
    repoId: string;
    candidates: VerifiedCandidate[];
    scan: ScanFacts;
  }): Promise<void>;
  /** Change status and/or rule text; original_rule, evidence, category, confidence are kept. */
  update(
    workspaceId: string,
    id: string,
    patch: { status?: CandidateStatus; rule?: string },
  ): Promise<ConventionCandidateEntity | null>;
}

/** The files one run analyses: ranked samples + allow-listed style configs (AC-24). */
export interface SampleSource {
  /** False when the repo's code index is not built, building, failed or turned off. */
  isIndexed(repoId: string): Promise<boolean>;
  /** Up to `limit` ranked sample files and the allow-listed root style configs, read through the contained clone reader. */
  read(repoId: string, limit: number): Promise<AnalysedFile[]>;
}

/**
 * The single structured model call of a run (throws ExtractionFailed). It fits
 * the input into the token budget first and returns the files it actually sent
 * — evidence must come from those (AC-05).
 */
export interface ExtractionModel {
  extract(input: {
    workspaceId: string;
    files: AnalysedFile[];
    doNotRepeat: string[];
  }): Promise<{ model: string; items: unknown[]; files: AnalysedFile[] }>;
}
