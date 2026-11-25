import type { ConventionCandidate } from "@devdigest/shared";
import { ApiError } from "@/lib/api";

/** «X ago» parts for the last scan, as a message key under `ago.*` + its number. */
export function scanAgo(scannedAt: string, now: number): { key: "now" | "minutes" | "hours" | "days"; n: number } {
  const minutes = Math.max(0, Math.floor((now - Date.parse(scannedAt)) / 60_000));
  if (minutes < 1) return { key: "now", n: 0 };
  if (minutes < 60) return { key: "minutes", n: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { key: "hours", n: hours };
  return { key: "days", n: Math.floor(hours / 24) };
}

export function acceptedCount(candidates: readonly ConventionCandidate[]): number {
  return candidates.filter((c) => c.status === "accepted").length;
}

/** What a re-scan would replace (AC-14): pending candidates, and how many of them were edited. */
export function pendingStats(candidates: readonly ConventionCandidate[]): { pending: number; edited: number } {
  const pending = candidates.filter((c) => c.status === "pending");
  return { pending: pending.length, edited: pending.filter((c) => c.rule !== c.original_rule).length };
}

const KNOWN_REASONS = new Set([
  "timeout",
  "no_credentials",
  "model_unavailable",
  "unreadable_answer",
  "not_indexed",
  "no_sample_files",
]);

/** Message key under `errors.*` for a failed extraction / candidate change. */
export function errorKey(err: unknown): string {
  if (!(err instanceof ApiError)) return "generic";
  if (err.code === "conventions_scan_in_progress") return "scan_in_progress";
  const reason = (err.details as { reason?: string } | undefined)?.reason;
  if (reason && KNOWN_REASONS.has(reason)) return reason;
  return "generic";
}

/** A list request that answered «repo not found» (foreign or unknown repo, AC-08). */
export function isRepoNotFound(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404;
}
