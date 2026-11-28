import type { IntentConfidence, IntentSourceStatus } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";

/** Values mirrored locally (runtime imports from @devdigest/shared break the dev build). */
export const CONFIDENCE_LEVELS: Record<IntentConfidence, { color: string; bg: string }> = {
  high: { color: "var(--ok)", bg: "var(--ok-bg, var(--bg-hover))" },
  medium: { color: "var(--warn, var(--text-secondary))", bg: "var(--bg-hover)" },
  low: { color: "var(--text-muted)", bg: "var(--bg-hover)" },
};

export const SOURCE_STATUS_ICON: Record<IntentSourceStatus, IconName> = {
  fetched: "CheckCircle",
  missing: "Info",
  unavailable: "Lock",
  skipped: "X",
};

/** Source / confidence reason codes that have an `intent.reasons.*` message. */
export const KNOWN_REASONS: readonly string[] = [
  "no_github_token",
  "not_found",
  "forbidden",
  "rate_limited",
  "is_pull_request",
  "cross_repo",
  "limit_reached",
  "invalid_path",
  "not_in_clone",
  "too_large",
  "auth_required",
  "host_not_allowed",
  "private_address",
  "timeout",
  "unsupported_content_type",
  "fetch_failed",
  "empty_description",
  "source_unavailable",
  "no_credentials",
  "unreadable_answer",
  "model_unavailable",
  "no_files",
];

/** Poll-friendly default when the response has not arrived yet. */
export const FALLBACK_REASON = "fetch_failed";
