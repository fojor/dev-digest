import type { CSSProperties } from "react";

export const s = {
  /** Centred content column, as in the Conventions mockup. */
  page: { maxWidth: 1280, margin: "0 auto", padding: "40px 32px 48px" } satisfies CSSProperties,
  pageHeader: { display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 24 } satisfies CSSProperties,
  title: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 } satisfies CSSProperties,
  repoName: { color: "var(--accent-text)" } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", margin: "8px 0 0" } satisfies CSSProperties,
  headerActions: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  toolbar: { display: "flex", alignItems: "center", gap: 12, marginBottom: 16 } satisfies CSSProperties,
  accepted: { fontSize: 13, color: "var(--text-secondary)", whiteSpace: "nowrap" } satisfies CSSProperties,
  toolbarEnd: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  banner: { marginBottom: 16, border: "1px solid var(--border)", borderRadius: 10 } satisfies CSSProperties,
};
