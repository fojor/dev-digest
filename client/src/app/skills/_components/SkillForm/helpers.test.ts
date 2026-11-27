import { describe, it, expect } from "vitest";
import { EMPTY_DRAFT, draftFrom, isDirty, isDraftValid } from "./helpers";

describe("SkillForm helpers", () => {
  it("requires a name and a body", () => {
    expect(isDraftValid(EMPTY_DRAFT)).toBe(false);
    expect(isDraftValid({ ...EMPTY_DRAFT, name: "a", body: "  " })).toBe(false);
    expect(isDraftValid({ ...EMPTY_DRAFT, name: "a", body: "b" })).toBe(true);
  });

  it("detects edits against the saved skill", () => {
    const saved = draftFrom({ name: "a", description: "d", type: "rubric", body: "b" });
    expect(isDirty(saved, saved)).toBe(false);
    expect(isDirty({ ...saved, body: "b2" }, saved)).toBe(true);
  });
});
