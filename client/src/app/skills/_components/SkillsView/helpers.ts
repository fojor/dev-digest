import type { Skill } from "@devdigest/shared";
import { PANEL_TABS, type PanelTab } from "../SkillPanel";

/** Case-insensitive match on name, description and type. */
export function filterSkills(skills: Skill[], query: string): Skill[] {
  const q = query.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter(
    (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || s.type.includes(q),
  );
}

/** `?tab=` → a known panel tab (default config). */
export function parsePanelTab(raw: string | null): PanelTab {
  return PANEL_TABS.some((t) => t.key === raw) ? (raw as PanelTab) : "config";
}

/** What the side panel shows for `?skill=`: nothing, the create form, a skill, or a missing id. */
export type Selection =
  | { kind: "none" }
  | { kind: "new" }
  | { kind: "skill"; skill: Skill }
  | { kind: "missing" };

export function resolveSelection(param: string | null, skills: Skill[] | undefined): Selection {
  if (!param) return { kind: "none" };
  if (param === "new") return { kind: "new" };
  if (!skills) return { kind: "none" };
  const skill = skills.find((s) => s.id === param);
  return skill ? { kind: "skill", skill } : { kind: "missing" };
}
