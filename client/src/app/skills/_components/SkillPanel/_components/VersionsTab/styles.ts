import type { CSSProperties } from "react";
import type { DiffLine } from "./helpers";

const LINE_BG: Record<DiffLine["kind"], string> = {
  same: "transparent",
  add: "var(--ok-bg)",
  del: "var(--crit-bg)",
};
const LINE_SIGN_COLOR: Record<DiffLine["kind"], string> = {
  same: "var(--text-muted)",
  add: "var(--ok)",
  del: "var(--crit)",
};

/** Co-located styles for VersionsTab and its diff view. */
export const s = {
  headRow: { display: "flex", alignItems: "baseline", gap: 10 } satisfies CSSProperties,
  title: { fontSize: 16, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  count: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-muted)", margin: "6px 0 16px" } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    marginBottom: 6,
    background: "var(--bg-surface)",
    fontSize: 13.5,
  } satisfies CSSProperties,
  version: { fontWeight: 600, minWidth: 36 } satisfies CSSProperties,
  meta: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 } satisfies CSSProperties,
  note: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  date: { fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" } satisfies CSSProperties,
  actions: { display: "flex", gap: 6 } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  // Modal (vendor/ui kit) gives its children no padding.
  diffSection: { padding: "0 20px", marginBottom: 18 } satisfies CSSProperties,
  diffSectionTitle: { fontSize: 13, fontWeight: 600, marginBottom: 8 } satisfies CSSProperties,
  field: { fontSize: 13, marginBottom: 6 } satisfies CSSProperties,
  fieldFrom: { color: "var(--crit)", textDecoration: "line-through" } satisfies CSSProperties,
  fieldTo: { color: "var(--ok)" } satisfies CSSProperties,
  diffBox: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "auto",
    maxHeight: 460,
    fontSize: 12.5,
    lineHeight: 1.55,
  } satisfies CSSProperties,
  diffLine: (kind: DiffLine["kind"]): CSSProperties => ({
    display: "flex",
    background: LINE_BG[kind],
    whiteSpace: "pre",
  }),
  diffSign: (kind: DiffLine["kind"]): CSSProperties => ({
    width: 22,
    flexShrink: 0,
    textAlign: "center",
    color: LINE_SIGN_COLOR[kind],
    userSelect: "none",
  }),
} as const;
