import type { AgentSkillLink, Skill } from "@devdigest/shared";

/** One row of the agent's Skills tab: a workspace skill and its checkbox. */
export interface SkillRow {
  skill: Skill;
  /** Linked and enabled for this agent (reaches the prompt if the skill is on globally). */
  checked: boolean;
}

/**
 * Every workspace skill as a row: linked skills first in link order (with the
 * link's enabled flag), then never-linked skills by name, unchecked.
 */
export function mergeRows(skills: Skill[], links: AgentSkillLink[]): SkillRow[] {
  const byId = new Map(skills.map((s) => [s.id, s]));
  const linked = [...links]
    .sort((a, b) => a.order - b.order)
    .flatMap((l) => {
      const skill = byId.get(l.skill_id);
      return skill ? [{ skill, checked: l.enabled }] : [];
    });
  const linkedIds = new Set(linked.map((r) => r.skill.id));
  const rest = skills
    .filter((s) => !linkedIds.has(s.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((skill) => ({ skill, checked: false }));
  return [...linked, ...rest];
}

/** Move the row at `from` to `to` (both clamped). Returns a new array. */
export function moveRow<T>(rows: T[], from: number, to: number): T[] {
  const target = Math.max(0, Math.min(rows.length - 1, to));
  if (from === target || from < 0 || from >= rows.length) return rows;
  const next = [...rows];
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item!);
  return next;
}

export function toggleRow(rows: SkillRow[], skillId: string): SkillRow[] {
  return rows.map((r) => (r.skill.id === skillId ? { ...r, checked: !r.checked } : r));
}

/** The whole ordered set for POST /agents/:id/skills (unchecked rows keep their place). */
export function toPayload(rows: SkillRow[]): { skill_id: string; enabled: boolean }[] {
  return rows.map((r) => ({ skill_id: r.skill.id, enabled: r.checked }));
}

export function filterRows(rows: SkillRow[], query: string): SkillRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => r.skill.name.toLowerCase().includes(q) || r.skill.type.includes(q));
}
