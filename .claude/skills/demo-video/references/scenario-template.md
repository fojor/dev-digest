<!--
Scenario template for the demo-video skill. Copy to docs/demos/<scenario>.md and replace every
<…> placeholder; delete this comment. Format rules (the scripts depend on them):
- "## Video N — <title>" headings, N = 1, 2, 3… — mark.mjs finds videos by this exact pattern.
- "**Status:** ⏳ not recorded" right under each heading; after that only mark.mjs edits it.
- One numbered step = one action on the screen, named by the visible label (button, tab, link).
- "Caption:" on the line under a step = the on-screen caption (≤ 90 chars, any language).
- "**(changes data)**" after a step that saves, imports, accepts, toggles or runs something.
- "*(off camera)*" for a long wait (LLM run, sync) — cut from the video; caption the next step.
- Never a step in Settings → API keys, secrets or tokens.
Worked example: docs/demos/lab-02.md.
-->
# Demo: <what the demo shows, e.g. "new features of the lab-03 PR">

Scenario for the `demo-video` skill (`/demo-video` on branch `<branch>`, or
`/demo-video docs/demos/<scenario>.md`). Each `## Video N` section becomes one file in
`demo/<scenario>/` (git-ignored): `0N-<name>.mp4`. Lines starting `Caption:` appear on screen.
Steps marked **(changes data)** change the dev DB. The `**Status:**` line under each video is
written by the skill (`scripts/mark.mjs`); a video marked ✅ is skipped unless you ask to re-record it.

Common setup: stack running (`./scripts/dev.sh`), 1440×900, dark theme, repo `<owner/name>`
selected. Target length: 1–2 min per video.

---

## Video 1 — <feature>: <one-line value>

**Status:** ⏳ not recorded

**Preconditions:** <data that must already exist — agents, skills, PRs, repos, extractions — with exact names>.
**Changes data:** <what the recording leaves in the dev DB, or "nothing">.

1. Open `<route, e.g. /skills>`.
   Caption: <what this screen is, in one sentence>
2. <Hover / pause on something the viewer should notice>.
   Caption: <why it matters>
3. Click **<button or tab label>**. <What appears>.
   Caption: <what the viewer sees>
4. Click **<Save / Accept / Run …>** **(changes data)**.
   Caption: <what the action does>
5. *(off camera)* Wait until <the run / sync> finishes (up to <N> min).
6. Click **<tab>**. Hold on <the result>.
   Caption: <the outcome, e.g. "It flags the breaking change the PR did not mention">

## Video 2 — <feature>: <one-line value>

**Status:** ⏳ not recorded

**Preconditions:** <…>
**Changes data:** <…>
**Not filmed:** <optional — a step left out on purpose and why, e.g. a destructive re-scan>.

1. Open `<route>`.
   Caption: <…>
