---
status: draft
feature_size: "S"
tool: "code"
updated_at: "2026-11-26"
---

# Screens — conventions-extractor

> The canonical **screen manifest** — every screen in every state. `tasks` cites these SCR ids +
> states, `implement` builds to them, `review` checks against them. Inputs: [ux-flows](./ux-flows.md)
> (SCR inventory), [spec](./spec.md) §5, [sad](./sad.md) §6 flows 1–8,
> [contract](./contracts/openapi.yaml) error responses, the owner's mockups.

## Source

- **Tool:** code — `docs/design-system.md` does not exist yet (run `/sdd:design-system` to set a
  canon). The component inventory used instead is `client/src/vendor/ui` (`@devdigest/ui`:
  primitives + kit) plus the app's shared `client/src/components` and `lib/toast.tsx`.
- **File:** inline wireframes below.
- **Copy:** every visible string comes from `client/messages/en/conventions.json` (extend it); the
  wireframes show English placeholders only.

## Screens

### SCR-01 — Conventions page (per repo)

Route `/repos/:repoId/conventions`, sidebar SKILLS LAB → Conventions (vendored `nav.ts` entry).

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| loading | list request in flight (flow 3) | `PageContainer`, `Skeleton` (header + 3 cards) | wireframe «loading» |
| empty | `scan` is null — never scanned (AC-07) | `EmptyState` (icon, title, body, action `Button` «Run extraction») | wireframe «empty» |
| empty-none-verified | last run stored 0 candidates and none remain (AC-07) | `EmptyState` with the «no convention could be backed by evidence» body + `Button` «Run extraction» | wireframe «empty» (body variant) |
| default | candidates exist (AC-06) | header: title + repo `MonoLink`, subtitle «Detected from N sample files · last scan X ago», «N of M accepted», `Button` Re-scan, `Button` primary Create skill; list of `CandidateCard` (see below) | wireframe «default» |
| scanning | extraction in flight on this tab, or `scanning` true from another tab (AC-01, AC-04b) | Re-scan `Button` disabled with «Scanning…»; cards read-only (Accept/Reject/edit disabled); Create skill disabled; empty-state action shows «Scanning…» | wireframe «default» (disabled controls) |
| success-no-new | re-scan returned `new_count` 0 with decisions kept (AC-07) | list unchanged + info toast «No new conventions found» (`lib/toast`) | — (toast) |
| error-extraction | extract → 502 `conventions_extraction_failed` (AC-03) | `ErrorState` banner above the list (or inside the empty state) with the reason from `details.reason`; candidates as before | wireframe «error» |
| error-blocked | extract → 409 `conventions_repo_not_indexed` / `conventions_scan_in_progress` (AC-02, AC-04) | same banner with the reason («index the repo first», «nothing to analyse», «a scan is already running») | wireframe «error» |
| error-load | list request failed (network / 5xx) | `ErrorState` full-page with retry («Could not load conventions.») | — |
| not-found | 404 `repo_not_found` (AC-08) | `RepoNotFound` | — (shared component) |

**CandidateCard states** (one card per candidate, flow 4):

| State | Trigger / condition | Components | Source-ref |
|---|---|---|---|
| pending | `status` pending | `Card`; rule text; category `Chip`; `EvidenceSnippet`; `PercentProgress` «NN% confidence»; `Button` Accept, `Button` Reject | wireframe «card» |
| accepted | `status` accepted (AC-09) | `Card` with accent border; `Badge` «Accepted»; Accept button in active (primary) style | wireframe «card» (accepted) |
| rejected | `status` rejected (AC-10) | `Card` dimmed; `Badge` «Rejected»; Reject button in danger style | wireframe «card» (rejected) |
| editing | click on the rule text (AC-11) | `Textarea` with the rule, `Button` Save, `Button` Cancel; counter «n / 1000» | wireframe «card» (editing) |
| validation | empty or > 1000 chars on Save (AC-12) | `FormField` error under the `Textarea`; previous text kept | wireframe «card» (editing) |
| error-change | PATCH → 409 scan in progress / 404 not found (AC-04b, AC-08) | error toast (`lib/toast`); card reverts to its stored state | — (toast) |

```text
loading
+------------------------------------------------------------------+
| ░░░░░░░░░░░░░░░░░░░░░░ (title)                  [░░░░] [░░░░░░] |
| ░░░░░░░░░░░░░░ (subtitle)                                         |
| +--------------------------------------------------------------+ |
| | ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░                       | |
| | ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░             | |
| +--------------------------------------------------------------+ |
|   (×3 skeleton cards)                                            |
+------------------------------------------------------------------+

empty
+------------------------------------------------------------------+
| Conventions in owner/repo                                        |
| Scan the cloned repo to surface house rules — each backed by ... |
|                                                                  |
|                         [ ☰✓ ]                                   |
|                No conventions extracted yet                      |
|     Scan the repo to surface house rules — naming, error         |
|     handling, structure — each backed by evidence ...            |
|                     [ + Run extraction ]                         |
+------------------------------------------------------------------+

default
+------------------------------------------------------------------+
| Conventions in owner/repo           2 of 6 accepted [⟳ Re-scan] [✦ Create skill] |
| Detected from 12 sample files · last scan 19m ago                |
| +--------------------------------------------------------------+ |
| | <rule text>                                  [✓ Accept][✕ Reject]| |
| | (error handling) (✓ Accepted)                                 | |
| | +-----------------------------------------------------------+ | |
| | | client/src/context/AppContext.jsx:25                  [⧉] | | |
| | | toast.error(error.response?.data?.message || …)           | | |
| | +-----------------------------------------------------------+ | |
| | ▓▓▓▓▓▓░░░░ 60% confidence                                     | |
| +--------------------------------------------------------------+ |
+------------------------------------------------------------------+

error (banner above list or inside empty state)
+------------------------------------------------------------------+
| ⚠ Extraction failed — the conventions model did not answer in    |
|   120 seconds. Your candidates are unchanged.          [Retry]   |
+------------------------------------------------------------------+

card — accepted / rejected / editing
+--------------------------------------------------------------+
| <rule text>                  [✓ Accept](primary) [✕ Reject]   |   accepted: accent border, Badge «Accepted»
| (api layer) (✓ Accepted)                                      |
+--------------------------------------------------------------+
+--------------------------------------------------------------+
| <rule text, dimmed>          [✓ Accept] [✕ Reject](danger)    |   rejected: dimmed, Badge «Rejected»
| (api layer) (✕ Rejected)                                      |
+--------------------------------------------------------------+
+--------------------------------------------------------------+
| +----------------------------------------------------------+ |   editing
| | <rule text in a textarea>                                 | |
| +----------------------------------------------------------+ |
| Rule must be 1–1000 characters (validation)    214 / 1000     |
|                                         [Cancel] [Save]       |
+--------------------------------------------------------------+
```

### SCR-02 — Re-scan confirmation dialog

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | Re-scan clicked with ≥ 1 pending candidate (AC-14) | `Modal` (title, body «N pending candidates will be replaced — M of them have edited text that will be lost. Accept a candidate to keep it.», footer `Button` Cancel + `Button` primary Re-scan) | wireframe «default» |
| N/A: loading / empty / error | — | the dialog closes on confirm; scanning, failure and results are SCR-01 states (no state of its own) | — |

```text
+--------------------------------------------------+
| Re-scan conventions?                         [×] |
|--------------------------------------------------|
| 4 pending candidates will be replaced —          |
| 1 of them has edited text that will be lost.     |
| Accept a candidate to keep it.                   |
|--------------------------------------------------|
|                          [Cancel] [⟳ Re-scan]    |
+--------------------------------------------------+
```

### SCR-03 — Create skill from conventions dialog

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| unavailable | 0 accepted candidates (AC-16) | Create skill `Button` disabled on SCR-01 with a tooltip/hint «Accept at least one candidate first» | — (SCR-01 header) |
| loading | refetch of candidates + skills list before opening (flow 7) | Create skill `Button` busy; modal opens when both resolve | — |
| refused-scanning | refetch shows `scanning` (AC-04b) | modal does not open; error toast «A scan is in progress» | — (toast) |
| default-create | no skill with the name (AC-15, AC-18) | `Modal` (title, subtitle «Merged from N accepted conventions in owner/repo. Everything below is editable before you save.»); trust warning (`ErrorState`-style warning box, AC-23); `FormField`+`TextInput` Name* (hint «A slug — lowercase letters, digits and dashes.»); `FormField`+`TextInput` Description*; `FormField`+`Toggle` Enabled (off, hint «Off by default — review the merged body before it reaches an agent's prompt.»); `FormField`+`Textarea` Skill body (Markdown); footer «Saved as v1 · added to Skills Lab», `Button` Cancel, `Button` primary Create skill | wireframe «default» |
| default-update | an extracted skill matches the name, ignoring case/spaces (AC-19) | same + update warning «Updates existing repo-conventions to v4 — v3 stays in its history»; Enabled starts from that skill's state; primary button «Update skill» | wireframe «default» (update) |
| validation | empty name/description/body, non-slug name, over a limit (AC-17) | `FormField` error per field; other input kept | wireframe «default» (field error) |
| blocked-name | only a manual/imported skill has the name (AC-20) | `FormField` error on Name «A skill named … already exists — choose another name» | wireframe «default» (field error) |
| saving | create/update in flight | primary `Button` busy, form disabled | — |
| success | 201 / 200 (AC-18, AC-19) | modal closes; success toast «Saved — find it in Skills Lab» with a link to `/skills` | — (toast) |
| error-save | 422 / 404 / network from the skills API | `ErrorState` banner inside the modal; input kept | wireframe «default» (banner slot) |
| dismissed | Cancel / × / backdrop (AC-21) | modal closes; nothing saved | — |

```text
+------------------------------------------------------------------+
| Create skill from conventions                                [×] |
| Merged from 2 accepted conventions in owner/repo. Everything     |
| below is editable before you save.                               |
|------------------------------------------------------------------|
| ⚠ These rules come from repository content and will become       |
|   instructions for reviewer agents. Check that no rule tells     |
|   agents to skip or ignore a class of problems.                  |
| [ⓘ Updates existing repo-conventions to v4 — v3 stays in history]|  (update only)
|                                                                  |
| Name *                                                           |
| [ repo-conventions                                             ] |
| A slug — lowercase letters, digits and dashes.                   |
| Description *                                                    |
| [ 2 house conventions extracted from owner/repo                ] |
| Enabled                                                          |
| (○ ) Off by default — review the merged body before it reaches   |
|      an agent's prompt.                                          |
| Skill body (Markdown)                                            |
| +--------------------------------------------------------------+ |
| | # repo-conventions                                           | |
| |                                                              | |
| | House conventions detected in this repo. Flag changes that   | |
| | violate any rule below and cite the offending `file:line`.   | |
| |                                                              | |
| | ## api layer                                                 | |
| | HTTP access goes through the shared axios instance …        | |
| | Detected in `client/src/api/index.js:1-1`.                   | |
| |                                                              | |
| | ## error handling                                            | |
| | Errors from API calls are surfaced via toast …              | |
| | Detected in `client/src/context/AppContext.jsx:25-25`.       | |
| +--------------------------------------------------------------+ |
|------------------------------------------------------------------|
| Saved as v1 · added to Skills Lab          [Cancel] [✦ Create skill] |
+------------------------------------------------------------------+
```

### SCR-04 — Skills Lab (existing)

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | the saved conventions skill in the list (AC-18) | existing skill card: type `Badge` «convention», source label «Extracted», global `Toggle` (off for a new skill) — **no change**; the «Extracted» label already exists for `source: extracted` | existing screen |
| N/A: other states | — | unchanged existing screen; this feature adds no state to it | — |

### SCR-05 — Agent page, Skills tab (existing)

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | the conventions skill listed with a checkbox (AC-22) | existing Skills tab — **no change** | existing screen |
| N/A: other states | — | unchanged existing screen | — |

### SCR-06 — Pull request review and its prompt assembly (existing)

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | review run with the skill enabled and linked (AC-22) | existing run trace «Skills (dynamic) · N tokens» block lists the conventions skill — **no change** | existing screen |
| N/A: other states | — | unchanged existing screen | — |

## New components

| Component | Why no existing primitive fits | Registered in design-system |
|---|---|---|
| `NEW: CandidateCard` (feature-local `_components/CandidateCard/`) | composite of `Card` + `Chip` + `Badge` + `PercentProgress` + `Button`s with three status styles and inline edit; no primitive holds that layout | pending — no `docs/design-system.md` yet |
| `NEW: EvidenceSnippet` (feature-local) | a file:line header with a copy `IconBtn` above a monospace code fragment; `Markdown` renders code but has no file header / copy action, `MonoLink` is a single line | pending — no `docs/design-system.md` yet |
