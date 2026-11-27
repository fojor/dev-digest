import { PANEL_TABS, type PanelTab } from "./constants";
import type { SkillDraft } from "../SkillForm";

/**
 * One skill as the reviewing agent receives it in the prompt's
 * "Skills / rules" section. Mirrors reviewer-core `renderSkillBlock`; both are
 * pinned by docs/skills/fixtures/skill-block.fixture.json so they can't drift.
 */
export function renderSkillBlock(skill: Pick<SkillDraft, "name" | "description" | "body">): string {
  const desc = skill.description.trim() ? `\n_${skill.description.trim()}_` : "";
  return `### Skill: ${skill.name}${desc}\n\n${skill.body.trim()}`;
}

/** File name shown in the body editor's header. */
export function editorFileName(name: string): string {
  return `${name.trim() || "untitled"}.md`;
}

/** Tabs available for a saved skill vs the create form. */
export function tabsFor(hasSkill: boolean) {
  return PANEL_TABS.filter((tb) => hasSkill || !tb.needsSkill);
}

/** The tab to show: a skill-only tab on the create form falls back to Config. */
export function visibleTab(tab: PanelTab, hasSkill: boolean): PanelTab {
  return tabsFor(hasSkill).some((tb) => tb.key === tab) ? tab : "config";
}
