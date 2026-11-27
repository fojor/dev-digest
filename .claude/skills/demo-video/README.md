# demo-video — how to use it

Turns a written scenario into demo videos of the DevDigest web app. Claude drives a separate,
headless Chrome through the app, pauses so a viewer can follow, shows captions and highlights
every click, and saves one `.mp4` per video.

## In short

1. **Get a scenario** at `docs/demos/<branch>.md` — the name of the branch with your changes,
   `/` replaced by `-` (branch `feat/skills` → `docs/demos/feat-skills.md`). Either:
   - ask Claude in plain words: *"/demo-video draft a demo of the conventions page: accept a
     rule and turn it into a skill"* or *"/demo-video draft a scenario for this branch"*.
     Claude checks the real pages and data, writes the file (or adds videos to an existing
     one) and stops so you can review it — nothing is recorded until you say so;
   - or write it yourself from the template
     [references/scenario-template.md](references/scenario-template.md) (worked example:
     [docs/demos/lab-02.md](../../../docs/demos/lab-02.md)).
2. **Start the app**: `./scripts/dev.sh` (or ask Claude to start it).
3. **Run the skill** on that branch: `/demo-video`. Only some videos: `/demo-video 2 3`.
   Another scenario: `/demo-video docs/demos/<name>.md`.
4. **Get the videos** in `demo/<branch>/` (git-ignored). Claude sends each one in the chat and
   marks it in the scenario: `**Status:** ✅ recorded 2026-11-27 · [01-skills.mp4](…) · 47 s`.

## Writing a scenario

```markdown
## Video 2 — API Contract Reviewer with its skills

**Preconditions:** agent API Contract Reviewer exists with 0 skills; PR #502 exists.
**Changes data:** links 4 skills to the agent; adds a review run.

1. Open `/agents`.
   Caption: A new reviewer agent — API Contract Reviewer
2. Click the **API Contract Reviewer** card.
3. Click **Run Review** → **API Contract Reviewer** **(changes data)**.
4. *(off camera)* Wait until the run finishes.
```

- One `## Video N — title` section = one video, about 1–2 minutes.
- One numbered step = one action, in plain words, using the names on the buttons.
- `Caption:` — text shown at the bottom of the screen during that step.
- **Preconditions** — what must already be in the database. Claude checks them and asks you
  before deleting or resetting anything.
- **(changes data)** — the step saves, imports, accepts or runs something. Claude does not
  perform such steps during its test pass, only in the real recording.
- *(off camera)* — a long wait (an LLM review takes 30 s – 3 min) that is cut from the video.
- Leave the `**Status:**` lines to Claude. To re-record a ✅ video, ask for it by number.

## Good to know

- Recording uses your local dev database, so data-changing steps really happen (skills get
  linked, conventions accepted, review runs added). Claude lists the changes at the end.
- Steps that call an LLM need a provider key in Settings. The Settings key fields are never filmed.
- Terminal-only things (for example the PR gate refusing `gh pr create`) cannot be filmed —
  the skill records the browser only.
- Files in `demo/<branch>/`: `NN-name.mp4` (the video), `NN-name.sheet.png` (a frame every
  3 s for a quick look), `NN-name.steps.json` (the compiled steps; re-run without Claude:
  `node .claude/skills/demo-video/scripts/record.mjs demo/<branch>/NN-name.steps.json`).
- Watch the browser while it records: add `--headed` to that command.
