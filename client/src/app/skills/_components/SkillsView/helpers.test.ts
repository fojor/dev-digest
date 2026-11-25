import { describe, it, expect } from "vitest";
import type { Skill } from "@devdigest/shared";
import { filterSkills, parsePanelTab, resolveSelection } from "./helpers";

const skill = (id: string, name: string, extra: Partial<Skill> = {}): Skill => ({
  id,
  name,
  description: "",
  type: "custom",
  source: "manual",
  body: "b",
  enabled: true,
  version: 1,
  ...extra,
});

describe("SkillsView helpers", () => {
  const skills = [skill("1", "edge-cases", { description: "Flag corner cases" }), skill("2", "api", { type: "security" })];

  it("filters by name, description and type", () => {
    expect(filterSkills(skills, "")).toHaveLength(2);
    expect(filterSkills(skills, "CORNER").map((s) => s.id)).toEqual(["1"]);
    expect(filterSkills(skills, "security").map((s) => s.id)).toEqual(["2"]);
  });

  it("parses the tab param with a config default", () => {
    expect(parsePanelTab("preview")).toBe("preview");
    expect(parsePanelTab("evals")).toBe("config");
    expect(parsePanelTab(null)).toBe("config");
  });

  it("resolves the ?skill= selection", () => {
    expect(resolveSelection(null, skills)).toEqual({ kind: "none" });
    expect(resolveSelection("new", undefined)).toEqual({ kind: "new" });
    expect(resolveSelection("2", skills)).toEqual({ kind: "skill", skill: skills[1] });
    expect(resolveSelection("9", skills)).toEqual({ kind: "missing" });
    expect(resolveSelection("2", undefined)).toEqual({ kind: "none" });
  });
});
