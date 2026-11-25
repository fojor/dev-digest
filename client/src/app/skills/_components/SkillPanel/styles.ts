import type { CSSProperties } from "react";

/** Co-located styles for SkillPanel. */
export const s = {
  root: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12, padding: "16px 28px 0", flexShrink: 0 } satisfies CSSProperties,
  title: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  headerRight: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 } satisfies CSSProperties,
  configHead: { display: "flex", alignItems: "center", gap: 10, marginBottom: 16 } satisfies CSSProperties,
  configTitle: { fontSize: 16, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  enabledLabel: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  body: { flex: 1, minHeight: 0, overflow: "auto", padding: "24px 28px" } satisfies CSSProperties,
  inner: { maxWidth: 820 } satisfies CSSProperties,
  actions: { display: "flex", gap: 10, alignItems: "center", marginTop: 4 } satisfies CSSProperties,
  noteInput: {
    flex: 1,
    maxWidth: 420,
    padding: "8px 10px",
    borderRadius: 7,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    fontSize: 13,
    outline: "none",
  } satisfies CSSProperties,
  savedNote: { fontSize: 13, color: "var(--ok)" } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  previewTitle: { fontSize: 16, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  previewSubtitle: { fontSize: 13, color: "var(--text-muted)", margin: "6px 0 16px" } satisfies CSSProperties,
  preview: {
    padding: 20,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 14,
  } satisfies CSSProperties,
} as const;
