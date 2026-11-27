import type { Skill, SkillVersion } from "@devdigest/shared";

export type DiffLine = { kind: "same" | "add" | "del"; text: string };

/** Above this many cells the LCS table is skipped (whole middle = del + add). */
const MAX_LCS_CELLS = 4_000_000;

/**
 * Line diff of `from` (an old version) → `to` (the current body). Common
 * prefix/suffix are matched first, then an LCS over the middle. Bodies are
 * ≤ 50 000 chars, so the table stays small; a pathological middle falls back
 * to "all removed, all added" instead of allocating a huge table.
 */
export function lineDiff(from: string, to: string): DiffLine[] {
  const a = from.split("\n");
  const b = to.split("\n");
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;

  const head: DiffLine[] = a.slice(0, pre).map((text) => ({ kind: "same", text }));
  const tail: DiffLine[] = a.slice(a.length - suf).map((text) => ({ kind: "same", text }));
  const am = a.slice(pre, a.length - suf);
  const bm = b.slice(pre, b.length - suf);
  return [...head, ...middleDiff(am, bm), ...tail];
}

function middleDiff(a: string[], b: string[]): DiffLine[] {
  const n = a.length;
  const m = b.length;
  if ((n + 1) * (m + 1) > MAX_LCS_CELLS) {
    return [
      ...a.map((text): DiffLine => ({ kind: "del", text })),
      ...b.map((text): DiffLine => ({ kind: "add", text })),
    ];
  }
  // lcs[i][j] = LCS length of a[i..] and b[j..], flattened.
  const w = m + 1;
  const lcs = new Int32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * w + j] = a[i] === b[j] ? lcs[(i + 1) * w + j + 1]! + 1 : Math.max(lcs[(i + 1) * w + j]!, lcs[i * w + j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i]! });
      i++;
      j++;
    } else if (lcs[(i + 1) * w + j]! >= lcs[i * w + j + 1]!) {
      out.push({ kind: "del", text: a[i++]! });
    } else {
      out.push({ kind: "add", text: b[j++]! });
    }
  }
  while (i < n) out.push({ kind: "del", text: a[i++]! });
  while (j < m) out.push({ kind: "add", text: b[j++]! });
  return out;
}

export type DiffField = "name" | "description" | "type";
export interface FieldChange {
  field: DiffField;
  from: string;
  to: string;
}

/**
 * Name / description / type that differ between a version and the current
 * skill. Phase 1 rows have no snapshot of these (null) — nothing to compare.
 */
export function fieldChanges(version: SkillVersion, current: Skill): FieldChange[] {
  const out: FieldChange[] = [];
  for (const field of ["name", "description", "type"] as const) {
    const old = version[field];
    if (old != null && old !== current[field]) out.push({ field, from: old, to: current[field] });
  }
  return out;
}

/** True when the diff has no added or removed line. */
export function isUnchanged(lines: DiffLine[]): boolean {
  return lines.every((l) => l.kind === "same");
}
