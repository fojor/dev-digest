import type { Skill } from "@devdigest/shared";
import type { SkillDraft } from "./types";

export const EMPTY_DRAFT: SkillDraft = { name: "", description: "", type: "custom", body: "" };

export function draftFrom(skill: Pick<Skill, "name" | "description" | "type" | "body">): SkillDraft {
  return { name: skill.name, description: skill.description, type: skill.type, body: skill.body };
}

/** Name and body are required (the API rejects blanks too). */
export function isDraftValid(d: SkillDraft): boolean {
  return d.name.trim().length > 0 && d.body.trim().length > 0;
}

/** True when the draft differs from the saved skill. */
export function isDirty(d: SkillDraft, saved: SkillDraft): boolean {
  return (
    d.name !== saved.name || d.description !== saved.description || d.type !== saved.type || d.body !== saved.body
  );
}
