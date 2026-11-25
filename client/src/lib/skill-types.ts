/* skill-types.ts — skill type options + badge colors, shared by the Skills page
   and the agent editor's Skills tab. Mirrors the SkillType contract locally
   (a runtime import from @devdigest/shared breaks the Next build). */
import type { SkillType } from "@devdigest/shared";

export const SKILL_TYPES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

export const SKILL_TYPE_COLOR: Record<SkillType, string> = {
  rubric: "var(--accent)",
  convention: "var(--ok)",
  security: "var(--crit)",
  custom: "var(--text-secondary)",
};
