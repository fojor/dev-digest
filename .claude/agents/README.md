# Agents

Project subagents for Claude Code. Each file here is one agent: YAML frontmatter (name, tools, model,
limits, hooks) plus its system prompt. This README is the map of the set — what each agent is for, what
it may do and what goes in and out. The rules themselves live in the agent files; don't copy them here.

## The set at a glance

| Agent | Responsibility | Writes? | Model | Input | Output |
|-------|----------------|---------|-------|-------|--------|
| [researcher](researcher.md) | Answers one concrete question from the repo or external sources, with evidence | No | `sonnet` | A question (repo / external / both) | Research report: TL;DR, findings with evidence, "Not found", sources |
| [planner](planner.md) | Turns a task into a structured Development Plan that fits the architecture and the implementer's skills | No | `opus`, effort `high` | A task (feature / bug) | Development Plan (markdown) → saved by the caller to `docs/plans/<branch>.md` |
| [implementer](implementer.md) | Executes a READY plan in backend and frontend, runs the package checks, self-checks its diff | Code + the plan's tests | `sonnet` | Path to `docs/plans/<branch>.md` | Uncommitted changes in the working tree + Implementation Report |
| [test-writer](test-writer.md) | Writes tests that can fail: reproduce a bug before the fix, fill test gaps after the implementer, or cover existing code on request | Test files only (hook) | `sonnet` | Bug / plan path + item IDs / files | Test files + Test Report |
| [architecture-reviewer](architecture-reviewer.md) | Runs the architecture gates, then reviews the diff for layering rules no tool enforces | No | `opus`, effort `high` | Base ref, optional plan path | Architecture Review (verdict, gates, A… findings) |
| [plan-verifier](plan-verifier.md) | Checks the finished change against every plan item and requirement, with evidence and re-run checks | No | `opus`, effort `high` | Plan path, optional request / Implementation Report | Plan Verification Report (traceability matrix, verdict) |
| [doc-writer](doc-writer.md) | Turns the plan, reports and code into docs in the right `docs/` section, with Mermaid diagrams | Markdown docs only (hook) | `sonnet` | Plan path + reports, slug, files or materials | Docs changes + Doc Report |

Security review and `/pr-self-review` are not part of this set; they run after it, by a separate agent
or by the user.

## Flow

```
task ──► planner ──► Development Plan ──(main session saves)──► docs/plans/<branch>.md
                                                                 │  user approves, Status: READY
  bug fix? ── test-writer [reproduce] ── failing test (RED) ─────┤
                                                                 ▼
                       Implementation Report ◄── implementer ◄── plan path
                                │
                ┌───────────────┴────────────────┐   (parallel, read-only, fresh context)
                ▼                                ▼
         plan-verifier                 architecture-reviewer
    Plan Verification Report             Architecture Review
                │ NOT MET → implementer · missing tests → test-writer [gap-fill] → re-run plan-verifier
                │ CRITICAL → implementer (fix) → re-run architecture-reviewer
                ▼
           doc-writer ──► docs diff + Doc Report
                ▼
      security review · /pr-self-review · PR (by the user)

researcher — on demand at any point, when facts are needed (docs, versions, how something works).
```

Agents never call each other; the main session passes plan paths and reports. Plans are committed with
the feature; format and naming — [docs/plans/README.md](../../docs/plans/README.md).

## Test-writer vs implementer

| Mode | When / who calls | Input | Ends with |
|------|------------------|-------|-----------|
| reproduce | Bug fix, **before** implementer | Bug description or plan step ID | Status RED: the test fails for the right reason (an assertion on the bug, not an import or type error), with the failing output |
| gap-fill | **After** implementer, from plan-verifier NOT VERIFIED/PARTIAL items or the implementer's "Handoff → Tests" | Plan path + item IDs | Tests for exactly those IDs, green |
| standalone | On request, no plan | Files or behaviour | Tests, green |

The implementer writes the tests named in a plan step's "Tests:" line. test-writer touches those only in
gap-fill after the implementer has finished, never in parallel, and never edits production code. The
implementer never writes tests outside its plan.

## Permissions

| | researcher | planner | implementer | test-writer | architecture-reviewer | plan-verifier | doc-writer |
|---|---|---|---|---|---|---|---|
| Read / Grep / Glob | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Bash | read-only, by prompt only | read-only, **hook** `readonly-bash.mjs` | build, lint, tests, `git status/diff/log` — by prompt | **hook** `check-bash.mjs test` | **hook** `check-bash.mjs arch` | **hook** `check-bash.mjs verify` | read-only, **hook** `readonly-bash.mjs doc-writer` |
| Edit / Write | ✗ | ✗ | ✓ (never the plan, `INSIGHTS*.md`, `.claude/**`, `vendor/**` except contract sync) | test files only, **hook** `write-scope.mjs tests` | ✗ | ✗ | Markdown docs only, **hook** `write-scope.mjs docs` |
| Skill | ✗ | ✗ — two skills preloaded instead | ✓ — only the 10 BE/FE skills in its §1 | ✓ — only the 7 in its §2 (prompt-enforced) | ✗ | ✗ | ✗ |
| Preloaded skills | — | `onion-architecture`, `frontend-ui-architecture` | — | — (invoked per package) | `onion-architecture`, `frontend-ui-architecture` | — | `mermaid-diagram` |
| WebSearch / WebFetch | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| AskUserQuestion | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Agent (spawn) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `maxTurns` | — | 40 | 80 | 60 | 40 | 50 | 40 |

Project-wide hooks from `.claude/settings.json` (INSIGHTS append-only guard, PR gate) apply to every agent
on top of this.

**Implementer skill set** (from [pr-self-review/skill-map.json](../skills/pr-self-review/skill-map.json)):
backend — `onion-architecture`, `fastify-best-practices`, `drizzle-orm-patterns`, `postgresql-table-design`;
frontend — `frontend-ui-architecture`, `react-best-practices`, `next-best-practices`, `react-testing-library`;
both — `typescript-expert`, `zod`. The planner assigns skills to steps only from this set, so the plan and
the implementation follow the same rules that `/pr-self-review` later checks. test-writer uses the
test-relevant subset: `react-testing-library`, `frontend-ui-architecture`, `onion-architecture`,
`fastify-best-practices`, `drizzle-orm-patterns`, `zod`, `typescript-expert`.

## Hooks

All in [hooks/](hooks/), wired per agent in its frontmatter (`hooks: PreToolUse`). Every hook is an
allowlist that **fails closed** (unparseable input, unknown profile or missing path → deny) and exports
its pure check function for the tables in [hooks/test/](hooks/test/).

| Hook | Profiles (argv) | Allows | Table |
|------|-----------------|--------|-------|
| [readonly-bash.mjs](hooks/readonly-bash.mjs) | agent name for the message: `planner` (default), `doc-writer` | Read-only programs (`git log|show|diff|status|blame|grep|…`, `ls`, `cat`, `grep`, `jq`, `find`, `sed -n 'N,Mp'`, …); no redirects (except `2>&1`, `>/dev/null`), substitution, background jobs, secrets, writing flags; env prefixes only `DOCKER_HOST`, `TESTCONTAINERS_RYUK_DISABLED`, `CI`, `NO_COLOR`, `FORCE_COLOR` | `test/readonly-bash.test.mjs` |
| [check-bash.mjs](hooks/check-bash.mjs) | `arch`, `verify`, `test` | Read-only + `cd <dir>` + the check forms K1–K8 in the file header (eslint, depcruise, architecture test, check-contracts; plus typecheck and `vitest run` for verify/test; plus a temp-dir `tsc --noEmit` for test), each with an argument allowlist (`--fix`, `-u`, `--coverage`, `--output*`, `-c` denied) | `test/check-bash.test.mjs` |
| [write-scope.mjs](hooks/write-scope.mjs) | `tests`, `docs` | Write/Edit only inside the profile's path globs; `vendor/**`, `node_modules/**`, `INSIGHTS*.md`, `CLAUDE.md`, `.claude/**`, `package.json`, lockfiles always denied | `test/write-scope.test.mjs` |

Run all tables (also the frontmatter check `test/agents.test.mjs`) from the repo root:

```bash
node --test '.claude/agents/hooks/test/*.test.mjs'
```

## Artifacts

| Artifact | Produced by | Consumed by | Where | Key structure |
|----------|-------------|-------------|-------|---------------|
| Research report | researcher | main session / user | returned as text | mode, TL;DR, findings F1…, "Not found / unverified", sources S1… |
| Development Plan | planner | user (approval), implementer, plan-verifier | `docs/plans/<branch>.md`, English | Status READY / NEEDS_CLARIFICATION, AC1…, impact map, constraints C1…, steps S1… (files, skills, rules, tests, done-when), verification |
| Code changes | implementer | reviewers, `/pr-self-review` | working tree, uncommitted | — |
| Implementation Report | implementer | main session, reviewers | returned as text | Status DONE / PARTIAL / BLOCKED, steps table, AC evidence, verification with output, deviations, not verified, handoff to reviewers (incl. Tests), insight candidates |
| Test Report | test-writer | main session, plan-verifier | returned as text (tests in the working tree) | Status DONE / RED / PARTIAL / FOUND_BUG / BLOCKED, targets T1…, "Can it fail?", verification, bugs found, needed non-test changes |
| Architecture Review | architecture-reviewer | main session, implementer | returned as text | Verdict PASS / CHANGES_REQUESTED, tool gates, findings A1… (rule, edge, evidence, confidence), baseline, filtered out |
| Plan Verification Report | plan-verifier | main session, implementer, test-writer | returned as text | Verdict PASS / FAIL / INCOMPLETE, checks run, traceability matrix over R/AC/C/S, unplanned changes, plan gaps, "not verified — run these" |
| Docs changes + Doc Report | doc-writer | user, PR reviewers | docs in the working tree; report as text | Changes D1…, claims checked, diagrams to validate, proposed changes outside its scope |

Step IDs (S1…), acceptance criteria (AC1…) and constraints (C1…) are the shared vocabulary between the plan
and every report; the reports add their own local IDs — requirements R…, architecture findings A…, test
targets T…, doc changes D….

## Sources behind the agent rules

### External (official Anthropic docs and engineering posts)

| Source | Rule taken | Where it shows up |
|--------|------------|-------------------|
| [Claude Code — Subagents](https://code.claude.com/docs/en/sub-agents) | One focused task per agent; a description that singles the agent out | Scope sections and `description` of every agent |
| 〃 | Restrict tools with `tools` / `disallowedTools`, not by prompt alone | Frontmatter of every agent |
| 〃 | Bash can still write files; use a `PreToolUse` hook as a backstop for read-only agents | `readonly-bash.mjs`, `check-bash.mjs`, `write-scope.mjs` |
| 〃 | Subagents don't inherit skills or context; `skills:` preloads full skill content but is not an allowlist | planner / architecture-reviewer / doc-writer `skills:` + `Skill` disallowed; implementer and test-writer skill lists in prompt |
| 〃 | `maxTurns` as a stopping condition; prompt shape "when invoked → checklist → output format" | Frontmatter; section layout of every prompt |
| [Claude Code — Best practices](https://code.claude.com/docs/en/best-practices) | Give the agent a pass/fail check and ask for evidence (command + output) | implementer §4, test-writer §5, plan-verifier "Checks run" |
| 〃 | Reproduce first: a failing test it has to turn green | test-writer reproduce mode |
| 〃 | Review from a fresh context; a reviewer asked to find problems always finds something → review against the spec, skip style | architecture-reviewer, plan-verifier §0; "Handoff to reviewers" |
| [Claude Code — Permission modes](https://code.claude.com/docs/en/permission-modes) | The parent's `acceptEdits` / `auto` / `bypassPermissions` overrides the subagent's mode | No `permissionMode` set; boundaries come from the tool lists and hooks |
| [Agent Skills — Best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) | Progressive disclosure; concise, one default; plan → validate → execute | Skills read only per step; one command per package; implementer accepts only Status READY |
| [Multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) | Delegation needs an objective, an output format and boundaries; hand over artifacts by reference | Fixed report templates with IDs; plan saved to a file and passed by path |
| [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) | Orchestrator-workers; evaluator-optimizer only with clear criteria; ground truth from tools | Main session orchestrates; plan-verifier re-runs checks; ≤3 fix attempts |
| [Develop tests (Claude platform)](https://platform.claude.com/docs/en/test-and-evaluate/develop-tests) | Fixed grading scale, machine-checkable output | plan-verifier MET / PARTIAL / NOT MET / NOT VERIFIED |
| [claude-code-security-review prompts](https://raw.githubusercontent.com/anthropics/claude-code-security-review/main/claudecode/prompts.py), [README](https://raw.githubusercontent.com/anthropics/claude-code-security-review/main/README.md) | Confidence per finding, report ≥ 0.8, "better to miss theoretical issues"; only issues the change introduces; separate false-positive filter with exclusions | architecture-reviewer §4–§5 |

### External (other)

| Source | Rule taken | Agent |
|--------|------------|-------|
| [TDD skill (obra/superpowers)](https://skills.sh/obra/superpowers/test-driven-development) — community | The test must fail without the change, for the right reason | test-writer "Can it fail?" |
| [Stryker](https://stryker-mutator.io/docs/), [arXiv 2506.02954](https://arxiv.org/html/2506.02954v6), [arXiv 2609.24341](https://arxiv.org/pdf/2609.24341) | Coverage ≠ quality; reason about the mutation a test kills | test-writer §4 |
| [Testing Library — Guiding principles](https://testing-library.com/docs/guiding-principles/), [Query priority](https://testing-library.com/docs/queries/about/#priority), [user-event](https://testing-library.com/docs/user-event/intro) | Test like a user; `getByRole` first; user-event preferred (not installed here → `fireEvent`) | test-writer §0, §4 |
| [Vitest — Timers](https://vitest.dev/guide/mocking/timers) | Fake timers + `vi.waitFor` / `expect.poll`, no fixed sleeps | test-writer §4 |
| [dependency-cruiser rules](https://raw.githubusercontent.com/sverweij/dependency-cruiser/main/doc/rules-reference.md), [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) | Rules as named from/to pairs with severity; cite the rule name | architecture-reviewer rule IDs, finding "Edge" |
| [ArchUnit user guide](https://www.archunit.org/userguide/html/000_Index.html) | Onion rules incl. adapter isolation; pre-existing violations as a frozen baseline | architecture-reviewer "Baseline" |
| [LLM-as-a-judge, arXiv 2306.05685](https://arxiv.org/abs/2306.05685) | Self-enhancement bias → a different, stronger judge model | plan-verifier on `opus` vs implementer on `sonnet` |
| [VV&T — verification matrix](https://oreilly.com/library/view/verification-validation-and/9781118029312/c04-sec1-0002.xhtml) | Traceability matrix; methods inspection / analysis / demonstration / test | plan-verifier §4 |
| [Spec Kit /analyze](https://github.com/github/spec-kit/blob/main/templates/commands/analyze.md), [/checklist](https://github.com/github/spec-kit/blob/main/templates/commands/checklist.md) | Coverage in both directions, severity, coverage %; ambiguous item → "not verifiable as written" | plan-verifier §5–§6 |
| [Diátaxis compass](https://diataxis.fr/compass/) | Classify action/cognition × acquisition/application; one type per page | doc-writer §2 |
| [Write the Docs — docs as code](https://www.writethedocs.org/guide/docs-as-code/), [adr.github.io](https://adr.github.io/) | Docs in Git next to the code, same PR; ADR only for one justified decision | doc-writer §3 |
| [C4 model](https://c4model.com/diagrams), [Mermaid syntax](https://mermaid.js.org/intro/syntax-reference.html), [GitHub diagrams](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams) | Context/container level; diagram type by question; no Beta types | doc-writer §6 |
| [Google developer style highlights](https://developers.google.com/style/highlights) | Active voice, descriptive links, code font, sentence-case headings | doc-writer §7 |

Not confirmed in the docs (so not relied on): how `permissionMode: plan` behaves for a subagent, and a
`Skill(<name>)` allowlist syntax — the implementer's and test-writer's skill restrictions are therefore
prompt-only (their write and Bash scopes are hook-enforced). "Document only what exists; link, don't copy"
in doc-writer is a project rule, not from a cited source.

### Project

| Source | What the agents take from it |
|--------|------------------------------|
| [CLAUDE.md](../../CLAUDE.md) and each package's `CLAUDE.md` | Package boundaries, commands, contract sync, "Do not touch", English-only docs |
| `INSIGHTS.md` (root and per package) | Package managers per package, ESLint per package, OrbStack `DOCKER_HOST`, drizzle expand/contract, i18n in shared components, reviewer-core test typecheck, tools-first architecture review, flaky sleeps, jsdom quirks, SDD freshness |
| [onion-architecture](../skills/onion-architecture/SKILL.md), [frontend-ui-architecture](../skills/frontend-ui-architecture/SKILL.md) | Where each backend / frontend file goes; architecture-reviewer judgment rules |
| [skill-map.json](../skills/pr-self-review/skill-map.json) | Which skill applies to which file — the same map `/pr-self-review` uses |
| [severity-rubric.md](../skills/pr-self-review/references/severity-rubric.md) | architecture-reviewer severities |
| [TESTING.md](../../TESTING.md) | Suites per package, hermetic tests, what integration and e2e need |
| `server/.dependency-cruiser.cjs`, `server/test/architecture.test.ts`, `*/eslint.config.mjs`, `scripts/check-contracts.sh` | architecture-reviewer tool gates |

## Adding or changing an agent

- Keep frontmatter minimal and the tool list as narrow as the job allows; restrict by tools and hooks first, prompt second.
- Write the agent file in English; add it to the tables above and to the "Map" in the root CLAUDE.md.
- Run `node --test '.claude/agents/hooks/test/*.test.mjs'` (includes the frontmatter check).
- Test a changed definition in a **new** session — a running session keeps the version it loaded first (root INSIGHTS.md, 2026-11-27).
- A Bash hook change: run its allow/deny table first (each hook exports its check function) — see root INSIGHTS.md, 2026-11-27.
