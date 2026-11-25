import type { CSSProperties } from "react";

/** Co-located styles for StatsTab. */
export const s = {
  tiles: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 } satisfies CSSProperties,
  tile: {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 9,
    padding: 16,
    minWidth: 0,
  } satisfies CSSProperties,
  tileLabel: {
    fontSize: 11.5,
    fontWeight: 600,
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  tileRow: { display: "flex", alignItems: "center", gap: 12, marginTop: 10 } satisfies CSSProperties,
  tileValue: { fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  tileSub: { fontSize: 12, color: "var(--text-muted)", marginTop: 4 } satisfies CSSProperties,
  window: { fontSize: 12, color: "var(--text-muted)", margin: "0 0 12px" } satisfies CSSProperties,
  section: { marginTop: 24 } satisfies CSSProperties,
  sectionTitle: { fontSize: 14, fontWeight: 600, marginBottom: 10 } satisfies CSSProperties,
  agentRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    marginBottom: 6,
    background: "var(--bg-surface)",
    fontSize: 13.5,
  } satisfies CSSProperties,
  agentName: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  donutRow: { display: "flex", alignItems: "center", gap: 24 } satisfies CSSProperties,
  legend: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  legendRow: { display: "flex", alignItems: "center", gap: 10, fontSize: 13, minWidth: 180 } satisfies CSSProperties,
  swatch: (color: string): CSSProperties => ({ width: 9, height: 9, borderRadius: 2, background: color }),
  legendLabel: { flex: 1, color: "var(--text-secondary)" } satisfies CSSProperties,
  legendValue: { fontWeight: 600 } satisfies CSSProperties,
} as const;
