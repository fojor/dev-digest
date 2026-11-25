import type { CSSProperties } from "react";

/** Co-located styles for ImportSkillDrawer. */
export const s = {
  body: { padding: "20px 24px", overflow: "auto" } satisfies CSSProperties,
  trust: {
    display: "flex",
    gap: 10,
    padding: 14,
    marginBottom: 20,
    borderRadius: 10,
    background: "var(--warn-bg)",
    color: "var(--text-primary)",
    fontSize: 13,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  trustTitle: { fontWeight: 600, marginBottom: 4 } satisfies CSSProperties,
  fileRow: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  fileName: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  section: { marginTop: 20, marginBottom: 16 } satisfies CSSProperties,
  sectionTitle: { fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 } satisfies CSSProperties,
  muted: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  list: { margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 } satisfies CSSProperties,
  ignoredRow: { display: "flex", gap: 8, alignItems: "center", fontSize: 12.5 } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
} as const;
