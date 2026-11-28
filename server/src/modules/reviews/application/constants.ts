/**
 * Review module constants.
 */

/**
 * Studio review strategy. 'single-pass' = send the WHOLE diff in ONE LLM call.
 * We deliberately do NOT use 'auto'/map-reduce by default: map-reduce makes one
 * call PER FILE, which is slow and fragile (any single file's transient 5xx
 * fails the entire run) and unnecessary — the whole diff already fits the
 * model's context.
 */
/** Longest a review waits for the PR intent before going on without it (fail-open). */
export const REVIEW_INTENT_WAIT_MS = 60_000;

export const REVIEW_STRATEGY = 'single-pass' as const;
