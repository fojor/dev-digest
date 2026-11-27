import type { CSSProperties } from "react";

/** Co-located styles for SkillsView. */
export const s = {
  page: { display: "flex", height: "calc(100vh - 52px)" } satisfies CSSProperties,
  list: {
    width: 300,
    flexShrink: 0,
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  listHeader: { padding: "16px 16px 12px" } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 14 } satisfies CSSProperties,
  h1: { fontSize: 18, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  search: { position: "relative" } satisfies CSSProperties,
  searchIcon: { position: "absolute", left: 10, top: 9, color: "var(--text-muted)" } satisfies CSSProperties,
  searchInput: {
    width: "100%",
    padding: "7px 10px 7px 30px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-base)",
    color: "var(--text-primary)",
    fontSize: 13,
  } satisfies CSSProperties,
  scroll: { flex: 1, overflow: "auto", padding: "0 12px 12px" } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)", padding: "8px 4px" } satisfies CSSProperties,
  empty: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center" } satisfies CSSProperties,
} as const;
