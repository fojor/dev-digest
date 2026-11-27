import { describe, it, expect } from "vitest";
import { lineNumbers } from "./helpers";

describe("lineNumbers", () => {
  it("numbers every line, including a trailing empty one", () => {
    expect(lineNumbers("")).toEqual([1]);
    expect(lineNumbers("a\nb")).toEqual([1, 2]);
    expect(lineNumbers("a\n")).toEqual([1, 2]);
  });
});
