/**
 * Intent layer domain types. Plain TS: no Zod, no I/O. Field names for the
 * persisted entity follow the domain vocabulary; the mapper translates to/from
 * the `pr_intent` row and the presenter to the API contract.
 */

export type Confidence = 'high' | 'medium' | 'low';
export type SourceKind =
  | 'pr_title'
  | 'pr_description'
  | 'linked_issue'
  | 'repo_doc'
  | 'external_link'
  | 'changed_files';
export type SourceStatus = 'fetched' | 'missing' | 'unavailable' | 'skipped';
export type SourceRelation = 'closing' | 'referenced' | 'linked' | 'changed_in_pr';
export type IntentTrigger = 'manual' | 'review';

export interface IntentSourceEntity {
  kind: SourceKind;
  /** Sanitized: `#N`, `owner/repo#N`, a repo path, or `scheme://host/path`. */
  ref: string;
  status: SourceStatus;
  reason: string | null;
  relation: SourceRelation | null;
  truncated: boolean;
  tokens: number | null;
}

export interface IntentEntity {
  prId: string;
  status: 'ok' | 'failed';
  error: string | null;
  summary: string;
  inScope: string[];
  outOfScope: string[];
  confidence: Confidence;
  confidenceReasons: string[];
  sources: IntentSourceEntity[];
  promptComponents: Record<string, number>;
  headSha: string | null;
  inputHash: string | null;
  provider: string | null;
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  classifiedAt: Date;
}

/** An intent plus the staleness computed at read time. */
export interface IntentView extends IntentEntity {
  stale: boolean;
}

/** The PR as the intent layer needs it (repo coordinates included). */
export interface PullInfo {
  id: string;
  workspaceId: string;
  number: number;
  title: string;
  body: string | null;
  headSha: string;
  owner: string;
  name: string;
}

export interface PrFileInfo {
  path: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

export type SourceRef =
  | { type: 'issue'; owner: string; name: string; number: number; relation: 'closing' | 'referenced' }
  | { type: 'repoDoc'; path: string; relation: 'linked' | 'changed_in_pr' }
  | { type: 'external'; url: string; trackerHint?: string };

/** What a SourceReader returns for one reference; it never throws. */
export interface ReadResult {
  status: SourceStatus;
  reason: string | null;
  content?: string;
  title?: string;
}

/** What goes to the classifier (no diff bodies, only hunk headers). */
export interface ClassifierInput {
  title: string;
  description: string;
  issues: { ref: string; title: string; body: string }[];
  docs: { ref: string; content: string }[];
  unavailable: { ref: string; kind: string; reason: string }[];
  files: { path: string; additions: number; deletions: number; hunks: string[] }[];
}

export interface ClassifierAnswer {
  summary: string;
  in_scope: string[];
  out_of_scope: string[];
  confidence: Confidence;
}

export interface ClassifierResult {
  answer: ClassifierAnswer;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
}

/** What the review run needs from an intent. */
export interface ReviewIntentView {
  summary: string;
  inScope: string[];
  outOfScope: string[];
  confidence: Confidence;
  missingContext: string[];
  filterEnabled: boolean;
  sourcesSummary: string;
  outcome: 'reused' | 'classified';
}

/** One structured log line per classification. No content fields. */
export interface IntentRunLogLine {
  prId: string;
  prNumber: number;
  trigger: IntentTrigger;
  provider: string | null;
  model: string | null;
  outcome: 'ok' | 'failed';
  reason?: string;
  confidence?: Confidence;
  confidenceReasons: string[];
  sources: Pick<IntentSourceEntity, 'kind' | 'ref' | 'status' | 'reason' | 'tokens' | 'truncated'>[];
  promptComponents: Record<string, number>;
  tokensEstimated: number;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  durationMs: number;
  headSha: string;
}
