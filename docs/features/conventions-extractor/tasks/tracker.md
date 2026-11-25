# Tracker — conventions-extractor

> Status of every task in the epic. `implement` updates **Status** and **Step** after every
> subagent it runs (and commits them with the task), so this table shows where the run is right now.
> Status: `todo` · `in_progress` · `blocked` · `review` · `done`.
> Step: `SELECT` · `RED` · `GREEN` · `REFACTOR` · `GATE` · `REVIEW` · `COMMIT` (`—` before the task starts).
> A `blocked` row carries its reason in Step, e.g. `GATE — lint red after 3 retries`.

| # | Task | Layer | Owner | Estimate | Blocked by | Status | Step |
|---|---|---|---|---|---|---|---|
| T1 | Promote the conventions review-status migration into the Drizzle schema | migration | Oleksii B | S | — | done | COMMIT |
| T2 | Update the conventions and skill contracts in both vendored copies | domain | Oleksii B | S | — | todo | — |
| T3 | Add the conventions domain: types, errors, ports, candidate normalisation and evidence verification | domain | Oleksii B | M | — | todo | — |
| T4 | Add the secret filter, repeat suppression and run limits to the conventions domain | domain | Oleksii B | M | — | todo | — |
| T5 | Implement the conventions repository with the replace-pending transaction | infra | Oleksii B | M | T1, T2, T3 | todo | — |
| T6 | Build the extraction input and the single structured model call | infra | Oleksii B | M | T3, T4 | todo | — |
| T7 | Extend the skills API for extracted skills | app | Oleksii B | S | T2 | todo | — |
| T8 | Implement the conventions service with the per-repo scan guard and run log | app | Oleksii B | M | T3, T4, T5, T6 | todo | — |
| T9 | Add the client helpers that build the skill draft and find the extracted name match | ui | Oleksii B | S | T2 | todo | — |
| T10 | Expose the conventions routes and wire the module | ports | Oleksii B | M | T2, T8 | todo | — |
| T11 | Build the Conventions page, its hooks, the sidebar entry and the re-scan confirmation | ui | Oleksii B | L | T10 | todo | — |
| T12 | Build the candidate card with evidence, accept/reject and inline rule editing | ui | Oleksii B | M | T11 | todo | — |
| T13 | Build the Create skill modal with create/update, warnings and validation | ui | Oleksii B | M | T7, T9, T11 | todo | — |
| T15 | Prove the conventions skill reaches the review prompt and document the routes | tests | Oleksii B | S | T7, T10 | todo | — |

**Total:** 14 tasks, ~10 person-days (S = 0.5, M = 1, L = 1 day at the upper bound).

> T14 (e2e flow) removed 2026-11-26 per the owner decision recorded in spec.md «Test plan → CI placement»: E2E-through-UI is N/A for this feature; its ACs are covered by T7–T13.
