import { describe, it, expect } from "vitest";
// The same fixture pins reviewer-core's renderSkillBlock (reviewer-core/test/prompt.test.ts).
import fixture from "../../../../../../docs/skills/fixtures/skill-block.fixture.json";
import { editorFileName, renderSkillBlock, tabsFor, visibleTab } from "./helpers";

describe("renderSkillBlock (shared fixture)", () => {
  it("has cases", () => expect(fixture.cases.length).toBeGreaterThan(0));
  it.each(fixture.cases)("renders $input.name exactly like the server", ({ input, expected }) => {
    expect(renderSkillBlock(input)).toBe(expected);
  });
});

describe("editorFileName", () => {
  it("names the file after the skill, untitled when blank", () => {
    expect(editorFileName("edge-cases")).toBe("edge-cases.md");
    expect(editorFileName("  ")).toBe("untitled.md");
  });
});

describe("panel tabs", () => {
  it("offers Stats and Versions only for a saved skill", () => {
    expect(tabsFor(true).map((t) => t.key)).toEqual(["config", "preview", "stats", "versions"]);
    expect(tabsFor(false).map((t) => t.key)).toEqual(["config", "preview"]);
    expect(visibleTab("stats", false)).toBe("config");
    expect(visibleTab("versions", true)).toBe("versions");
  });
});
