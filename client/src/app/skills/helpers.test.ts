import { describe, it, expect } from "vitest";
import { formatRate } from "./helpers";

describe("formatRate", () => {
  it("rounds a 0..1 rate to a percent", () => {
    expect(formatRate(0)).toBe("0%");
    expect(formatRate(0.625)).toBe("63%");
    expect(formatRate(1)).toBe("100%");
  });
  it("renders missing data as a dash", () => {
    expect(formatRate(null)).toBe("—");
    expect(formatRate(undefined)).toBe("—");
  });
});
