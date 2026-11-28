# Development Plans

One file per branch: `docs/plans/<branch>.md`, where `<branch>` is `git branch --show-current | tr '/' '-'`
(branch `feat/skills` → `docs/plans/feat-skills.md`). Plans are committed with the feature they describe.

## Flow

1. The main session runs the **planner** agent (`.claude/agents/planner.md`) with the task.
   The planner is read-only: it returns the plan as markdown and the main session saves it here verbatim.
   If the file already exists, the planner updates it and keeps the step IDs stable.
2. The user reviews the plan. Only a plan with `Status: READY` goes further.
   For a bug fix the main session may first run **test-writer** (reproduce) for a failing test.
3. The main session runs the **implementer** agent (`.claude/agents/implementer.md`) with the plan's path.
   The implementer never edits the plan; it returns an Implementation Report that refers to the step IDs
   (S1…Sn) and acceptance criteria (AC1…ACn).
4. The main session runs **plan-verifier** (plan path) and **architecture-reviewer** in parallel. NOT MET
   items go back to the implementer, missing tests to **test-writer** (gap-fill), then plan-verifier runs
   again. **doc-writer** then updates the docs from the plan and the reports. Security review and
   `/pr-self-review` run last, before the PR.

## Format

The plan template is defined in `.claude/agents/planner.md` (§3 "Output format"): goal, acceptance criteria,
context read, assumptions, open questions, impact map, constraints, steps (files, change, skills to apply,
rules, tests, done-when), contracts and migrations, verification commands, out of scope, risks.

Plans are written in English, like all docs in this repo.
