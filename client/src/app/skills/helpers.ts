/* Pure formatting shared by the Skills page's cards and the Stats tab. */

/** A 0..1 rate as a whole percent; null/undefined (no data) → "—". */
export function formatRate(rate: number | null | undefined): string {
  return rate == null ? "—" : `${Math.round(rate * 100)}%`;
}
