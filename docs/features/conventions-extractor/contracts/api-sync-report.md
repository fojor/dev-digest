# API sync report — conventions-extractor — 2026-11-26

Contract: [openapi.yaml](./openapi.yaml) (OpenAPI 3.1, 6 operations: 3 new, 3 existing skills routes as deltas).
Sources: [data-model.md](../data-model.md) · [sad.md](../sad.md) §6 flows 1–8 · [spec.md](../spec.md) §4/§5 · ADR-0001…0003.
Surface: `target_surfaces: [backend-service, web-frontend]` → HTTP contract; the web frontend consumes it.
No async flows → no `events.md`. Parsed with js-yaml; all 31 `$ref`s resolve. Spectral is not installed in the repo (suggest wiring `npx @stoplight/spectral-cli lint` if contracts multiply).

## Repo conventions followed (deliberate deviations from the skill template)

| Template default | Repo convention used | Evidence |
|---|---|---|
| Global `BearerAuth` | `security: []` — local no-auth provider, workspace resolved server-side | `server/src/adapters/auth/local.ts` `LocalNoAuthProvider`; `modules/_shared/context.ts` |
| Error body `{code, message, details?}` | `{ error: { code, message, details? } }` | `server/src/platform/errors.ts` header, `app.ts` error handler |
| Codes `module.error_name` | flat snake_case (`repo_not_found`, `skill_not_found`) | `platform/errors.ts` `DOMAIN_STATUS` |
| Cursor-paginated lists | plain arrays (≤ 50 candidates per repo by NFR; skills list is an array today) | `GET /skills` returns `Skill[]` |
| Validation 400 | 422 `validation_error` | `app.ts` zod error branch |

## A. Field origins

| schema_path | origin | confidence |
|---|---|---|
| ConventionCandidate.id | data-model.md → conventions.id (uuid PK) | high |
| ConventionCandidate.rule | data-model.md → conventions.rule (1–1000, spec §6) | high |
| ConventionCandidate.original_rule | data-model.md → conventions.original_rule | high |
| ConventionCandidate.category | data-model.md → conventions.category (1–40, spec §6) | high |
| ConventionCandidate.evidence_path | data-model.md → conventions.evidence_path | high |
| ConventionCandidate.evidence_snippet | data-model.md → conventions.evidence_snippet | high |
| ConventionCandidate.evidence_start_line / evidence_end_line | data-model.md → conventions.evidence_start_line / evidence_end_line | high |
| ConventionCandidate.confidence | data-model.md → conventions.confidence (0–1) | high |
| ConventionCandidate.status | data-model.md → conventions.status (pending/accepted/rejected, ADR-0001) | high |
| ConventionScan.scanned_at | data-model.md → repos.conventions_scanned_at | high |
| ConventionScan.sample_count | data-model.md → repos.conventions_sample_count (≤ 12, spec §6) | high |
| ConventionList.scanning | derived — in-process scan guard (ADR-0003), no column | medium |
| ExtractionResult.new_count | derived — candidates stored by this run (AC-07 notice), no column | medium |
| ConventionPatch.status / rule | data-model.md → conventions.status / rule | high |
| Skill.updated_at | derived — max(skill_versions.created_at) (data-model.md «Skills tables unchanged») | medium |
| Skill.evidence_files, CreateSkillBody/UpdateSkillBody.evidence_files | existing schema — `skills.evidence_files` jsonb (0000_init) | high |
| CreateSkillBody.source = extracted | existing schema — `skills.source` enum includes `extracted` | high |

## B. Drift checklist

1. **Endpoint ↔ data-model** (core) — ✓ list/extract read+write `conventions` and `repos` scan facts; patch writes `conventions.status`/`rule`; skills deltas write `skills`.
2. **Error code ↔ repo** (core) — ✓ with accepted proposals. Existing: `repo_not_found`, `skill_not_found`, `validation_error`. **New (to register in `platform/errors.ts` `DOMAIN_STATUS` as conventions `DomainError`s during implement):** `conventions_scan_in_progress` → 409, `conventions_repo_not_indexed` → 409 (`details.reason`: `not_indexed` | `no_sample_files`), `conventions_extraction_failed` → 502 (`details.reason`: `model_unavailable` | `no_credentials` | `timeout` | `unreadable_answer` | `interrupted`), `convention_not_found` → 404.
3. **Validation ↔ constraint** (core) — ✓ with an accepted flag: new `conventions` columns are nullable in the DB (repo pattern) but required in the contract (stricter value taken). Legacy rows (none exist — the table had no writer) would be skipped by the list mapper rather than fail serialization.
4. **OpenAPI ↔ sequence** (supporting) — ✓ every server-side `alt` branch of flows 1, 3, 4, 5, 6 has a response (not found, scan in progress, not indexed / no samples, model failure, validation). Client-only branches have no response by design: AC-14 confirm, AC-16/17/20/21/23 modal rules, AC-04b skill-save refusal (ADR-0002 — client refetch of `scanning`).

### Back-feed coverage

| AC | Operation / response |
|---|---|
| AC-01, AC-05, AC-13, AC-24, AC-03b | extractConventions 200 |
| AC-02 | extractConventions 409 `conventions_repo_not_indexed` |
| AC-03 | extractConventions 502 `conventions_extraction_failed` |
| AC-04 | extractConventions 409 `conventions_scan_in_progress` |
| AC-04b | updateConvention 409; listConventions `scanning` (client blocks skill save) |
| AC-06, AC-07 | listConventions 200 (`scan`, `candidates`); extractConventions `new_count` |
| AC-08 | 404 `repo_not_found` / `convention_not_found` |
| AC-09, AC-10, AC-11 | updateConvention 200 |
| AC-12 | updateConvention 422 |
| AC-14, AC-15, AC-16, AC-17, AC-20, AC-21, AC-23 | client-only (modal / confirm) — data from listConventions + listSkills |
| AC-18 | createSkill 201 (source extracted, evidence_files) |
| AC-19 | listSkills (`updated_at`) + updateSkill 200 |
| AC-22 | existing review run — no contract change |

Every operation maps to a §4 user story (US-01…US-07); no sequence gaps; no upstream OQs raised.

## Resolution log

- 2026-11-26 — owner accepted all three flags (new error codes as proposals, required-vs-nullable, derived `new_count`) and the repo-convention deviations.
