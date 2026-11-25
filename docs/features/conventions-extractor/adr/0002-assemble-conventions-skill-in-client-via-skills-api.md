---
status: Accepted
owner: "Oleksii B"
reviewers: ["Tech Lead"]
updated_at: "2026-11-26"
feature_size: "S"
ticket: "conventions-extractor"
---

# 0002 — Assemble the conventions skill in the client via the skills API

- **Status:** Accepted
- **Date:** 2026-11-26
- **Deciders:** Oleksii B (owner), Claude (design pass)

## Context

Accepted candidates become one `convention` skill (spec US-06/US-07). The spec requires: default
name `repo-conventions`; same name + source `extracted` → update as a new version with a warning
and the enabled switch starting from the current state; same name on a manual/imported skill →
block. Today the skills API accepts only `manual | imported` on create and enforces no name
uniqueness. The brief says the extractor must save «through the same mechanism» as other skills.

## Decision drivers

- Reuse the existing skills CRUD, versioning and validation (spec §1; skills spec).
- Keep the conventions module independent of the skills module (onion: no cross-module writes).
- Single local Developer — concurrent writers to the same skill are not a realistic case.

## Considered options

1. **Client assembles the draft and saves through the existing skills routes** — the modal builds the body from accepted candidates, looks up same-name skills from the skills list, then creates (source `extracted`) or updates.
2. **Server assembles and upserts** — a conventions route builds the draft and saves via a new skills-service method behind a port.

## Decision outcome

**Chosen:** Option 1 (owner's choice). The client owns `buildSkillDraft` (pure helper, grouped by
category), the same-name lookup and the block/update decision, and uses the existing skills hooks.
Server changes are limited to the skills capability, as spec §8 defaults to: create accepts
`source: 'extracted'` (version kind `create`; updates stay kind `edit`), create and update accept
`evidence_files` (the accepted candidates' evidence paths), and the list exposes `updated_at`
(latest version time) so the client can pick the most recently updated extracted match (spec
AC-19). General skill validation is unchanged; the slug rule and the required description apply
in the modal only (spec AC-17). The conventions module has no dependency on skills.

## Consequences

**Positive**
- Smallest server surface; the skills module stays the only writer of skills.
- The draft is visible and editable in the modal before anything is sent.

**Negative**
- The block-on-name-clash and update-vs-create rules live only in the client; another client or a direct API call can bypass them (sad.md §11).
- Lookup-then-save is not atomic (acceptable for a single local user).
- «No skill save while scanning» (spec AC-04b) is a client refetch check, not a server refusal.

**Neutral**
- Moving the rules server-side later means adding a skills method and a route; the client helper can be reused as the body builder.

## Links

- Spec: [[../spec.md]] AC-04b, AC-15 – AC-21, §8
- SAD: [[../sad.md]] §4, §6 flow 2, §11
