# Skills (M2) — samples and the control experiment

A **skill** is a reusable block of markdown instructions that agents link to.
It is text only: when an agent runs, each of its skills that is linked,
checked for that agent and enabled globally is appended to the prompt's
`## Skills / rules` section, in the order shown on the agent's Skills tab.
Nothing in a skill is ever executed.

- **Skills page** (`/skills`) — list, side panel (Config editor / Preview),
  Add Skill → *Create skill* or *Import from file…*.
- **Agent editor → Skills tab** — check to use a skill, drag (or Alt+↑/↓ on
  the handle) to reorder. Unchecked skills keep their position.
- **Description = interface.** The agent reads the description to decide when
  the rules apply, so phrase it as a directive ("Flag …", "Check that …").

## Usage numbers and history (Phase 2)

Each review run records the skills its prompt contained (`run_skills`) and the model may tag a
finding with the skill that produced it (`findings.skill_id`, kept only for a skill in that
run). The skill panel's **Stats** tab and the card row read these over the last 30 days; runs
made before migration `0013` have no rows, so pull rate starts at 0 %. **Versions** lists
every content save with its note; **Restore** appends a new version. The prompt block format
is pinned by `fixtures/skill-block.fixture.json` (reviewer-core and client tests).

## Import sample: `api-contract-guard`

[`api-contract-guard/`](./api-contract-guard) is a skill package in the common
`SKILL.md` layout, zipped as [`api-contract-guard.zip`](./api-contract-guard.zip).
It deliberately ships a `scripts/check-contract.sh` and a `references/` file:
the import preview lists both as **ignored** (the script flagged *executable —
not run*) and only `SKILL.md` becomes the skill. After the preview, nothing is
stored until you press **Save skill**.

Rebuild the zip after editing the sample:

```bash
cd docs/skills && rm -f api-contract-guard.zip && zip -qr api-contract-guard.zip api-contract-guard -x '*.DS_Store'
```

**Trust.** An imported skill is someone else's instructions inside your
agent's prompt. Read the whole body before saving: a hostile skill can tell
the agent to ignore a class of bugs. Imported skills are saved with
`source: imported`.

## Control experiment

`pnpm db:seed` (server/) adds two PRs to `acme/payments-api`. Their diffs come
from seeded patches, so reviews run without cloning anything. An LLM key is
still needed.

| PR | Agent + skills | Without skills | With skills |
|----|----------------|----------------|-------------|
| #501 *Add refund validation* — four guard branches, one happy-path test | Test Quality Reviewer + `untested-branches`, `boundary-cases` (seeded) | no coverage findings | flags the untested branches (`status`, currency, `<= 0`, over-refund) and the `amountCents === remaining` / `0` boundaries |
| #502 *Tidy the user lookup route* — `:id` → `:userId`, new required `include`, `email` → `emailAddress`, date → epoch | the agent you attach the imported `api-contract-guard` to | the breaking change is missed or under-rated | CRITICAL breaking-change findings per client-visible break |

Steps for each PR:

1. On the agent's **Skills** tab, uncheck all skills → run the review on the PR.
2. Check the skills → run again.
3. Open each run's trace → **Prompt assembly**: the second run shows the
   **Skills** block with `· N tokens`, the first run has no Skills block. The
   Live log also says `Loaded N skill(s): …` vs `No enabled skills`.

LLM output is not deterministic; the seeded prompt for the Test Quality
Reviewer limits itself to plainly broken tests when no skills are linked, so
the difference between the runs comes from the skills.
