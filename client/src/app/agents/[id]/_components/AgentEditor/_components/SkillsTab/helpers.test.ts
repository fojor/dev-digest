import { describe, it, expect } from "vitest";
import type { AgentSkillLink, Skill } from "@devdigest/shared";
import { filterRows, mergeRows, moveRow, toPayload, toggleRow } from "./helpers";

const skill = (id: string, name: string, type: Skill["type"] = "custom"): Skill => ({
  id,
  name,
  description: "",
  type,
  source: "manual",
  body: "b",
  enabled: true,
  version: 1,
});
const link = (skill_id: string, order: number, enabled = true): AgentSkillLink => ({
  agent_id: "a",
  skill_id,
  order,
  enabled,
});

describe("SkillsTab helpers", () => {
  const skills = [skill("z", "zeta"), skill("a", "alpha", "security"), skill("m", "mid"), skill("b", "beta")];

  it("lists linked skills in link order, then the rest by name, unchecked", () => {
    const rows = mergeRows(skills, [link("m", 1, false), link("z", 0), link("gone", 2)]);
    expect(rows.map((r) => [r.skill.id, r.checked])).toEqual([
      ["z", true],
      ["m", false],
      ["a", false],
      ["b", false],
    ]);
  });

  it("moves rows with clamping and builds the ordered payload", () => {
    const rows = mergeRows(skills, []);
    const moved = moveRow(rows, 3, 0);
    expect(moved.map((r) => r.skill.id)).toEqual(["z", "a", "b", "m"]);
    expect(moveRow(rows, 0, 99).map((r) => r.skill.id)).toEqual(["b", "m", "z", "a"]);
    expect(moveRow(rows, 1, 1)).toBe(rows);
    expect(toPayload(toggleRow(moved, "a"))).toEqual([
      { skill_id: "z", enabled: false },
      { skill_id: "a", enabled: true },
      { skill_id: "b", enabled: false },
      { skill_id: "m", enabled: false },
    ]);
  });

  it("filters by name or type", () => {
    const rows = mergeRows(skills, []);
    expect(filterRows(rows, "SEC").map((r) => r.skill.id)).toEqual(["a"]);
    expect(filterRows(rows, " ")).toBe(rows);
  });
});
