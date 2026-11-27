import type React from "react";

export const s = {
  body: { padding: "18px 24px", display: "flex", flexDirection: "column", gap: 4 } as React.CSSProperties,
  warning: {
    border: "1px solid var(--warn, #b45309)",
    background: "var(--warn-bg, rgba(180,83,9,0.08))",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 13,
    marginBottom: 12,
  } as React.CSSProperties,
  info: {
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 13,
    marginBottom: 12,
  } as React.CSSProperties,
  fieldError: { fontSize: 12, color: "var(--crit)", marginTop: 6 } as React.CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 10 } as React.CSSProperties,
  footerNote: { marginRight: "auto", fontSize: 12, color: "var(--text-tertiary)" } as React.CSSProperties,
};
