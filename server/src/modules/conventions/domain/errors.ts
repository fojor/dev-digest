import { DomainError } from '../../_shared/domain/errors.js';

export { RepoNotFound } from '../../_shared/domain/errors.js';

export type NotIndexedReason = 'not_indexed' | 'no_sample_files';

/** The repo has no sample files to analyse — nothing is sent to the model (AC-02). */
export class RepoNotIndexed extends DomainError {
  readonly code = 'conventions_repo_not_indexed';
  constructor(reason: NotIndexedReason) {
    super(
      reason === 'not_indexed'
        ? 'Index the repo before extracting conventions'
        : 'The repo has no source files to analyse',
      { reason },
    );
  }
}

/** A scan is running for the repo: a second run and any candidate change are refused (AC-04, AC-04b). */
export class ExtractionInProgress extends DomainError {
  readonly code = 'conventions_scan_in_progress';
  constructor() {
    super('A scan is already running for this repo');
  }
}

export type ExtractionFailureReason =
  | 'timeout'
  | 'no_credentials'
  | 'model_unavailable'
  | 'unreadable_answer';

const FAILURE_MESSAGE: Record<ExtractionFailureReason, string> = {
  timeout: 'The conventions model did not answer within 120 seconds',
  no_credentials: 'The conventions model has no credentials configured',
  model_unavailable: 'The conventions model is unavailable',
  unreadable_answer: 'The conventions model returned an answer that could not be read',
};

/** The model call failed; nothing was stored (AC-03). */
export class ExtractionFailed extends DomainError {
  readonly code = 'conventions_extraction_failed';
  constructor(readonly reason: ExtractionFailureReason) {
    super(FAILURE_MESSAGE[reason], { reason });
  }
}

/** A candidate id that does not exist in the caller's workspace (AC-08). */
export class ConventionNotFound extends DomainError {
  readonly code = 'convention_not_found';
  constructor() {
    super('Convention not found');
  }
}
