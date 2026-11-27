import type React from "react";
import type { ConventionCandidate } from "@devdigest/shared";

export const s = {
  card: (status: ConventionCandidate["status"]): React.CSSProperties => ({
    border: `1px solid ${status === "accepted" ? "var(--accent)" : "var(--border)"}`,
    borderRadius: 12,
    padding: 16,
    background: "var(--bg-elevated)",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    ...(status === "rejected" ? { opacity: 0.55 } : {}),
  }),
  top: { display: "flex", alignItems: "flex-start", gap: 12 } as React.CSSProperties,
  rule: {
    flex: 1,
    fontSize: 14,
    lineHeight: 1.5,
    margin: 0,
    background: "none",
    border: "none",
    padding: 0,
    textAlign: "left",
    color: "inherit",
    cursor: "text",
    font: "inherit",
  } as React.CSSProperties,
  actions: { display: "flex", gap: 8 } as React.CSSProperties,
  tags: { display: "flex", gap: 8, alignItems: "center" } as React.CSSProperties,
  editFooter: { display: "flex", alignItems: "center", gap: 8, marginTop: 6 } as React.CSSProperties,
  counter: { marginLeft: "auto", fontSize: 12, color: "var(--text-tertiary)" } as React.CSSProperties,
  fieldError: { fontSize: 12, color: "var(--crit)" } as React.CSSProperties,
  confidence: { display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "var(--text-secondary)" } as React.CSSProperties,
};
