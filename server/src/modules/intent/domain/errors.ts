import { DomainError } from '../../_shared/domain/errors.js';

export { PullNotFound } from '../../_shared/domain/errors.js';

export type ClassificationFailureReason =
  | 'timeout'
  | 'no_credentials'
  | 'unreadable_answer'
  | 'model_unavailable';

/**
 * The classifier call failed. Internal: persisted as `status: failed` with the
 * reason code; never mapped to an HTTP error.
 */
export class IntentClassificationFailed extends DomainError {
  readonly code = 'intent_classification_failed';
  constructor(
    readonly reason: ClassificationFailureReason,
    /** The model that was resolved before the failure, when the failure came after resolution. */
    readonly model: { provider: string; model: string } | null = null,
  ) {
    super(`Intent classification failed: ${reason}`, { reason });
  }
}
