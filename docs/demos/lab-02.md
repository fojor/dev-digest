# Demo: new features of the lab-02 PR

Scenario for the `demo-video` skill (`/demo-video` on branch `lab-02`, or
`/demo-video docs/demos/lab-02.md`). Each `## Video N` section becomes one file in
`demo/lab-02/` (git-ignored): `0N-<name>.mp4`. Lines starting `Caption:` appear on screen.
Steps marked **(changes data)** change the dev DB. The `**Status:**` line under each video is
written by the skill (`scripts/mark.mjs`); a video marked ✅ is skipped unless you ask to re-record it.

Common setup: stack running (`./scripts/dev.sh`), 1440×900, dark theme, repo `acme/payments-api`
selected. Target length: 1–2 min per video.

---

## Video 1 — Skills: reusable rules for reviewer agents

**Status:** ✅ recorded 2026-11-27 · [01-skills.mp4](../../demo/lab-02/01-skills.mp4) · 47 s

**Preconditions:** the skills `boundary-cases` and `api-contract-guard` exist (seed / earlier import).
**Changes data:** nothing (the import is cancelled before Save).

1. Open `/skills`.
   Caption: Skills — reusable review rules that any agent can link to
2. Pause on the list. Hover the `boundary-cases` card (its source label and the
   "agents · pull · accept" row).
   Caption: Each card shows its type, its source and how it performs in reviews
3. Click `boundary-cases`. The side panel opens on **Config**: name, description, body, token count.
   Caption: The description tells the agent when the rules apply
4. Click **Preview** — the skill block exactly as it is added to the prompt.
   Caption: Preview — exactly what the agent will see in its prompt
5. Click **Stats** — runs, pull rate and accept rate over the last 30 days.
   Caption: Stats — how often the skill fires and how often its findings are accepted
6. Click **Versions** — each save with its note, and **Restore**.
   Caption: Every save is a version; Restore brings back an old one as a new version
7. Click **Add Skill** → **Import from file…**. Upload `docs/skills/api-contract-guard.zip`.
   Caption: Import a skill package — .md or .zip in the common SKILL.md layout
8. Pause on the preview: the parsed name/description/body, and `scripts/` + `references/`
   listed as **ignored**.
   Caption: Only text is imported — scripts and extra files are listed and ignored
9. Click **Cancel**.

## Video 2 — API Contract Reviewer with its skills

**Status:** ✅ recorded 2026-11-27 · [02-api-contract-reviewer.mp4](../../demo/lab-02/02-api-contract-reviewer.mp4) · 68 s

**Preconditions:** agent **API Contract Reviewer** exists with 0 skills linked; PR **#502
"Tidy the user lookup route"** in `acme/payments-api`; a model provider key is set in Settings.
**Changes data:** links 4 skills to the agent; adds a review run on PR #502.

1. Open `/agents`.
   Caption: A new reviewer agent — API Contract Reviewer
2. Click the **API Contract Reviewer** card. The **Config** tab shows its model and system prompt.
   Caption: It looks for breaking changes to public contracts
3. Click the **Skills** tab (`0 of 10 enabled`).
   Caption: Its rules come from skills, not from one long prompt
4. Check `breaking-change`, `response-schema`, `deprecation-policy`, `api-contract-guard`
   one by one **(changes data)**. The counter goes to `4 of 10 enabled`.
   Caption: Link the API skills — order matters, earlier skills come first in the prompt
5. Open PR **#502** (`/repos/<acme/payments-api>/pulls/502`).
   Caption: A PR that "just tidies" a route
6. Click **Files changed** and hold on the diff of `src/api/routes/users.ts`
   (renamed route param, renamed response fields).
   Caption: A renamed route param and renamed response fields — easy to miss
7. Click **Run Review** → **API Contract Reviewer** **(changes data)**.
   Caption: Run only the API Contract Reviewer
8. *(off camera)* Wait until the run finishes (up to 3 min).
9. Click **Agent runs**. Hold on the verdict and the findings.
   Caption: It flags the breaking changes the PR description did not mention
10. Click **Open run trace & logs** on the new run → **Prompt assembly** with the skills block
    and its token count.
    Caption: The trace shows which skills went into the prompt and what they cost in tokens

## Video 3 — Conventions extractor

**Status:** ✅ recorded 2026-11-27 · [03-conventions-extractor.mp4](../../demo/lab-02/03-conventions-extractor.mp4) · 53 s

**Preconditions:** repo `fojor/dev-digest` is cloned and has an extraction with pending
candidates (as of today: 14 candidates, 7 accepted); a conventions skill `repo-conventions` exists.
**Changes data:** accepts one pending candidate; updates the `repo-conventions` skill.
**Not filmed:** **Re-scan** — it replaces all pending candidates and calls the LLM. Add it as
an optional step only if you want that on video.

1. Open `/repos/<fojor/dev-digest>/conventions`.
   Caption: Conventions extractor — house rules learned from the code itself
2. Hold on the header: sample size, last scan, `N of M accepted`.
   Caption: One model call over a small, deterministic sample of the repo
3. Scroll through the candidates. Hover the evidence link (`file:lines`) of the first card.
   Caption: Every rule carries evidence — a quote that was verified against the real code
4. Click the evidence link of a candidate — GitHub opens on those exact lines (new tab), then
   come back to the app tab.
   Caption: One click opens those exact lines on GitHub
5. On a pending candidate (`Invalidate related queries on mutation success.`), click
   **Accept** **(changes data)**.
   Caption: The developer accepts, rejects or rewrites each candidate
6. Click **Create skill**. The modal is pre-filled with the accepted rules and warns that the
   existing `repo-conventions` skill will be updated.
   Caption: Accepted rules become one editable conventions skill
7. Click **Update skill** (or the modal's confirm button) **(changes data)**.
8. Open `/skills`, click `repo-conventions` → **Preview**.
   Caption: …and any reviewer agent can link it like any other skill

## Video 4 — pr-self-review: no PR without a passing self-review

**Status:** ✅ recorded 2026-11-27 · [04-pr-self-review.mp4](../../demo/lab-02/04-pr-self-review.mp4) · 22 s

**Preconditions:** none (public GitHub page, read only).
**Note:** the local part — the hook refusing `gh pr create` / `git push` without a PASS
verdict — happens in the terminal and cannot be filmed in a browser. Record it separately
with a screen recorder if needed.

1. Open `https://github.com/fojor/dev-digest/pull/3`.
   Caption: Before a PR is opened, the agent reviews its own diff
2. Scroll to the description section **Self-review**: the PASS line with CRITICAL / WARNING /
   SUGGESTION counts and the skills that reviewed the diff.
   Caption: The verdict is written into the PR: PASS, with counts by severity
3. Open the **Checks** tab and hold on the `pr-self-review` check.
   Caption: In CI, pr-self-review.yml is the single required check
