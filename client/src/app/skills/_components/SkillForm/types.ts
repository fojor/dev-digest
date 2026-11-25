import type { SkillType } from "@devdigest/shared";

/** Editable fields of a skill (the editor and the import preview share them). */
export interface SkillDraft {
  name: string;
  description: string;
  type: SkillType;
  body: string;
}
