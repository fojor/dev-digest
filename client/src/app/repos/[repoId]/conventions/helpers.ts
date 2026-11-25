import type { ConventionCandidate, Skill } from "@devdigest/shared";

/** Default name of the conventions skill (AC-15). */
export const DEFAULT_SKILL_NAME = "repo-conventions";

/** The flag-and-cite instruction that opens every drafted body (AC-15). */
const INSTRUCTION =
  "House conventions detected in this repo. Flag changes that violate any rule below and cite the offending `file:line`.";

export interface SkillDraft {
  name: string;
  description: string;
  body: string;
  /** Unique evidence paths of the accepted candidates, sorted. */
  evidenceFiles: string[];
}

/** Category grouping key: case and spacing differences share one section. */
function categoryKey(category: string): string {
  return category.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Build the skill draft from the repo's candidates (only accepted ones count):
 * one section per category (A–Z), rules by confidence, highest first, each
 * with the file and line range it was detected in. Pure.
 */
export function buildSkillDraft(
  candidates: readonly ConventionCandidate[],
  repoFullName: string,
  name: string = DEFAULT_SKILL_NAME,
): SkillDraft {
  const accepted = candidates
    .filter((c) => c.status === "accepted")
    .sort((a, b) => b.confidence - a.confidence);

  const sections = new Map<string, { label: string; rules: ConventionCandidate[] }>();
  for (const c of accepted) {
    const key = categoryKey(c.category);
    const section = sections.get(key);
    if (section) section.rules.push(c);
    else sections.set(key, { label: key, rules: [c] });
  }

  const lines = [`# ${name}`, "", INSTRUCTION, ""];
  for (const key of [...sections.keys()].sort((a, b) => a.localeCompare(b))) {
    const { label, rules } = sections.get(key)!;
    lines.push(`## ${label}`);
    rules.forEach((c, i) => {
      if (i > 0) lines.push("");
      lines.push(c.rule, `Detected in \`${c.evidence_path}:${c.evidence_start_line}-${c.evidence_end_line}\`.`);
    });
    lines.push("");
  }

  const count = accepted.length;
  return {
    name,
    description: `${count} house ${count === 1 ? "convention" : "conventions"} extracted from ${repoFullName}`,
    body: lines.join("\n"),
    evidenceFiles: [...new Set(accepted.map((c) => c.evidence_path))].sort(),
  };
}

/** Skill-name comparison key: case-insensitive, surrounding spaces ignored. */
export function skillNameKey(name: string): string {
  return name.trim().toLowerCase();
}

/** Missing or unparsable update time sorts as oldest. */
function updatedAt(s: Skill): number {
  const t = s.updated_at ? Date.parse(s.updated_at) : Number.NaN;
  return Number.isNaN(t) ? 0 : t;
}

export type NameMatch =
  | { kind: "free" }
  | { kind: "update"; skill: Skill }
  | { kind: "blocked"; skill: Skill };

/**
 * What saving under `name` would do (AC-19, AC-20): update the most recently
 * updated extracted skill with that name; be blocked by a manual / imported
 * one; otherwise create a new skill.
 */
export function findExtractedMatch(skills: readonly Skill[], name: string): NameMatch {
  const key = skillNameKey(name);
  const same = skills.filter((s) => skillNameKey(s.name) === key);
  const extracted = same
    .filter((s) => s.source === "extracted")
    .sort((a, b) => updatedAt(b) - updatedAt(a));
  if (extracted.length > 0) return { kind: "update", skill: extracted[0]! };
  if (same.length > 0) return { kind: "blocked", skill: same[0]! };
  return { kind: "free" };
}
