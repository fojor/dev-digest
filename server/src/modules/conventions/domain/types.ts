/**
 * Conventions domain types — pure TS, no I/O. A candidate is a rule the
 * conventions model proposed, kept only after its evidence was verified
 * against the files analysed in the same run (spec AC-05).
 */

export type CandidateStatus = 'pending' | 'accepted' | 'rejected';

/** A stored candidate (one `conventions` row). */
export interface ConventionCandidateEntity {
  id: string;
  workspaceId: string;
  repoId: string;
  rule: string;
  originalRule: string;
  category: string;
  status: CandidateStatus;
  evidencePath: string;
  evidenceSnippet: string;
  evidenceStartLine: number;
  evidenceEndLine: number;
  /** Clone HEAD the evidence was verified at; null when unknown (legacy row, git unavailable). */
  evidenceCommitSha: string | null;
  confidence: number;
}

/** A model-proposed candidate after field normalisation (AC-03b). */
export interface NormalizedCandidate {
  rule: string;
  category: string;
  evidencePath: string;
  evidenceSnippet: string;
  /** 0..1 */
  confidence: number;
}

/** A normalised candidate whose evidence passed verification — ready to store. */
export interface VerifiedCandidate extends NormalizedCandidate {
  evidenceStartLine: number;
  evidenceEndLine: number;
}

/** Last successful run on a repo; null when never scanned. */
export interface ScanFacts {
  scannedAt: Date;
  sampleCount: number;
}

/** One file read for this run (repo-relative path, full text). */
export interface AnalysedFile {
  path: string;
  content: string;
  /** 'sample' = ranked source file; 'config' = allow-listed style config. */
  kind: 'sample' | 'config';
}

/** Rule texts of decided (accepted/rejected) candidates — the do-not-repeat list. */
export interface DecidedRule {
  rule: string;
  originalRule: string;
}
