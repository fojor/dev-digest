---
name: demo-video
description: Records demo videos of the DevDigest web app from a scenario, and drafts that scenario from a plain prompt or the branch's changes when there is none. The scenario lives in docs/demos/<branch>.md (named after the git branch with the changes); each "## Video N" becomes a steps file run by agent-browser in its own Chrome session with paced pauses, captions and click ripples, saved as an .mp4 in demo/<branch>/ (git-ignored), and its status is written back into the scenario. Use when the user wants a demo, walkthrough or screen recording of a feature, or gives a scenario to record.
when_to_use: Triggers - "record a demo", "make a demo video", "record this scenario", "walkthrough video", "draft a demo scenario", "/demo-video", "напиши сценарій демо", "запиши демо", "зроби відео", "відео демонстрації фічі", a docs/demos/*.md scenario file.
argument-hint: "[scenario file] [video numbers] | draft <what to demo>"
---

# demo-video

Scenario `docs/demos/<scenario>.md` → steps `demo/<scenario>/NN-name.steps.json` → dry run →
recording `demo/<scenario>/NN-name.mp4` (+ `.sheet.png`) → check → status written back into the
scenario → video sent to the user.

Scripts (`D=.claude/skills/demo-video/scripts`):
- `node $D/record.mjs <steps.json> [--dry-run] [--headed] [--keep-open]` — runs / records one video;
- `node $D/mark.mjs <scenario.md> <N> recorded <mp4> | failed "<reason>" | pending` — status line;
  `node $D/mark.mjs <scenario.md> --list` — what is done.

Step schema and locators: [references/steps.md](references/steps.md). How a human works with
the skill: [README.md](README.md). Scenario template: [references/scenario-template.md](references/scenario-template.md);
worked example: [docs/demos/lab-02.md](../../../docs/demos/lab-02.md).

## 1. Names and layout
- `<scenario>` = the current branch, `/` → `-`: `git branch --show-current | tr '/' '-'`
  (branch `feat/skills` → `docs/demos/feat-skills.md`, `demo/feat-skills/`).
- No argument → use `docs/demos/<scenario>.md` for the current branch. A file argument wins
  over the branch; its basename is `<scenario>`.
- The scenario file does not exist, or the user describes a demo in words instead of giving a
  file → draft it first (section 1a); do not record until the user has reviewed the draft.
- Files per video `N` with a short slug from its heading: `demo/<scenario>/0N-<slug>.steps.json`,
  `.mp4`, `.sheet.png`, `.failed.png` (only after a failure).

## 1a. Draft a scenario from a prompt
Input: a plain request ("a demo of the conventions page: accept a rule and turn it into a
skill"), or nothing but the branch ("draft a scenario for this branch").
- Where: `docs/demos/<scenario>.md` for the current branch. It exists → add new `## Video N`
  sections after the last one (never renumber or rewrite existing videos, never touch their
  status lines). The user names a file or topic → `docs/demos/<that-name>.md`.
- Start from [references/scenario-template.md](references/scenario-template.md) (format rules
  in its header comment); copy the tone and density of the lab-02 example.
- What to show: the prompt; without one, the branch's changes —
  `git log --oneline main..HEAD`, `git diff --stat main...HEAD`, `docs/features/*/spec.md`.
  One user-visible feature = one video, 6–12 steps, ~1–2 min.
- Ground every step in the real app, not in guesses:
  routes from `client/src/app/**/page.tsx`; labels of buttons, tabs and dialogs from a real
  page (`agent-browser open` + `snapshot -i`, as in section 4) or from the i18n messages (`client/messages/en/`);
  names in **Preconditions** from real data (`GET /repos`, `/agents`, `/skills`, PRs). A
  precondition that the dev DB does not meet → say so in the draft and in chat.
- Mark every data-changing step **(changes data)** and sum them up in **Changes data:**; a
  destructive or LLM-heavy step the prompt did not ask for → leave it out under **Not filmed:**.
  LLM waits → a separate *(off camera)* step. Terminal-only behaviour → a **Note:** (not filmable).
- Captions: ≤ 90 chars, say why it matters, not what is clicked; in the user's language if
  they asked for one, else English. The rest of the file is English.
- New videos get `**Status:** ⏳ not recorded`; check with `node $D/mark.mjs <file> --list`.
- Then stop: give the path, one line per video (title, step count, what it changes) and the
  unmet preconditions, and ask the user to review or edit. Record only after their go-ahead.

## 2. What to record
- `node $D/mark.mjs <scenario.md> --list` first. Record the videos the user named; with no
  numbers — every video not marked ✅. Re-record a ✅ video only when asked.
- A scenario step is a plain sentence: what to click / type and what the viewer should see.
  `Caption:` lines are the on-screen captions; keep their language.
- A step whose effect on data is unclear (delete, overwrite, re-scan) → ask before recording.

## 3. Preflight
- Stack up: `curl -sf localhost:3000 >/dev/null && curl -s localhost:3001/repos >/dev/null`.
  Down → `./scripts/dev.sh --db-only`, then preview_start `server` and `client`
  (.claude/launch.json). Never `docker compose down -v`.
- `agent-browser`, `ffmpeg` on PATH (the runner checks too).
- LLM steps (Run Review, Run extraction) need a provider key in Settings; on a key error stop
  and tell the user — never open or film the key fields.
- Check each video's **Preconditions** against real data (`GET /repos`, `/agents`, `/skills`).
  One that needs deleting or resetting data is the user's call: report it and ask.

## 4. Compile a video to its steps file
- Resolve ids now: repo ids from `GET /repos` (`full_name`), agent ids from `GET /agents`;
  PR pages are `/repos/<repoId>/pulls/<number>`.
- `start` + `startWaitText` = a ready first page; the first step is a caption with the title.
- Locators from a real page: `AGENT_BROWSER_SESSION=demo-video agent-browser open <url>`, then
  `AGENT_BROWSER_SESSION=demo-video agent-browser snapshot -i`. Use `role`+`name` or exact text.
  Sidebar links share names with tabs ("Skills", "Agents") → `{ "role": "link" }` for the
  sidebar, `{ "role": "button", "exact": true }` for tabs.
- Every data-changing step gets `"sideEffect": true` (Save, Import, Accept/Reject, toggles,
  checkboxes, Run Review, Create skill) — otherwise the dry run performs it too.
- LLM waits (30 s – 3 min) → `waitText` with `"offCamera": true`, `"timeout": 180000`, then a
  caption explaining the cut.
- Pace: `hold` 3000–5000 on screens to read; captions ≤ 90 chars; ~1–2 min per video.
- Never film Settings → API keys, `~/.devdigest/secrets.json` or tokens.

## 5. Dry run → record → check → mark
1. `node $D/record.mjs demo/<scenario>/0N-<slug>.steps.json --dry-run`.
   `✗` = real failure → fix the locator (`--keep-open`, then `snapshot -i`). `?` = depends on a
   skipped side effect; acceptable when its locator came from a real snapshot.
2. `node $D/record.mjs demo/<scenario>/0N-<slug>.steps.json` (background if it has offCamera
   waits). Failure → read `0N-<slug>.failed.png`, fix, tell the user what the attempt already
   changed in the DB (side effects up to the failed step ran), and
   `node $D/mark.mjs <scenario.md> N failed "step K: <what>"`.
3. Read `0N-<slug>.sheet.png` (a frame every 3 s): no error pages, empty lists or unreadable
   captions. Only then `node $D/mark.mjs <scenario.md> N recorded demo/<scenario>/0N-<slug>.mp4`
   and send the .mp4 with SendUserFile (`display: "render"`).
4. All videos of the scenario recorded and the user wants one file → concat in order:
   `ffmpeg -f concat -safe 0 -i list.txt -c copy demo/<scenario>/all.mp4`.

## 6. Rules
- `demo/` is git-ignored: videos, steps files, sheets. The scenario in `docs/demos/` is tracked
  and written in English (captions may be in any language).
- The status line in the scenario is written only by `mark.mjs`, only after step 5.3.
- One agent-browser session `demo-video`; the runner closes it (`--keep-open` to debug).
- At the end list what the recordings changed in the dev DB (imported or linked skills,
  accepted conventions, new review runs).
