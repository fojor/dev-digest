# Steps file — `demo/<scenario>/NN-name.steps.json`

The runner (`scripts/record.mjs`) executes a steps file top to bottom in one agent-browser
session. One step = one action. After every action step the runner pauses for
`pace.afterAction` (or the step's own `hold`), so a viewer can follow along.

## File

```json
{
  "title": "Skills — reusable rules for reviewer agents",
  "baseUrl": "http://localhost:3000",
  "viewport": [1440, 900],
  "colorScheme": "dark",
  "start": "/skills",
  "startWaitText": "Add Skill",
  "pace": { "afterAction": 1200, "beforeClick": 600, "caption": 2500 },
  "timeout": 15000,
  "steps": [ ... ]
}
```

| Key | Default | Meaning |
|-----|---------|---------|
| `baseUrl` | `http://localhost:3000` | prefix for relative `open` / `start` paths |
| `viewport` | `[1440, 900]` | video size in CSS pixels |
| `colorScheme` | app default | `dark` or `light` |
| `output` | next to the steps file: `demo/<scenario>/NN-name.mp4` | override only when needed; must stay inside `demo/<scenario>/` |
| `start` | `/` | page opened **before** recording starts (no blank first frames) |
| `startWaitText` | — | text that must be visible before recording starts |
| `pace.afterAction` | 1200 | ms after each action |
| `pace.beforeClick` | 600 | ms the cursor rests on a target before the click |
| `pace.caption` | 2500 | ms a caption step holds the screen |
| `timeout` | 15000 | ms a locator may take to appear (per step: `timeout`) |

## Steps

| Step | Example | Notes |
|------|---------|-------|
| open | `{ "open": "/agents", "waitText": "Agents" }` | full navigation; `waitText` optional but recommended |
| waitText | `{ "waitText": "Saved", "timeout": 30000 }` | substring anywhere on the page |
| waitUrl | `{ "waitUrl": "/conventions" }` | substring/glob of the URL |
| click | `{ "click": { "role": "button", "name": "Add Skill" } }` | hovers first, rests `beforeClick`, then clicks; retries until `timeout` |
| hover | `{ "hover": "boundary-cases" }` | point at something without clicking |
| fill | `{ "fill": { "placeholder": "Search skills…" }, "value": "contract" }` | sets the value at once |
| type | `{ "type": { "placeholder": "Search skills…" }, "value": "contract" }` | clicks, then types with real keystrokes — looks better on video |
| press | `{ "press": "Escape" }` | any key: `Enter`, `Tab`, `Alt+ArrowUp` |
| upload | `{ "upload": "input[aria-label=\"Skill file\"]", "files": ["docs/skills/api-contract-guard.zip"] }` | CSS selector of the (hidden) file input; repo-relative files |
| scroll | `{ "scroll": "down", "px": 500 }` | page scroll |
| scrollTo | `{ "scrollTo": { "text": "Versions" } }` | bring an element into view |
| caption | `{ "caption": "Each skill has its own version history", "hold": 3000 }` | bottom caption bar; stays until the next caption or `captionClear` |
| captionClear | `{ "captionClear": true }` | remove the caption |
| pause | `{ "pause": 2000 }` | let the viewer read |

Any step can also have:
- `"hold": <ms>` — pause after this step instead of `pace.afterAction`;
- `"timeout": <ms>` — how long to wait for its target;
- `"offCamera": true` — the recording stops before this step and restarts after it, so the
  wait is cut from the video (LLM runs, slow syncs). Put a caption **after** such a step to
  explain the jump ("…two minutes later");
- `"sideEffect": true` — the step changes data (Save, Import, Accept, Run Review, a toggle).
  `--dry-run` only checks that its target exists and does **not** act, so a dry run never
  creates duplicates. Steps after it that fail in a dry run are reported as `?` (unverified),
  not as errors. Mark every data-changing step — an unmarked one runs twice (dry run + recording);
- `"label": "…"` — a human name for the step in the runner log.

## Locators

| Form | Means |
|------|-------|
| `"boundary-cases"` | text on the page (substring) |
| `{ "text": "Save", "exact": true }` | exact text |
| `{ "role": "button", "name": "Run Review" }` | ARIA role + accessible name (substring unless `exact`) |
| `{ "label": "Enabled" }` · `{ "placeholder": "Search skills…" }` · `{ "testid": "x" }` · `{ "title": "…" }` · `{ "alt": "…" }` | the matching attribute |
| `{ "css": "input[aria-label=\"Skill file\"]" }` | CSS selector — last resort |

Prefer `role` + `name`, then visible text. Find names with
`AGENT_BROWSER_SESSION=demo-video agent-browser snapshot -i` on the page (run with `--keep-open`).
A text locator that also matches the sidebar (e.g. "Skills") clicks the first match — use a
`role` locator or a more specific text instead.
