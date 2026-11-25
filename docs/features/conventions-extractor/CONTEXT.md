# Context — conventions-extractor

Feature-scoped glossary. There is no repo-root `CONTEXT.md` yet; these terms are canonical for
this feature and win over looser wording elsewhere in its documents.

## Glossary

### Roles

- **Developer** — the person who runs DevDigest locally in their workspace: connects repos,
  configures reviewer agents and skills, and reviews pull requests. Everything is
  workspace-scoped and there is no separate admin role; every capability below belongs to the
  Developer of the workspace that owns the repo.
- **Reviewer agent** — a configured AI reviewer that reviews pull requests. It receives the skills
  linked to it as instructions. A system actor, never the initiator of a story.

### Domain terms

- **Convention** — a team rule about how code is written in a specific repo (naming, error
  handling, module layout, imports, …) that lives in the code rather than in documentation.
- **Convention candidate** (short: *candidate*) — a convention proposed by an extraction run and
  stored for the Developer's review. Has a rule text, a category, evidence and a confidence, and
  a review *status*: *pending* (not decided yet), *accepted* or *rejected*. Rejected candidates
  stay visible; the status can be changed either way.
- **Category** — a short topic label for a candidate («error handling», «api layer», «ui
  components»), proposed by the model and read-only. The conventions skill groups rules by it.
- **Evidence** — the proof attached to a candidate: the repo-relative path of a file that was
  analysed in the run, a code fragment quoted from that file, and the line range where the
  fragment was found. Evidence is *verified* when the file exists in the repo clone and contains
  the fragment.
- **Confidence** — the model's own 0–100 % estimate that the candidate is a real, consistently
  followed convention. Informational only; it is not a verification result.
- **Extraction run** — one analysis of a repo: collect the sample files and style configs, ask the
  conventions model once, verify the evidence, store the verified candidates.
- **Re-scan** — an extraction run on a repo that already has candidates. It replaces the pending
  candidates and keeps the accepted and rejected ones.
- **Sample files** — the most important source files of a repo by importance rank (tests,
  configs and migrations excluded), as reported by the repo's code index.
- **Style configs** — a fixed allow-list of style/tooling configuration files (lint, compiler,
  formatter, editor settings) read from the repo root.
- **Code index** — DevDigest's per-repo index of files, symbols and importance rank. A repo with
  no index has no sample files.
- **Conventions model** — the provider + model chosen for the «Conventions» feature in Settings
  (feature models).
- **Conventions skill** — a skill of type *convention* and source *extracted*, assembled from the
  accepted candidates of a repo. It belongs to that repo — at most one per repo — and is applied
  only to reviews of that repo's pull requests. Default name `repo-conventions`; created
  disabled. Saving again from the same repo updates it as a new version.
- **Skill** — a reusable markdown rule block linked to reviewer agents and added to their prompt
  as instructions (see `docs/features/skills/spec.md`).
