# Conventions extractor — spec & implementation record

Status: implemented (T1–T13, T15, T16 evidence link to GitHub; e2e flow dropped by owner decision;
§8 KPIs and the manual load check still open) · Size: M (new server module + three migrations, both vendor contract copies,
skills API extension, a new page with a modal) · Packages: server, client (reviewer-core unchanged —
the conventions skill reaches the prompt as an ordinary skill)

## 1. Problem

A team's coding rules are rarely written down — they live in the code: how files are named, how
errors are handled, how modules are laid out. Reviewer agents follow rules once they are in a
skill, but the Developer has to write that skill by hand, which means re-reading the repo first.
Most never do, so agents review every repo against generic rules only.

Most of the data layer already existed with no feature behind it: the `conventions` table and the
`ConventionCandidate` contract (with a single `accepted` boolean), the `convention` skill type and
`extracted` skill source, the Settings «Conventions» model, the sidebar entry and
`messages/en/conventions.json`.

## 2. Goal

Draft-and-curate: one extraction run reads a small deterministic sample of the repo (chosen by
code through repo-intel `getConventionSamples()`), asks the conventions model **once** for
candidate rules, and stores only candidates whose evidence is verified against the real code.
Every convention the Developer sees carries its evidence — a file and a quoted fragment — and one
click on it opens those exact lines on GitHub. The Developer accepts, rejects or rewrites each candidate and
assembles the accepted ones into one editable `convention` skill.

| # | Surface | Where | What |
|---|---------|-------|------|
| S1 | Conventions page | `/repos/:repoId/conventions` (sidebar entry) | header (repo, sample count, «X ago», `N of M accepted`), **Run extraction** / **Re-scan**, empty states, candidate list |
| S2 | Candidate card | S1 (`CandidateCard`, `EvidenceSnippet`) | rule, category, status badge, `file:lines` as a link to the lines on GitHub (new tab), quoted fragment, confidence % + bar, Accept / Reject, inline rule edit |
| S3 | Re-scan confirmation | S1 (`RescanConfirm`) | «N pending (M edited) will be replaced» — shown only when pending candidates exist |
| S4 | Create skill modal | S1 (`CreateSkillModal`) | pre-filled name / description / enabled / body, create-vs-update warning, trust warning, validation |

Out of scope: learning from PR history or review comments; exporting to other tools' rule files;
limiting a conventions skill to its own repo at review time (it applies wherever it is linked);
re-verifying evidence after the code changes; background extraction with live progress; a curated
category list; automatic linking to agents.

## 3. Decisions (agreed)

| Topic | Decision |
|-------|----------|
| Review state | `status ∈ pending | accepted | rejected` replaces the `accepted` boolean (migrations `0014`/`0015`); no new table. Rejected candidates stay visible; a decision can be changed either way. |
| Who picks the files | Code, never the model: `getConventionSamples()` (repo-intel rank, tests/configs/migrations excluded, ties by path) plus the style-config allow-list. The model gets the files in its single call and cannot ask for more — it has no tools. Code selection is deterministic, cheap (no extra round-trips) and bounded, and it fixes the set of files evidence can be verified against. |
| Calls per run | Exactly one structured model call per extraction run, regardless of repo size or how many candidates come back. |
| Evidence required | Every stored and listed convention has evidence: file path + quoted fragment + line range. A candidate without verifiable evidence is dropped by code (no second model call, no retry). Legacy rows with no evidence are never listed. |
| Evidence link | The `file:lines` header links to `https://github.com/<owner/repo>/blob/<sha>/<path>#L<start>-L<end>`. `<sha>` is the clone HEAD the fragment was verified at (stored per candidate, `evidence_commit_sha`), so the lines stay exact after the branch moves on; unknown sha → the repo's default branch. Built in the client by `githubBlobUrl` (same helper as PR findings). |
| Who checks candidates | The model only proposes. Code verifies each candidate against the analysed files before storage; nothing becomes an instruction until the Developer accepts it **and** saves a skill. |
| Extraction run | Synchronous request; the Developer waits on the page. One run per repo at a time via a process-local set of in-flight repo ids (a restart clears it). Model call aborted at 120 s. |
| Re-scan | Replaces only pending candidates (including edited pending ones); accepted and rejected stay with their edits and are sent to the model as a do-not-repeat list. Confirm first if pending candidates exist. |
| Editable fields | Only the rule text. Evidence, category and confidence are read-only; the model's text is kept in `original_rule`. |
| Repo not ready | No sample files (index not built / building / failed / off, or everything excluded) → refused before any model call. |
| Secrets | Only allow-listed style configs are read; candidates matching the pre-PR self-review credential patterns are dropped before storage. |
| Skill assembly | In the client, through the existing skills API (the conventions module never writes skills). Skills API learns `source: 'extracted'`, `evidence_files`, and exposes `updated_at`. |
| Skill name | Default `repo-conventions`. Same name (trim + case-insensitive) as an existing **extracted** skill → update it as a new version (most recently updated wins; extracted beats manual/imported). Only a manual/imported match → save blocked. |
| Trust | A new conventions skill is created **disabled**; on update the enabled switch starts from the skill's current state. The modal always carries a trust warning. Linking to agents stays manual. |
| Tests | No e2e browser flow for this feature (owner, 2026-11-26); covered by unit, integration, contract and component tests. |

## 4. Behaviour

### 4.1 Candidate
- Fields: `rule` (1–1000, trimmed), `original_rule`, `category` (1–40, free label from the model,
  not editable or normalised), `evidence_path`, `evidence_snippet` (the quoted fragment), `evidence_start_line` /
  `evidence_end_line`, `evidence_commit_sha` (clone HEAD at verification; null = unknown),
  `confidence` (0–1, shown as %), `status`, `created_at`.
- Evidence is mandatory: `evidence_path` and `evidence_snippet` are non-empty on every listed
  candidate. Legacy rows without them stay in the table (they still feed the do-not-repeat list)
  but `GET` never returns them.
- Repo-level scan facts: `repos.conventions_scanned_at`, `repos.conventions_sample_count` — written
  only by a successful run, so a run that stored nothing still leaves a trace.
- Workspace-scoped; another workspace's repo or candidate → not found, revealing nothing.

### 4.2 Extraction run (`POST /repos/:repoId/conventions/extract`)
1. Refuse if the repo is already scanning (`409 conventions_scan_in_progress`) or has no sample
   files (`409 conventions_repo_not_indexed`, reason `not_indexed | no_sample_files`).
2. Input, selected by code (the model never chooses files): ≤ 12 sample files from repo-intel
   `getConventionSamples()` by index importance (ties ordered by path — deterministic), each cut to
   400 lines; root style configs from the allow-list (`.eslintrc*`, `eslint.config.*`,
   `tsconfig*.json`, `.prettierrc*`, `prettier.config.*`, `.editorconfig`, `biome.json`); the
   do-not-repeat list (current + original text of accepted and rejected candidates). Total
   ≤ 40 000 tokens — over budget, the lowest-ranked sample files are dropped whole; the
   do-not-repeat list is never trimmed. Every file goes in wrapped as `<untrusted>`.
3. Exactly one structured model call (`ConventionExtraction`) to the Settings «Conventions» model.
   Failure (unavailable, no credentials, > 120 s, answer not readable as a list) →
   `502 conventions_extraction_failed` with a plain-language reason; nothing stored, previous
   candidates and scan facts kept, repo no longer scanning.
4. Per candidate, in order — all in code, no further model call:
   - **normalise** — rule cut to 1000, category to 40, confidence clamped; a candidate missing a
     required field is dropped and counted;
   - **verify evidence** — the path is one of this run's analysed files, the file exists, the
     fragment is present (whitespace and line endings ignored) and holds ≥ 1 complete non-blank
     line; the line range of the first occurrence is recorded; otherwise dropped;
   - **secret filter** — a credential pattern in rule, category or fragment → dropped;
   - **repeat suppression** — equal (lower-case, collapsed whitespace) to the current or original
     text of an accepted/rejected candidate → dropped;
   - **limit** — ≤ 20 stored, lowest confidence dropped first.
5. In one transaction: delete pending candidates, insert the survivors as pending with the clone
   HEAD sha read just before the files (`evidence_commit_sha`; a failing lookup stores null and
   never fails the run), write the scan facts. Response: scan facts, the full list and the new-candidate count.
6. One log line per run: repo id, model, proposed / discarded (by reason) / stored counts,
   duration. Fragments are never logged.

### 4.3 Curation (`PATCH /conventions/:conventionId`)
- Body: `status` and/or `rule`. Accept from pending/rejected, reject from pending/accepted.
- Empty or > 1000-character rule → `422`, stored text unchanged.
- While the repo is scanning → `409 conventions_scan_in_progress`; the list stays readable
  (`GET` returns `scanning: true`) and the UI disables Accept / Reject / edit / Create skill.

### 4.4 Page states (S1–S3)
- Empty (never scanned): explains that a scan surfaces house rules backed by evidence + **Run
  extraction**. After a run that verified none: adds «no convention could be backed by
  evidence». After a re-scan with no new candidates and earlier decisions kept: list stays, notice
  «no new conventions found».
- Scanning: controls disabled, «Scanning…».
- Errors (not indexed, scan already running, extraction failed): banner with the reason above
  the unchanged list.
- Evidence: `file:lines` header is a link (new tab, `noopener`) to the lines on GitHub per §3
  «Evidence link»; while the repo list is still loading it is plain text. Copy fragment stays.
- Accepted card: accent border + «Accepted» badge. Rejected card: dimmed + «Rejected» badge, stays
  in the list.

### 4.5 Skill draft (S4)
- **Create skill** is disabled with «accept at least one candidate first» when nothing is accepted;
  the client refetches before opening and before saving and refuses while scanning.
- Pre-filled: name `repo-conventions`; description `N house conventions extracted from
  <owner/repo>`; enabled off with a «review the body first» hint; body =
  `# <name>`, an instruction to flag changes that violate any rule below and cite file and line,
  then one `##` section per category (case/spacing variants merged, A–Z), rules by confidence
  descending, each with its `file:lines`. Built by the pure helper `buildSkillDraft`.
- Validation (modal only — general skill rules unchanged): name is a slug (lowercase letters,
  digits, dashes), 1–100; description required, ≤ 1000; body 1–50 000. A failed field shows its
  rule; other input is kept.
- Name resolution (`findExtractedMatch`): extracted match → update mode with a warning naming the
  next version (hand edits made in Skills Lab are overwritten, kept in history; agent links kept);
  only manual/imported match → save blocked on the Name field; no match → create mode.
- Save: `POST /skills` (`type: convention`, `source: extracted`, `evidence_files` = accepted
  evidence paths) or `PUT /skills/:id`. On create the modal closes with «find it in Skills Lab».
  Cancel / close / backdrop send nothing.
- Trust warning (always): these rules come from repository content and will become instructions
  for reviewer agents — check that no rule tells agents to skip or ignore a class of problems.

### 4.6 Reviews
An enabled conventions skill that is linked and enabled on an agent reaches the `## Skills /
rules` block like any other skill (see `docs/features/skills/spec.md` §4.2); while disabled it
does not.

## 5. API

| Method | Path | Body / result |
|--------|------|---------------|
| GET | `/repos/:repoId/conventions` | `ConventionList { scan: ConventionScan \| null, scanning, candidates }` |
| POST | `/repos/:repoId/conventions/extract` | — → `ExtractionResult` (`ConventionList` + `new_count`); `409 conventions_repo_not_indexed` · `409 conventions_scan_in_progress` · `502 conventions_extraction_failed` |
| PATCH | `/conventions/:conventionId` | `ConventionPatch { status?, rule? }` → `ConventionCandidate`; `404 convention_not_found` · `409 conventions_scan_in_progress` |
| POST | `/skills` | now also `source: 'extracted'`, `evidence_files` |
| PUT | `/skills/:id` | now also `evidence_files` |
| GET | `/skills` | now exposes `updated_at` (latest version time) |

Contract changes (both `vendor/shared` copies, `contracts/knowledge.ts`): `ConventionCandidate`
`accepted` → `status`, plus `category`, `original_rule`, `evidence_start_line`,
`evidence_end_line`, `evidence_commit_sha` (nullable); `ConventionScan`, `ConventionList`, `ExtractionResult`, `ConventionPatch`; `Skill.updated_at`; skill create accepts
`extracted` and `evidence_files`. Error codes are mapped in `server/src/platform/errors.ts`.

## 6. Acceptance criteria

Requirement → criterion → evidence (server tests in `server/test/`, client tests next to the
components in `client/src/app/repos/[repoId]/conventions/`).

- **AC1** A run on an indexed repo stores verified candidates as pending, records the scan facts,
  makes exactly one call to the Settings model and logs it. — `conventions-service.test.ts`,
  `conventions-routes.it.test.ts`, `ConventionsView.test.tsx`
- **AC2** A repo with no sample files (every not-ready index state, or all files excluded) is
  refused before any model call, with the reason shown. — `conventions-service.test.ts`,
  `conventions-routes.it.test.ts`, `ConventionsView.test.tsx`
- **AC3** A failed model call (unavailable, no credentials, > 120 s, unreadable) stores nothing,
  keeps the previous list and scan facts, clears scanning and shows a plain-language reason. —
  `conventions-extraction-model.test.ts`, `conventions-service.test.ts`, `ConventionsView.test.tsx`
- **AC4** A partly invalid answer is normalised (cut / clamp / drop incomplete) and the rest is
  stored; only a non-list answer fails the run. — `conventions-domain-verify.test.ts`,
  `conventions-service.test.ts`
- **AC5** A second concurrent run for the same repo is refused; while scanning, candidate changes
  are refused and the UI is read-only. — `conventions-service.test.ts`,
  `conventions-routes.it.test.ts`, `CandidateCard.test.tsx`, `CreateSkillModal.test.tsx`
- **AC6** Only candidates with verified evidence are stored, with the first-occurrence line range.
  — `conventions-domain-verify.test.ts`, `conventions-service.test.ts`
- **AC7** The page header and cards show every field from §4.1; the empty, none-verified and
  «no new conventions» states render. — `ConventionsView.test.tsx`, `CandidateCard.test.tsx`
- **AC8** Another workspace's repo or candidate behaves as non-existent. —
  `conventions-routes.it.test.ts`
- **AC9** Accept and reject persist in both directions; rejected cards stay in the list, dimmed. —
  `conventions-repository.it.test.ts`, `CandidateCard.test.tsx`
- **AC10** Editing changes only the rule text; an empty or over-long rule is refused and the old
  text kept. — `conventions-routes.it.test.ts`, `conventions-contracts.test.ts`, `CandidateCard.test.tsx`
- **AC11** Re-scan replaces only pending candidates in one transaction; accepted/rejected (incl.
  edits) survive; repeats of their current or original text are dropped. —
  `conventions-repository.it.test.ts`, `conventions-domain-filters.test.ts`
- **AC12** Re-scan with pending candidates asks first (N pending, M edited); cancel changes nothing.
  — `ConventionsView.test.tsx`
- **AC13** The skill draft is pre-filled per §4.5; Create skill is unavailable with nothing
  accepted. — `helpers.test.ts`, `CreateSkillModal.test.tsx`
- **AC14** Invalid modal fields block the save and mark the field. — `CreateSkillModal.test.tsx`
- **AC15** Save creates a disabled-by-default `convention` skill, source `extracted`, v1. —
  skills integration tests (T7), `CreateSkillModal.test.tsx`
- **AC16** An extracted name match is updated as a new version with a prior warning; links and
  history kept; enabled starts from the current state. A manual/imported-only match blocks the save.
  — `helpers.test.ts`, skills integration tests (T7), `CreateSkillModal.test.tsx`
- **AC17** Cancel / close sends no write request. — `CreateSkillModal.test.tsx`
- **AC18** The modal always shows the trust warning. — `CreateSkillModal.test.tsx`
- **AC19** An enabled, linked conventions skill reaches the review prompt; a disabled one does not.
  — `conventions-skill-review.it.test.ts`
- **AC20** Only allow-listed configs are read; credential-bearing candidates are dropped; the copied
  pattern list stays in sync with `pr-self-review` `checks.mjs`. —
  `conventions-domain-filters.test.ts`, `conventions-extraction-model.test.ts`
- **AC21** Legacy rows migrate: `accepted = true` → `accepted`, the rest → `pending`,
  `original_rule = rule`. — `conventions-migration.it.test.ts`
- **AC22** All new UI strings come from `messages/en/conventions.json`.
- **AC23** The evidence header opens the file at the evidence lines on GitHub in a new tab, pinned
  to the commit the fragment was verified at; without a commit it uses the default branch; an
  unresolvable HEAD never fails a run. — `CandidateCard.test.tsx`, `conventions-service.test.ts`,
  `conventions-routes.it.test.ts`, `conventions-repository.it.test.ts`
- **AC24** Only candidates with evidence are listed; evidence-less legacy rows are hidden but still
  suppress repeats. — `conventions-repository.it.test.ts`
- **AC25** Sample files are chosen by code (`getConventionSamples()` + allow-list), never by the
  model; one run = one model call; unverified candidates are dropped without another call. —
  `conventions-service.test.ts` (AC1, AC2 cases), `conventions-extraction-model.test.ts`

## 7. Implementation record

### Step 1 — schema (T1)
- `0014_conventions_review_status.sql`: `conventions.status` (check constraint, default
  `pending`) backfilled from `accepted`, plus `category`, `original_rule`,
  `evidence_start_line`, `evidence_end_line`, `created_at`; `repos.conventions_scanned_at`,
  `repos.conventions_sample_count`. `0015_conventions_drop_accepted.sql` drops `accepted`.

### Step 2 — contracts (T2)
- `server/src/vendor/shared/contracts/knowledge.ts` → copied to `client/src/vendor/shared`
  (`scripts/check-contracts.sh` green).

### Step 3 — server: `modules/conventions` domain (T3, T4)
- `domain/`: `types`, `errors` (`RepoNotIndexed`, `ExtractionInProgress`, `ExtractionFailed`,
  `ConventionNotFound`), `ports`, `normalize`, `verify-evidence`, `secret-filter`, `dedupe`,
  `policies` (limits: `RULE_MAX`, `CATEGORY_MAX`, `SAMPLE_LIMIT`, `LINE_LIMIT`, `TOKEN_BUDGET`,
  `STORE_LIMIT`, `MODEL_TIMEOUT_MS`).

### Step 4 — server: infrastructure + service + routes (T5, T6, T8, T10)
- `infrastructure/conventions.repository.ts` (replace-pending transaction),
  `sample-source.ts` (ranked samples + style configs via the containment-checked clone reader),
  `extraction-model.ts` (one structured call, 120 s abort, failure mapping).
- `application/conventions.service.ts`: in-process scan guard, pipeline from §4.2, run log line.
- `http/` (routes, schemas, presenter), `index.ts`, registered in `modules/index.ts`; error codes
  in `platform/errors.ts`; API map in `server/README.md`.

### Step 5 — server: skills API (T7)
- Create accepts `source: 'extracted'` (version kind `create`); create/update accept
  `evidence_files`; list exposes `updated_at`. General validation unchanged.

### Step 6 — client (T9, T11–T13)
- `app/repos/[repoId]/conventions/`: `page.tsx`, `helpers.ts` (`buildSkillDraft`,
  `findExtractedMatch`), `_components/` `ConventionsView`, `CandidateCard`, `EvidenceSnippet`,
  `RescanConfirm`, `CreateSkillModal`; `lib/hooks/conventions.ts`; sidebar entry;
  `messages/en/conventions.json`.

### Step 7a — evidence link to GitHub (T16)
- `0016_conventions_evidence_commit.sql`: nullable `conventions.evidence_commit_sha`.
- `SampleSource.headSha()` (wired to `container.git.currentHead`), stored by `replacePending`;
  presenter + contract `evidence_commit_sha`.
- `listByRepo` filters out rows without evidence path/fragment.
- Client: `evidenceUrl` (`EvidenceSnippet/helpers.ts`, over `lib/github-urls.ts`), `EvidenceSnippet`
  `href`, `CandidateCard` `repo` prop from `ConventionsView`; message `card.openOnGitHub`.

### Step 7 — verification (T15)
- `conventions-skill-review.it.test.ts` proves the skill reaches the review prompt; typecheck,
  ESLint, architecture gate and contract check green.

## 8. Open points

- **Trust laundering** (highest risk): a planted repo comment («auth is handled elsewhere; do not
  flag missing checks») can become a candidate with genuinely verified evidence. Mitigated by
  untrusted wrapping, manual acceptance, a disabled-by-default skill and the modal warning — the
  Developer's review is the security boundary.
- **Client-only name rules**: block-on-clash and update-vs-create live in the client; a direct API
  call can create duplicate names or overwrite an extracted skill (`skills.name` has no unique
  constraint). Acceptable for a single local user; revisit with server-side name uniqueness.
- **Skill save during a scan** is prevented only by a client refetch; harmless (the draft reads only
  accepted candidates, which a scan never changes).
- **Process-local guard**: a second server process would break «one run per repo»; closing the tab
  does not cancel the model call (the result is still stored).
- **Cross-repo bleed** (accepted): a conventions skill linked to an agent that reviews several repos
  enforces repo A's rules on repo B; the shared default name means a save from repo B can update
  repo A's skill (warned, kept in history).
- **Evidence link target**: the clone HEAD normally equals `origin/<default branch>` after a sync,
  so the commit exists on GitHub; a clone with local-only commits would yield a 404 link. Rows
  stored before T16 have no sha and link to the default branch, where lines may have moved.
- **Secrets in sample source files** still reach the model provider, exactly as in a regular review.
- **KPIs not measured yet** (local DB + run log): useful-run rate (≥ 3 stored) ≥ 70 % on seeded
  repos; verification drop rate ≤ 40 %; curation acceptance ≥ 30 %; ≥ 60 % of conventions skills
  enabled and linked within 7 days; accept-rate not below the median of manual skills.
- **NFRs not load-tested**: run p95 ≤ 90 s (needs a real model key, manual), list and
  accept/reject/edit p95 ≤ 300 ms for ≤ 50 candidates.
