import { describe, it, expect } from "vitest";
import type { ConventionCandidate } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { scanAgo, acceptedCount, pendingStats, errorKey, isRepoNotFound } from "./helpers";

const c = (status: ConventionCandidate["status"], rule = "r", original_rule = "r") =>
  ({ status, rule, original_rule }) as ConventionCandidate;

describe("ConventionsView helpers", () => {
  it("scanAgo buckets minutes / hours / days", () => {
    const at = Date.parse("2026-11-26T10:00:00Z");
    expect(scanAgo("2026-11-26T10:00:00Z", at + 30_000)).toEqual({ key: "now", n: 0 });
    expect(scanAgo("2026-11-26T10:00:00Z", at + 19 * 60_000)).toEqual({ key: "minutes", n: 19 });
    expect(scanAgo("2026-11-26T10:00:00Z", at + 3 * 3_600_000)).toEqual({ key: "hours", n: 3 });
    expect(scanAgo("2026-11-26T10:00:00Z", at + 50 * 3_600_000)).toEqual({ key: "days", n: 2 });
  });

  it("counts accepted and pending/edited", () => {
    const list = [c("accepted"), c("pending"), c("pending", "new", "old"), c("rejected", "x", "y")];
    expect(acceptedCount(list)).toBe(1);
    expect(pendingStats(list)).toEqual({ pending: 2, edited: 1 });
  });

  it("maps API errors to message keys", () => {
    expect(errorKey(new ApiError("x", 502, "conventions_extraction_failed", { reason: "timeout" }))).toBe("timeout");
    expect(errorKey(new ApiError("x", 409, "conventions_scan_in_progress"))).toBe("scan_in_progress");
    expect(errorKey(new ApiError("x", 409, "conventions_repo_not_indexed", { reason: "evil" }))).toBe("generic");
    expect(errorKey(new Error("x"))).toBe("generic");
    expect(isRepoNotFound(new ApiError("x", 404, "repo_not_found"))).toBe(true);
    expect(isRepoNotFound(new ApiError("x", 500))).toBe(false);
  });
});
