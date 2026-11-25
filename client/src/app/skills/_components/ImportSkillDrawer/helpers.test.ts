import { describe, it, expect } from "vitest";
import { bytesToBase64 } from "./helpers";

describe("bytesToBase64", () => {
  it("encodes text and binary bytes", () => {
    expect(bytesToBase64(new TextEncoder().encode("# Skill ✓"))).toBe(Buffer.from("# Skill ✓").toString("base64"));
    const big = new Uint8Array(100_000).map((_, i) => i % 256);
    expect(bytesToBase64(big)).toBe(Buffer.from(big).toString("base64"));
  });
});
