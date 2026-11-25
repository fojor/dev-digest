# Skills in the product (M2) — spec & implementation record

Status: Phase 1 implemented (Steps 1–7; control experiment §8 AC14–AC15 open) · **Phase 2
(§9: Config/Preview alignment, Stats, Versions) implemented — see §9.9** · Size: L (new
server module + migration, both vendor contract copies, a new page, a new editor tab, seed) ·
Packages: server, client (reviewer-core unchanged — it already accepted `skills`) · Written
retroactively from the implementation; the code and tests are the source of truth where they differ.

## 1. Problem

Every reviewer agent carries all of its rules in one system prompt. A rule that two agents need
(e.g. "flag untested branches") is copied into both prompts and drifts. Users can't add, share,
turn off or reorder a rule without editing a prompt, and there is no way to take in a rule
someone else wrote. The DB already had `skills`, `skill_versions` and `agent_skills` (with order),
the prompt assembler already had a `## Skills / rules` slot and the run trace a `skills` field —
but nothing created skills, nothing linked them from the UI, and `run-agent.ts` never passed any,
so the slot was always empty.

## 2. Goal

Reusable, text-only skills that the user creates, edits, imports and links to agents in order:

| # | Surface | Where | What |
|---|---------|-------|------|
| S1 | Skills page | `/skills` (sidebar: SKILLS LAB → Skills) | card list (name, type, description, global on/off), search, side panel (Config editor · Preview), **Add Skill** → Create skill / Import from file… |
| S2 | Import drawer | from S1 | upload `.md` / `.zip` → preview (editable) → **Save skill** |
| S3 | Agent editor → **Skills** tab | `/agents/:id?tab=skills` | every skill with a checkbox, `N of M enabled`, filter, drag (or Alt+↑/↓) to reorder |
| S4 | Run trace → Prompt assembly | `RunTraceDrawer` → `TraceBody` | **Skills (dynamic) · N tokens** block; Live log line `Loaded N skill(s): …` |

Plus: a new agent, **Test Quality Reviewer**, with its own skills; a skill package to import;
two seeded PRs for the control experiment; `pr-self-review` with auto-invocation off.

Out of scope for Phase 1 (present in the design): the skill panel's Evals / Stats / Versions tabs,
**Run on evals**, per-card stats (agents · pull % · accept %), the source label on cards, the
editor's live token counter, import from URL, the community catalog, a version-history UI.
Stats, Versions, card stats/source and the editor chrome move into **Phase 2 (§9)**; Evals and
**Run on evals** stay out (milestone M6), as do URL import and the community catalog.

## 3. Decisions (agreed)

| Topic | Decision |
|-------|----------|
| What a skill can do | Text only. Its body is appended to the prompt; nothing in it is executed, ever. |
| Source of truth | The DB. Seed and sample files only affect fresh workspaces / imports. |
| Per-agent checkbox (S3) | A link keeps its position when unchecked: `agent_skills.enabled` (migration `0012`). Unchecking ≠ unlinking. |
| What reaches the prompt | Linked **and** `agent_skills.enabled` **and** `skills.enabled`, in link order. |
| Import formats | `.md` and `.zip`. No URL import. |
| Import trust | Preview first, save only on confirm; from an archive only `SKILL.md` is read; other entries are listed (executables flagged) and never extracted or run; the drawer warns that a foreign skill is foreign instructions. Saved with `source: 'imported'`. |
| Added tokens (S4) | Counted on the server with the existing tokenizer adapter (js-tiktoken `cl100k_base`, falls back to chars/4) and stored in the trace as `prompt_assembly.skills_tokens`, so old and CI runs keep it. The PR page's token numbers stay the provider's real totals. |
| New agents | Only **Test Quality Reviewer**. |
| API-contract skill | Not seeded — it is the import sample (`docs/skills/api-contract-guard`), attached by the user to the **Test Quality Reviewer**. |
| Versioning | A content edit (name, description, type, body) bumps `skills.version` and snapshots the body into `skill_versions`; toggling `enabled` does not. No history UI. |
| Delete | Deleting a skill removes it from every agent (FK cascade). |
| Scope of S1 | Only what the requirements list (see §2 "Out of scope"). |

## 4. Behaviour

### 4.1 Skill
- Fields: `name` (1–100, trimmed), `description` (≤1000), `type` ∈ `rubric | convention | security |
  custom`, `body` (markdown, 1–50 000 chars), `enabled`, `source` ∈ `manual | imported` on create
  (`imported_url | extracted | community` exist in the enum for later milestones), `version`.
- The description is the skill's interface: the agent reads it to decide when the rules apply.
  The form's hint asks for a directive ("Flag …", "Check that …", "Use when …").
- Workspace-scoped; another workspace's id → `404 skill_not_found`.

### 4.2 Prompt
- `run-agent.ts` loads `skills.listEnabledForAgent(agentId)` (§3 rule) before the engine call and
  renders each skill as:
  ```
  ### Skill: <name>
  _<description>_            ← omitted when empty

  <body>
  ```
- The blocks are joined into the user message's `## Skills / rules` section by
  `reviewer-core/src/prompt.ts` (unchanged), after the PR description and before memory / repo
  skeleton / diff. They are **not** wrapped as `<untrusted>` — they are instructions by design;
  that is why import needs a preview and a trust warning.
- No enabled skills → the section and `prompt_assembly.skills` are absent, `skills_tokens` is null.
- Live log: `Loaded N skill(s): a, b` or `No enabled skills for this agent`.

### 4.3 Agent links (S3)
- The tab lists every workspace skill: linked skills first in link order (checkbox = link's
  `enabled`), then never-linked skills by name, unchecked.
- Any change (check, uncheck, reorder) saves the **whole** visible order:
  `POST /agents/:id/skills { skills: [{ skill_id, enabled }] }`, position = index. So after the
  first change every skill becomes a link; unchecked ones keep their place. Optimistic update,
  rolled back on error.
- Reordering is disabled while the filter hides rows (a partial list has no well-defined order).
- A globally disabled skill shows `off globally`; it stays checkable but won't reach the prompt.
- The legacy body `{ skill_ids: [...] }` (all enabled) and `{ skill_id, order? }` (link one) still work.

### 4.4 Import (S2)
- Client reads the file (`FileReader`), rejects > 512 KB, sends `{ filename, content_base64 }` to
  `POST /skills/import/preview`. The server stores nothing and returns
  `{ name, description, type, body, source_file, ignored_files[{ path, executable }], warnings[] }`.
- `.md` / `.markdown`: UTF-8 (fatal decode), no NUL bytes; YAML frontmatter `name`,
  `description`, `type` (plain, quoted, `>` / `|` block scalars; nested keys ignored).
  Fallbacks: name ← first `# heading` (slugified) ← filename, with a warning; empty description →
  warning; unknown/missing type → `custom`.
- `.zip`: read in memory (fflate); the shallowest `SKILL.md` (case-insensitive, `__MACOSX/` and
  `.DS_Store` skipped) is the core and must be ≤ 256 KB; > 500 entries → rejected. Only that entry
  is inflated. Every other file is listed as ignored; `executable` = under `scripts/`, `bin/`,
  `hooks/` or a code/binary extension; when any exist a warning says they were ignored and never run.
- Errors → `400 invalid_skill_import` with a human message (not a zip, no `SKILL.md`, too big,
  not text, wrong extension, empty).
- The preview fields are editable; **Save skill** calls the normal create with `source: 'imported'`
  and selects the new skill.

### 4.5 Trace (S4)
- `prompt_assembly.skills_tokens = tokenizer.count(prompt_assembly.skills)` on a successful run;
  absent/null otherwise (contract field is `nullish`, so old traces parse).
- `TraceBody` labels the block `Skills (dynamic) · N tokens` when the count exists.

## 5. API

| Method | Path | Body / result |
|--------|------|---------------|
| GET | `/skills` | `Skill[]`, by name |
| GET | `/skills/:id` | `Skill` |
| POST | `/skills` | `{ name, description, type, body, enabled?, source?: 'manual'\|'imported' }` → 201 `Skill` (v1) |
| PUT | `/skills/:id` | any of `name, description, type, body, enabled` → `Skill` |
| DELETE | `/skills/:id` | `{ ok: true }` |
| POST | `/skills/import/preview` | `{ filename, content_base64 }` → `SkillImportPreview` |
| GET | `/agents/:id/skills` | `AgentSkillLink[]` (`agent_id, skill_id, order, enabled`) |
| POST | `/agents/:id/skills` | `{ skills: [{ skill_id, enabled }] }` \| `{ skill_ids }` \| `{ skill_id, order? }` → `AgentSkillLink[]` |

Contract changes (both `vendor/shared` copies): `SkillSource` + `'imported'`;
`SkillImportPreview`, `SkillImportIgnoredFile`; `AgentSkillLink.enabled`;
`PromptAssembly.skills_tokens`.

## 6. Acceptance criteria

Requirement checklist → criterion → evidence.

- **AC1** CRUD over the skills table; the DB is the source of truth. — `test/skills.it.test.ts` "CRUD", `test/skills-service.test.ts`
- **AC2** Skills page: card grid with name, type, description, enabled switch; click opens the side preview; Add → create / import. — `SkillsView`, `SkillCard`; browser check (§7 Step 7)
- **AC3** Editor form: name, description, type, markdown body; the description field tells the user to phrase it as a directive. — `SkillPanel.test.tsx`
- **AC4** A skill is created and edited in the UI; an edit bumps the version, a toggle does not. — `SkillPanel.test.tsx`, `skills-domain.test.ts` `applySkillPatch`, browser check (v2 after save)
- **AC5** Agent Skills tab: link, enable/disable, reorder; an unchecked skill keeps its position. — `SkillsTab.test.tsx`, `SkillsTab/helpers.test.ts`, `skills.it.test.ts` links
- **AC6** Order defines the sequence of blocks in the prompt. — `skills.it.test.ts` (`second-skill` before `first-skill`)
- **AC7** An enabled skill is a separate block in the trace and the log; a disabled one (link or global) is absent. — `skills.it.test.ts`; real run on PR #501 (`Loaded 4 skill(s)` vs `No enabled skills`)
- **AC8** The trace shows the tokens the skills block adds. — `skills.it.test.ts` (`skills_tokens > 0`), `RunTraceDrawer.test.tsx`; real run: 776 tokens
- **AC9** Import accepts `.md` and `.zip`, extracts the core and shows a preview; nothing is stored before confirm. — `skills-service.test.ts`, `skills.it.test.ts` "import preview", `ImportSkillDrawer.test.tsx`
- **AC10** Executable parts of an archive are never processed: not inflated, not stored, not run; they are listed as ignored. — `skills-service.test.ts` (zip with `scripts/install.sh`), browser import of `api-contract-guard.zip`
- **AC11** Test Quality Reviewer exists and checks untested branches, missing corner cases, over-mocking, flaky tests via its linked skills. — `seed.ts`, `seed-skills.ts`, `seed-experiment.test.ts`
- **AC12** Each new agent has skills linked; at least one skill came in through import. — seed links 4 skills; `api-contract-guard` imported via S2 (manual step)
- **AC13** `pr-self-review` exists with auto-invocation off; invoked manually it pulls both frontend and backend skills. — `disable-model-invocation: true` in `.claude/skills/pr-self-review/SKILL.md`; `skill-map.json` covers `client/` and `server/` · **manual run: open**
- **AC14** Control experiment, Test Quality (PR #501, happy-path-only test): without skills — miss; with skills — flags the untested branch and a boundary case. — **partially met**, see §8
- **AC15** Control experiment, API Contract (PR #502, route signature change): without the skill — miss; with it — breaking change found. — **open**, see §8
- **AC16** All new UI strings come from `messages/en/*.json`. — `skills.json`, `agents.json` `skillsTab`, `runs.json` `trace.prompt.skillsTokens`

## 7. Implementation record

### Step 1 — schema
- `agent_skills.enabled boolean not null default true`, index `skills_ws_idx` on `skills.workspace_id`,
  `skills.source` enum + `'imported'` → migration `server/src/db/migrations/0012_skills_m2.sql`.

### Step 2 — contracts
- `server/src/vendor/shared/contracts/knowledge.ts`, `trace.ts` → copied to `client/src/vendor/shared`
  (`scripts/check-contracts.sh` green).

### Step 3 — server: `modules/skills` (onion)
- `domain/` types, errors (`skill_not_found` → 404, `invalid_skill_import` → 400 in
  `platform/errors.ts`), pure policies (patch/version, frontmatter, archive rules), ports
  (`SkillsRepository`, `SkillsUnitOfWork`, `ArchiveReader`).
- `application/skills.service.ts`, `infrastructure/` (Drizzle repo + UoW + mapper), `http/`,
  `index.ts`; registered in `modules/index.ts`; `container.skillsRepo / skillsUow / archive`.
- Adapter `src/adapters/archive` (fflate `^0.8.2`, new dependency).
- Agents module: `SkillLink.enabled`, `setSkills(links)`, new `skills` body shape.

### Step 4 — server: prompt + trace
- `reviews/domain/ports.ts`: `AgentSkillsReader`, `ReviewRunDeps.skills` / `countTokens`
  (wired to `skillsRepo` and the tokenizer in the container).
- `run-agent.ts` loads + logs skills, `helpers.renderSkillBlock`; `run-trace.ts` sets `skills_tokens`.

### Step 5 — client: Skills page
- `app/skills/` (`SkillsView`, `SkillCard`, `SkillPanel`, `SkillForm`, `ImportSkillDrawer`),
  `lib/hooks/skills.ts`, `lib/skill-types.ts`, nav section SKILLS LAB (`g s`), `messages/en/skills.json`.

### Step 6 — client: agent tab + trace
- `AgentEditor/_components/SkillsTab` (native HTML5 drag + Alt+↑/↓), `?tab=skills`;
  `TraceBody` token label.

### Step 7 — seed, samples, docs, verification
- `seed.ts`: Test Quality Reviewer (`seed-prompts.ts`, mirrored in
  `docs/agent-prompts/test-quality-reviewer.md`), 4 skills (`seed-skills.ts`) linked in order,
  PRs #501 / #502 (`seed-experiment.ts`, diffs from `pr_files` patches — no clone needed).
- Import sample `docs/skills/api-contract-guard/` + `.zip` (with a demo script that must never run);
  runbook `docs/skills/README.md`; API map in `server/README.md`, route map in `client/README.md`.
- Tests: server 41 files / 272 tests (unit + integration on Postgres), client 36 files / 139 tests;
  typecheck, ESLint, architecture gate, contract check green.
- Browser (local DB): create/edit (v2), import of the real zip (preview → save), uncheck + reorder
  surviving a reload, drag via dispatched DragEvents, trace label `Skills (dynamic) · 776 tokens`.

## 8. Open points

- **AC14 is only partly reproduced.** Real runs on PR #501 (deepseek-v4-flash, Test Quality
  Reviewer): with skills — 4 untested guards + 3 boundary findings, skills block 776 tokens;
  without skills — the same 4 untested guards, no boundary findings. The happy-path-only test is
  too obvious, so the model flags the branches anyway. Fix: make #501 subtler (the test covers
  three guards, misses the over-refund guard and the `amountCents === remaining` boundary) and
  confirm the difference over several runs per variant.
- **AC15 not run yet.** Link `api-contract-guard` to the Test Quality Reviewer, run #502 with the
  link unchecked and checked (≥2 runs each). Risk: the agent's base prompt is about tests
  ("you review the TESTS"), which may suppress contract findings even with the skill — if so,
  widen the base prompt to "apply every linked skill to the whole diff".
- **AC13 manual run** of `/pr-self-review` (by the user, for the video) — not done.
- **Mouse drag** was verified with dispatched DragEvents, not a physical drag (automation can't
  start native HTML5 drag); worth one manual check.
- **Cross-workspace links:** `POST /agents/:id/skills` doesn't check that the skill ids belong to
  the agent's workspace (single-workspace local app today) — add the check when workspaces become real.
- **Form accessibility:** `FormField` labels aren't bound to their inputs (pre-existing in the UI
  kit), so the skill form's fields have no accessible names.
- **Not committed;** a PR needs a `pr-self-review` PASS first.

---

## 9. Phase 2 — Config/Preview alignment, Stats, Versions

Source: the four additional designs (skill panel tabs Config · Preview · Stats · Versions). Phase 1
is the baseline; this section is self-contained so a separate session can implement it.

### 9.1 Gap analysis (Phase 1 vs design)

| Area | Design | Phase 1 today | Phase 2 |
|------|--------|---------------|---------|
| Panel header | name · type badge · **`vN` badge** · Run on evals | name · type badge · Enabled · Delete | add `vN` badge; move Enabled into the Configuration heading; keep Delete (not in design, needed); Run on evals stays out |
| Tabs | Config · Preview · Evals · Stats · Versions | Config · Preview | add **Stats**, **Versions** (Evals out) |
| Config heading | "Configuration" + `vN` + Enabled toggle | no heading | add as designed |
| Body editor | file header `<name>.md`, **unsaved** badge, **N tokens**, line numbers, markdown highlighting | plain mono textarea | file header + unsaved + tokens + line-number gutter; **no** syntax highlighting (needs an editor dependency) |
| Save | — (not shown) | Save / "Saved (vN)" | add optional **What changed?** note next to Save (§9.4) |
| Preview | "Preview" heading, "Rendered as the reviewing agent receives it.", card | card with the body only | heading + subtitle; render the **exact prompt block** (`### Skill: …` + description + body) |
| Card | name, toggle, description, type, **source** (Manual / Extracted / Community / Imported), **N agents · P% pull · A% accept** | name, toggle, description, type | add source + stats row (`—` when unknown) |

### 9.2 Decisions (agreed)

| Topic | Decision |
|-------|----------|
| Finding → skill attribution | The **model tags** each finding with the skill whose rule produced it: new optional `skill` field in the structured output. The server maps the name to an id using the skills that were in THAT run's prompt; anything else (unknown name, hallucination, no skill) → `null`. |
| Pull frequency | Share of runs: runs whose prompt contained the skill ÷ finished runs of the agents that link it, last 30 days. Recorded per run in a new `run_skills` table. |
| Version note | Optional **What changed?** field on save; empty → auto note from the diff of fields; create / import / restore write their own notes. |
| Extra UI | Body editor chrome, `vN` badges + Configuration heading, Preview heading + exact block, card source + stats — all in. |
| Stats window | Last **30 days** for every time-based metric (`agent_runs.ran_at`, `reviews.created_at`). |
| Donut values | **Counts** of findings per category. The `$52.00` labels in the design are a design typo — no money here. |
| Version snapshot | Full content (name, description, type, body) + note + kind, not body only. |
| Restore | Creates a **new** version with the old content (history is append-only); note `Restored from vN`. |
| Diff | Line diff of the selected version's body against the **current** body (plus name/description/type changes listed above it). |

### 9.3 Data model (migration `0013_*`, via `pnpm db:generate`)

- `skill_versions` — add `name text`, `description text`, `type text`, `note text`,
  `kind text` (`create | edit | import | restore`). All nullable: rows written by Phase 1 have only
  `body`; the UI falls back to the current skill's fields and note `—`.
- `run_skills` (new) — what each run's prompt contained:
  `run_id uuid → agent_runs.id ON DELETE CASCADE`, `skill_id uuid → skills.id ON DELETE CASCADE`,
  `skill_version int not null`, `position int not null`, `tokens int not null`;
  PK `(run_id, skill_id)`, index on `skill_id`.
- `findings.skill_id uuid → skills.id ON DELETE SET NULL`, nullable; index on `skill_id`.
- Index `agent_runs (agent_id, ran_at)` if the 30-day queries need it (check `EXPLAIN` on seed data;
  today only `(pr_id, ran_at)` and `(agent_id)` exist).
- Findings have no timestamp: time filters join `findings → reviews.created_at`.

### 9.4 Behaviour

**Run recording (server, `reviews` module).** After `listEnabledForAgent`, the run writes one
`run_skills` row per skill (version, position, tokens of its rendered block) when the run is
persisted — success and failure paths alike (the prompt was built either way; a pre-work failure
before skills were loaded writes none). The trace keeps `skills_tokens` (= sum).

**Attribution (reviewer-core + server).**
- `Finding.skill: z.string().nullish()` in both `vendor/shared` copies; the structured-output schema
  in reviewer-core gets the optional field.
- `assemblePrompt` adds one line under `## Skills / rules` when skills are present: *"For each
  finding produced by one of these skills, set `skill` to that skill's name exactly; otherwise leave
  it null."* (Not part of `INJECTION_GUARD`; that rule stays untouched.)
- The field must survive grounding, map-reduce reduce and `to-review.ts` normalization (tests).
- On persist: `findings.skill_id = idByName[run's run_skills][finding.skill] ?? null`.
- No retroactive attribution for Phase 1 findings.

**Stats tab** (`GET /skills/:id/stats`, workspace-scoped, window = 30 days):

| Tile / block | Definition | Empty |
|--------------|------------|-------|
| USED BY · N agents | agents with an **enabled** link to the skill (now) | `0 agents` |
| PULL FREQUENCY | `runs with a run_skills row for the skill` ÷ `finished runs (status ≠ running) of agents that link it (any link) now`, in window | `—` when the denominator is 0 |
| ACCEPT RATE (+ ring) | `accepted ÷ (accepted + dismissed)` over findings with this `skill_id`, in window | `—` when nothing was decided |
| FINDINGS (30D) | count of findings with this `skill_id`, in window | `0` |
| Agents using this skill | the USED BY agents, each with **Open** → `/agents/:id?tab=skills` | empty-state line |
| Findings by category | donut + legend: counts per `FindingCategory` (bug, security, perf, style, test), only non-zero | empty-state line |

Card stats come from one batch call `GET /skills/stats` → `[{ skill_id, used_by, pull_rate,
accept_rate }]` (no per-card requests); missing value → `—`.

**Versions tab** (`GET /skills/:id/versions`, newest first):
- Heading "Version history" + `N versions` + subtitle "Every save snapshots the skill so eval runs
  stay reproducible against the exact text they scored."
- Row: `vN`, note (or auto note / `—`), date; the current version shows **Current**, older ones
  **Diff** and **Restore**.
- **Diff** opens a panel/modal: field changes (name / description / type) + a line diff of the body
  vs current. Prefer reusing `components/diff-viewer` by producing unified-diff text; otherwise a
  pure LCS line-diff helper (bodies ≤ 50 000 chars).
- **Restore** (`POST /skills/:id/versions/:version/restore`) → confirm dialog → new version with
  that content, `kind: restore`, note `Restored from vN`; the editor reseeds from the result.

**Notes on save.** `PUT /skills/:id` accepts `note?: string (≤ 200)`. A content change records a
version with `kind: edit` and the note, or, when empty, an auto note built from the changed
fields: `Edited body`, `Renamed to <name>`, `Type: <a> → <b>`, `Edited description` (joined with
`; `). Create → `Created`; import save → `Imported from <source_file>`. Toggling `enabled` records
nothing (unchanged from Phase 1).

**Editor chrome.**
- File header: `<name or "untitled">.md`, **unsaved** badge while dirty, **N tokens** on the right.
- Tokens = the rendered prompt block of the draft, counted by the server tokenizer:
  `POST /skills/tokens { name, description, body } → { tokens }`, debounced ~400 ms; the number
  equals what the skill adds to `skills_tokens`.
- Line-number gutter next to the textarea, scroll-synced; no new UI library.
- Preview renders the same block the prompt gets. The block format lives in
  `server/src/modules/reviews/application/helpers.ts` (`renderSkillBlock`); mirror it in a client
  helper and pin both with the same fixture string in tests so they can't drift.

### 9.5 API additions

| Method | Path | Result |
|--------|------|--------|
| GET | `/skills/stats` | `SkillStatsSummary[]` (cards) |
| GET | `/skills/:id/stats` | `SkillStats` (tiles, agents, categories) |
| GET | `/skills/:id/versions` | `SkillVersion[]` newest first |
| POST | `/skills/:id/versions/:version/restore` | `Skill` (new version) |
| POST | `/skills/tokens` | `{ tokens }` |
| PUT | `/skills/:id` | + optional `note` |

New contracts in `knowledge.ts` (both copies): `SkillStatsSummary`, `SkillStats`, `SkillVersion`
(`version, name?, description?, type?, body, note?, kind?, created_at, current`);
`Finding.skill` in `findings.ts`.

### 9.6 Acceptance criteria (Phase 2)

- **AC17** Config matches the design: `vN` in header and Configuration heading, Enabled in the
  heading, file header with `<name>.md`, **unsaved** while dirty, live **N tokens**, line numbers.
- **AC18** The editor's token count equals the run's `run_skills.tokens` for that skill version.
- **AC19** Preview shows the heading/subtitle and renders exactly the block the agent receives
  (server and client formats pinned by the same fixture).
- **AC20** Every run with skills writes `run_skills` (version, position, tokens); a run without
  enabled skills writes none.
- **AC21** A finding the model tags with a skill from the run is stored with that `skill_id`; an
  unknown or absent name → `null`; the field survives grounding and map-reduce.
- **AC22** Stats tiles follow §9.4 definitions, including `—` / `0` empty states and the 30-day window.
- **AC23** "Agents using this skill" lists enabled-link agents; **Open** goes to their Skills tab.
- **AC24** The donut shows counts per category, non-zero only.
- **AC25** Cards show source and `N agents · P% pull · A% accept` from one batch request.
- **AC26** Every content save, create and import adds a version with a note (typed or auto);
  toggling `enabled` doesn't.
- **AC27** Versions lists newest first with Current; Diff shows field + body changes vs current.
- **AC28** Restore asks for confirmation and creates a new version with the old content; history
  is never rewritten.
- **AC29** Old data still works: Phase 1 version rows (body only), findings and traces without
  `skill` parse and render.
- **AC30** All new strings in `messages/en/*.json`; architecture gate, both contract copies, typecheck,
  lint and tests green.

### 9.7 Implementation plan

1. **Schema + contracts** — migration `0013` (§9.3); contracts (§9.5) in server, then
   `cp -R ../server/src/vendor/shared/. src/vendor/shared/`; `scripts/check-contracts.sh`.
2. **reviewer-core** — optional `skill` in the structured schema and `Finding`; prompt line under
   Skills; tests: field passes through grounding, reduce and `to-review`. Run reviewer-core
   typecheck/tests **and** the server typecheck (CI server-unit triggers).
3. **server: recording** — `reviews` ports: write `run_skills`, map `finding.skill → skill_id` in
   `insertFindings` (a port method or an extra arg; no cross-module import — go through
   `container.skillsRepo`-backed port as in Phase 1). Integration test with MockLLMProvider whose
   structured output tags one known and one unknown skill.
4. **server: versions** — snapshot full content + note/kind in the skills use cases (create,
   update, import save via `source: imported`, restore); auto-note policy in `domain/policies.ts`
   (unit-tested); `GET versions`, `POST restore`.
5. **server: stats** — `SkillStatsReader` port + Drizzle queries (`GET /skills/stats`,
   `GET /skills/:id/stats`), `POST /skills/tokens`; integration tests for every §9.4 definition and
   empty state; update `server/README.md` API map.
6. **client: Config / Preview / cards** — editor chrome (header, unsaved, debounced tokens, gutter),
   headings and badges, note field, Preview block helper (fixture shared with the server test),
   card source + stats (batch hook). Component tests.
7. **client: Stats / Versions tabs** — `PANEL_TABS` + `?tab=stats|versions`; Stats tiles, ring,
   agents list, donut (recharts `Donut` from `@devdigest/ui`); Versions list, Diff view, Restore
   with confirm; hooks in `lib/hooks/skills.ts`. Component + helper tests.
8. **Verify** — migrate + seed locally, one real run of the Test Quality Reviewer on #501 → Stats
   show pull/accept/findings for its skills; edit + restore round-trip in the browser; update
   `docs/skills/README.md` and this spec's status.

### 9.8 Risks & open points (Phase 2)

- **Attribution quality depends on the model.** Cheap models may leave `skill` empty or pick the
  wrong one; stats then undercount. Acceptable; measure on the #501/#502 runs.
- **Pull frequency is ~100 %** until skills are switched per agent or a dynamic selection exists;
  that is the honest number, not a bug.
- **Accept rate needs decisions:** with no accepted/dismissed findings it stays `—`.
- **Denominator drift:** "agents that link it now" means unlinking an agent removes its past runs
  from the denominator — documented, revisit if it confuses users.
- **Editor highlighting** is not included (would need an editor dependency; separate decision).

### 9.9 Implementation record (Phase 2)

- **Schema** — migration `0013_skills_phase2.sql`: `run_skills`, `findings.skill_id` (+ index),
  full snapshot columns on `skill_versions`, index `agent_runs (agent_id, ran_at)` (the old
  `agent_runs_agent_idx` is kept).
- **Contracts** — `Finding.skill`; `SkillVersion`, `SkillVersionKind`, `SkillStatsSummary`,
  `SkillStats`, `SkillStatsAgent`, `SkillCategoryCount`, `SkillTokens` (both copies, check green).
- **reviewer-core** — `renderSkillBlock` and `SKILL_ATTRIBUTION_RULE` moved/added to `prompt.ts`
  and exported; the server's reviews module re-exports the block renderer and the skills module
  uses it for `POST /skills/tokens`, so there is one format. The rule line sits in the user
  message only; `prompt_assembly.skills` stays the skill blocks alone.
- **Server** — `run-agent.ts` records `run_skills` right after loading skills (so failed and
  cancelled runs count), `skills_tokens` is now the sum of the per-skill block counts (= the
  editor counter, AC18), `attributeFindings` keeps a tag only for a skill in that run's prompt.
  Skills module: full snapshots with note/kind (`versionNote`, `creationNote` policies),
  `GET versions`, `POST restore` (`skill_version_not_found` → 404), `SkillStatsReader`
  (`DrizzleSkillStatsReader`, `container.skillStats`), `POST /skills/tokens`;
  `POST /skills` takes `source_file` for the import note.
- **Client** — `BodyEditor` (file header, unsaved, debounced tokens, gutter), Configuration
  heading + `vN` badges, note field, Preview heading + block helper pinned by
  `docs/skills/fixtures/skill-block.fixture.json` (reviewer-core reads the same fixture),
  card source + stats from one batch hook, `StatsTab` (tiles, ring, agents with Open, donut),
  `VersionsTab` (list, Diff modal with an LCS line diff, Restore behind a confirm).
- **Deviations** — the donut is a small SVG in `StatsTab`: `@devdigest/ui` `Donut` formats
  values as `$x.xx` and `vendor/**` is off-limits. The diff uses a pure LCS helper because
  `components/diff-viewer` needs PR file objects. Restore uses `window.confirm` like Delete.
- **Verification** — server 41 files / 283 tests (incl. Postgres integration for every §9.4
  definition, window, empty states, AC18/20/21), reviewer-core 5 / 124, client 42 / 166;
  typecheck, ESLint, architecture gate and contract check green. Browser (local DB, migrated):
  cards, Config chrome, edit with note → v2, Diff, Restore → v3 (`Restored from v1`), Stats
  empty states, Preview.
- **Not done** — the real-LLM run of the Test Quality Reviewer on #501 (step 8) needs a
  provider key and spends tokens; runs before this change have no `run_skills`, so pull rate
  reads 0 % until new runs happen (no backfill, by design).
