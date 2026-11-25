import { describe, it, expect } from "vitest";
import { SKILL_TYPES, SKILL_TYPE_COLOR } from "./skill-types";

describe("skill types", () => {
  it("has a color for every type", () => {
    expect(SKILL_TYPES.every((t) => SKILL_TYPE_COLOR[t])).toBe(true);
  });
});
