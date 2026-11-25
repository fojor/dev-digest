import type { SkillCategoryCount } from "@devdigest/shared";

export interface DonutArc {
  category: string;
  count: number;
  /** Stroke length of the arc along the circle. */
  length: number;
  /** Negative stroke-dashoffset: where the arc starts along the circle. */
  offset: number;
}

/**
 * Category counts → donut arcs (stroke-dasharray technique). Zero counts are
 * dropped (the design shows non-zero categories only); bigger slices first.
 */
export function donutArcs(categories: SkillCategoryCount[], circumference: number): DonutArc[] {
  const nonZero = categories.filter((c) => c.count > 0).sort((a, b) => b.count - a.count);
  const total = nonZero.reduce((n, c) => n + c.count, 0);
  if (total === 0) return [];
  let start = 0;
  return nonZero.map((c) => {
    const length = (c.count / total) * circumference;
    const arc = { category: c.category, count: c.count, length, offset: -start };
    start += length;
    return arc;
  });
}

/** Accept rate (0..1) → the ring's 0..100 score; null when nothing was decided. */
export function acceptScore(rate: number | null): number | null {
  return rate == null ? null : Math.round(rate * 100);
}
