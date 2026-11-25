/** Donut colors per finding category (FindingCategory); unknown → muted. */
export const CATEGORY_COLOR: Record<string, string> = {
  bug: "var(--crit)",
  security: "var(--warn)",
  perf: "var(--info)",
  style: "var(--sugg)",
  test: "var(--ok)",
};
export const FALLBACK_COLOR = "var(--text-muted)";

/** Known categories with a translated legend label. */
export const KNOWN_CATEGORIES = ["bug", "security", "perf", "style", "test"] as const;

export const DONUT_SIZE = 132;
export const DONUT_STROKE = 20;
