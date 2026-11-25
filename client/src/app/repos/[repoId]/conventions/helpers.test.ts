import { describe, it, expect } from "vitest";
import type { ConventionCandidate, Skill } from "@devdigest/shared";
import {
  buildSkillDraft,
  findExtractedMatch,
  DEFAULT_SKILL_NAME,
  skillNameKey,
} from "./helpers";

let n = 0;
const cand = (o: Partial<ConventionCandidate> = {}): ConventionCandidate => {
  n += 1;
  return {
    id: `c${n}`,
    rule: `Rule ${n}`,
    original_rule: `Rule ${n}`,
    category: "api layer",
    evidence_path: "src/api.ts",
    evidence_snippet: "export const api = client;",
    evidence_start_line: 3,
    evidence_end_line: 4,
    confidence: 0.5,
    status: "accepted",
    ...o,
  };
};

const skill = (o: Partial<Skill> = {}): Skill => ({
  id: "s",
  name: "repo-conventions",
  description: "d",
  type: "convention",
  source: "extracted",
  body: "b",
  enabled: true,
  version: 1,
  ...o,
});

describe("buildSkillDraft (AC-15)", () => {
  it("defaults name and description from the accepted count and repo", () => {
    const d = buildSkillDraft([cand(), cand(), cand({ status: "pending" })], "o/r");
    expect(d.name).toBe(DEFAULT_SKILL_NAME);
    expect(d.name).toBe("repo-conventions");
    expect(d.description).toBe("2 house conventions extracted from o/r");
    expect(buildSkillDraft([cand()], "o/r").description).toBe("1 house convention extracted from o/r");
  });

  it("body: heading, flag-and-cite instruction, sections A–Z merged ignoring case/spacing, rules by confidence desc", () => {
    const d = buildSkillDraft(
      [
        cand({ rule: "Low api rule", category: "API  Layer", confidence: 0.2, evidence_path: "a.ts", evidence_start_line: 1, evidence_end_line: 1 }),
        cand({ rule: "High api rule", category: "api layer", confidence: 0.9, evidence_path: "b.ts", evidence_start_line: 5, evidence_end_line: 7 }),
        cand({ rule: "Errors via toast", category: "error handling", confidence: 0.6, evidence_path: "c.ts", evidence_start_line: 25, evidence_end_line: 25 }),
        cand({ rule: "Rejected rule", category: "aaa", status: "rejected" }),
        cand({ rule: "Pending rule", category: "aaa", status: "pending" }),
      ],
      "o/r",
    );
    expect(d.body).toBe(
      [
        "# repo-conventions",
        "",
        "House conventions detected in this repo. Flag changes that violate any rule below and cite the offending `file:line`.",
        "",
        "## api layer",
        "High api rule",
        "Detected in `b.ts:5-7`.",
        "",
        "Low api rule",
        "Detected in `a.ts:1-1`.",
        "",
        "## error handling",
        "Errors via toast",
        "Detected in `c.ts:25-25`.",
        "",
      ].join("\n"),
    );
    expect(d.body).not.toContain("Rejected rule");
    expect(d.body).not.toContain("Pending rule");
  });

  it("evidence files: unique accepted paths, sorted", () => {
    const d = buildSkillDraft(
      [cand({ evidence_path: "b.ts" }), cand({ evidence_path: "a.ts" }), cand({ evidence_path: "b.ts" }), cand({ evidence_path: "z.ts", status: "rejected" })],
      "o/r",
    );
    expect(d.evidenceFiles).toEqual(["a.ts", "b.ts"]);
  });
});

describe("findExtractedMatch (AC-19, AC-20)", () => {
  it("matches ignoring case and surrounding spaces", () => {
    expect(skillNameKey("  Repo-Conventions ")).toBe("repo-conventions");
    const s = skill({ id: "x", name: "Repo-Conventions" });
    expect(findExtractedMatch([s], " repo-conventions ")).toEqual({ kind: "update", skill: s });
  });

  it("an extracted match wins over manual/imported; the most recently updated extracted wins", () => {
    const manual = skill({ id: "m", source: "manual" });
    const older = skill({ id: "old", updated_at: "2026-11-01T00:00:00Z" });
    const newer = skill({ id: "new", updated_at: "2026-11-20T00:00:00Z" });
    expect(findExtractedMatch([manual, older, newer], "repo-conventions")).toEqual({ kind: "update", skill: newer });
  });

  it("a manual or imported-only match blocks; no match is free", () => {
    const imported = skill({ id: "i", source: "imported" });
    expect(findExtractedMatch([imported], "repo-conventions")).toEqual({ kind: "blocked", skill: imported });
    expect(findExtractedMatch([skill({ source: "manual" })], "other-name")).toEqual({ kind: "free" });
    expect(findExtractedMatch([], "repo-conventions")).toEqual({ kind: "free" });
  });
});
