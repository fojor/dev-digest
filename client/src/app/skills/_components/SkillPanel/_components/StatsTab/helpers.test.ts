import { describe, it, expect } from "vitest";
import { acceptScore, donutArcs } from "./helpers";

describe("donutArcs", () => {
  it("drops zero counts and splits the circle by count, biggest first", () => {
    const arcs = donutArcs(
      [
        { category: "style", count: 1 },
        { category: "bug", count: 3 },
        { category: "perf", count: 0 },
      ],
      100,
    );
    expect(arcs.map((a) => [a.category, a.count, a.length, a.offset])).toEqual([
      ["bug", 3, 75, -0],
      ["style", 1, 25, -75],
    ]);
  });
  it("is empty when there is nothing to draw", () => {
    expect(donutArcs([], 100)).toEqual([]);
    expect(donutArcs([{ category: "bug", count: 0 }], 100)).toEqual([]);
  });
});

describe("acceptScore", () => {
  it("maps a rate to a whole percent, null stays null", () => {
    expect(acceptScore(0.666)).toBe(67);
    expect(acceptScore(null)).toBeNull();
  });
});
