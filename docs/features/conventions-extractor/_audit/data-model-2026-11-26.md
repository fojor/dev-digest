# Audit — data-model — conventions-extractor — 2026-11-26

**Migrations are staged — not yet in the live `server/src/db/migrations/` tree; `implement` promotes them.**

## Staged files

| Ordinal | Up | Down |
|---|---|---|
| 01 expand | `migrations/01_expand_conventions_review_status.up.sql` | `.down.sql` |
| 02 backfill | `migrations/02_backfill_conventions_status.up.sql` | `.down.sql` |
| 03 contract | `migrations/03_contract_conventions_accepted.up.sql` | `.down.sql` |

## Promote-time hint

Drizzle-kit, sequential tags: last live is `0013_skills_phase2` (journal idx 13) → next ≈ `0014_<generated-name>`
(`implement` gets the real one from `pnpm db:generate`; another feature may land 0014 first).
Promotion path: edit `server/src/db/schema/knowledge.ts` (`status` text enum + new columns + two indexes, drop `accepted`)
and `server/src/db/schema/repos.ts` (two scan columns) → `pnpm db:generate` → compare with 01 + 03 → hand-insert the 02
backfill between the ADD and DROP statements of the generated file → keep the drizzle snapshot untouched.

## Verification

Throwaway `pgvector/pgvector:pg16` container (not the `devdigest_pgdata` volume): live 0000–0013 applied, then 01→02→03 up
with two seeded rows (accepted true/false) → `status` accepted/pending and `original_rule` = `rule`; 03→02→01 down restored
`accepted` t/f; each up file applied twice without error. ER diagram parsed by mermaid 11 under jsdom.

## Self-check (4 mandatory)

| Check | Result |
|---|---|
| Naming matches repo | pass — snake_case, `<table>_<cols>_idx`, drizzle `--> statement-breakpoint` |
| Down reversibility | pass — every ADD COLUMN / CREATE INDEX has its DROP; 03 down re-adds `accepted`, 02 down restores it |
| FK indexes | pass — `conventions.repo_id` covered by `conventions_repo_status_idx` (leading column), `conventions.workspace_id` by `conventions_ws_idx`; both were missing before |
| Convention adherence | pass, with the deviations below |

## Convention deviations (deliberate, flagged)

- `IF NOT EXISTS` / `IF EXISTS` in staged SQL — drizzle-generated files don't use them; the promoted file will be drizzle's own output.
- `.down.sql` files — the repo keeps no down migrations; provided for review and manual rollback only.
- ADR-0001 says status is «constrained to the three values» — implemented app-level (Drizzle text enum + Zod) because the repo uses no DB CHECK constraints anywhere.
- New `category` / evidence-line / `original_rule` columns are nullable (repo pattern for `conventions` evidence columns); the contract requires them for rows the extractor writes.

## Breaking-change decomposition

`accepted` → `status`: expand (01) → backfill (02) → contract (03). Single local process, so collapsing all three into one
promoted migration is safe; the split exists for review.

## Drift

None between `server/src/db/schema/knowledge.ts` / `repos.ts` and the live SQL today. Planned drift until `implement`:
contract `ConventionCandidate.accepted` → `status` (+ `category`, `evidence_start_line`, `evidence_end_line`, `original_rule`)
in both vendored copies, `Skill.updated_at` (derived, no column). No `_drift/` fixes needed.

## TBD

None.

Next stage: `/sdd:api conventions-extractor` (contract changes exist — new routes and changed `ConventionCandidate` / `Skill`).
