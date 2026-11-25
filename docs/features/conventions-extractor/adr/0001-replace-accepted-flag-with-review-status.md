---
status: Accepted
owner: "Oleksii B"
reviewers: ["Tech Lead"]
updated_at: "2026-11-26"
feature_size: "S"
ticket: "conventions-extractor"
---

# 0001 — Replace the accepted flag with a review status

- **Status:** Accepted
- **Date:** 2026-11-26
- **Deciders:** Oleksii B (owner), Claude (design pass)

## Context

The `conventions` table and the `ConventionCandidate` contract carry a single `accepted` boolean.
The spec (AC-09, AC-10, AC-13) needs three persistent states — pending, accepted, rejected — with
rejected candidates staying visible and surviving re-scans, plus a category, the evidence line
range, and per-repo facts about the last scan (AC-06, AC-07). The owner ruled out a new table.

## Decision drivers

- Rejected candidates must survive reload and re-scan (spec AC-10, AC-13).
- «A run that verified none» must still be observable (spec AC-07) — needs data outside candidate rows.
- No new table (spec §1 decisions); contract copies must stay byte-identical (root CLAUDE.md).
- No consumer of the `accepted` field exists yet, so its shape can still change cheaply.

## Considered options

1. **Replace `accepted` with `status` (`pending | accepted | rejected`)** — one source of truth for the review state.
2. **Keep `accepted` and add a `rejected` boolean** — additive, but allows the impossible «accepted and rejected» combination.

## Decision outcome

**Chosen:** Option 1. Migration `0014`: add `status text not null default 'pending'` constrained to
the three values, backfill `accepted = true → 'accepted'`, drop `accepted`; add `category text`,
`evidence_start_line int`, `evidence_end_line int`, `original_rule text` (the model's text, kept
when the Developer edits the rule — spec AC-13, AC-14), `created_at timestamptz default now()` to
`conventions`, and `conventions_scanned_at timestamptz`, `conventions_sample_count int` to `repos`.
The contract replaces `accepted` with `status` and adds `category`, `evidence_start_line`,
`evidence_end_line`, `original_rule`; scan facts are written only by a successful run (spec AC-03); a `ConventionScan` (`sample_count`, `scanned_at`) is returned with the list.

## Consequences

**Positive**
- Impossible states are unrepresentable; re-scan filters by one column (`status = 'pending'`).
- Scan facts exist even when a run stores zero candidates.

**Negative**
- A breaking contract change in both vendored copies (acceptable: no consumers yet).
- `repos` gains two feature-specific columns.

**Neutral**
- Moving scan facts to a runs table later is an additive migration plus a backfill.

## Links

- Spec: [[../spec.md]] AC-03, AC-06, AC-07, AC-09, AC-10, AC-13, AC-14
- SAD: [[../sad.md]] §4, §5
