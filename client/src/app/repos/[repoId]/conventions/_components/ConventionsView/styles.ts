import type React from "react";

export const s = {
  pageHeader: { display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 20 } as React.CSSProperties,
  title: { fontSize: 22, fontWeight: 700, margin: 0 } as React.CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 0" } as React.CSSProperties,
  actions: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 } as React.CSSProperties,
  accepted: { fontSize: 13, color: "var(--text-secondary)", whiteSpace: "nowrap" } as React.CSSProperties,
  hint: { fontSize: 12, color: "var(--text-tertiary)" } as React.CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 12 } as React.CSSProperties,
  banner: { marginBottom: 16, border: "1px solid var(--border)", borderRadius: 10 } as React.CSSProperties,
  rule: { fontSize: 14, margin: 0 } as React.CSSProperties,
};
