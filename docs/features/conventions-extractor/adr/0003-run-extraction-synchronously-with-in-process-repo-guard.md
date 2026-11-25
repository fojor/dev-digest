---
status: Accepted
owner: "Oleksii B"
reviewers: ["Tech Lead"]
updated_at: "2026-11-26"
feature_size: "S"
ticket: "conventions-extractor"
---

# 0003 — Run extraction synchronously with an in-process repo guard

- **Status:** Accepted
- **Date:** 2026-11-26
- **Deciders:** Oleksii B (owner), Claude (design pass)

## Context

An extraction run is sampling + one model call + verification, p95 ≤ 90 s (spec §6). The owner
chose to have the Developer wait on the page (spec §1, §3 non-goal «background extraction»). A
second run for the same repo must be refused (spec AC-04). The server already has a job runner
with live events for reviews, but no per-repo lock pattern.

## Decision drivers

- Spec §6: p95 ≤ 90 s, exactly 1 model call, ≤ 1 run per repo at a time.
- Spec AC-03: a model that does not answer within 120 seconds, or a server restart, fails the run and leaves no repo marked as scanning.
- Spec AC-04b: candidates are read-only while their repo is scanning.
- DevDigest runs as one local server process.
- Size S — avoid job, event-stream and client subscription plumbing.

## Considered options

1. **Synchronous request + process-local set of in-flight repo ids** — the request returns the refreshed list; the set is cleared in `finally`.
2. **Background job via the existing job runner with live progress** — survives navigation, but needs job records, events and a client subscription.
3. **Synchronous request + database lock** (advisory lock or a «scanning» column) — survives multiple processes, adds DB state that must be cleaned after a crash.

## Decision outcome

**Chosen:** Option 1, with the model call aborted after 120 s; the same set answers «is this repo scanning» for the list and refuses candidate changes. One process makes a process-local guard sufficient and crash-safe (a restart
clears it). Option 3 protects against a deployment shape DevDigest does not have.

## Consequences

**Positive**
- Simplest flow; the page just awaits a mutation and shows the existing «Scanning…» copy.
- No stale lock after a crash.

**Negative**
- Closing the tab does not cancel the model call; the result is still stored.
- A second server process would break the guarantee.

**Neutral**
- Moving to Option 2 later touches the route, the service entry point and the client hook (≈ 2–3 days).

## Links

- Spec: [[../spec.md]] AC-01, AC-03, AC-04, AC-04b, §6
- SAD: [[../sad.md]] §4, §6 flow 1, §11
