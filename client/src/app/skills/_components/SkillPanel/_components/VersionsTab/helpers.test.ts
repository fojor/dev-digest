import { describe, it, expect } from "vitest";
import type { Skill, SkillVersion } from "@devdigest/shared";
import { fieldChanges, isUnchanged, lineDiff } from "./helpers";

const kinds = (from: string, to: string) => lineDiff(from, to).map((l) => `${l.kind[0]}:${l.text}`);

describe("lineDiff", () => {
  it("marks removed and added lines between unchanged ones", () => {
    expect(kinds("a\nb\nc", "a\nB\nc\nd")).toEqual(["s:a", "d:b", "a:B", "s:c", "a:d"]);
  });
  it("keeps moved blocks as the longest common subsequence", () => {
    expect(kinds("x\na\nb", "a\nb\nx")).toEqual(["d:x", "s:a", "s:b", "a:x"]);
  });
  it("identical bodies have no changes", () => {
    expect(isUnchanged(lineDiff("a\nb", "a\nb"))).toBe(true);
    expect(isUnchanged(lineDiff("a", "b"))).toBe(false);
  });
  it("handles a 50 000-char body without blowing up", () => {
    const big = Array.from({ length: 5000 }, (_, i) => `line ${i}`).join("\n");
    const lines = lineDiff(big, big.replace("line 2500", "changed"));
    expect(lines.filter((l) => l.kind !== "same").map((l) => l.text)).toEqual(["line 2500", "changed"]);
  });
});

describe("fieldChanges", () => {
  const current: Skill = {
    id: "s1",
    name: "edge-cases",
    description: "Flag corners.",
    type: "rubric",
    source: "manual",
    body: "b",
    enabled: true,
    version: 3,
  };
  const v = (over: Partial<SkillVersion>): SkillVersion => ({
    version: 1,
    body: "b",
    created_at: "2026-11-01T00:00:00Z",
    current: false,
    ...over,
  });

  it("lists name / description / type that differ from the current skill", () => {
    expect(fieldChanges(v({ name: "old-name", description: "Flag corners.", type: "custom" }), current)).toEqual([
      { field: "name", from: "old-name", to: "edge-cases" },
      { field: "type", from: "custom", to: "rubric" },
    ]);
  });
  it("ignores fields a Phase 1 row never recorded (null)", () => {
    expect(fieldChanges(v({ name: null, description: null, type: null }), current)).toEqual([]);
  });
});
