import type { CSSProperties } from "react";

/** Shared metrics so gutter rows line up with textarea lines. */
const FONT_SIZE = 13;
const LINE_HEIGHT = 1.6;
const PAD_Y = 12;

/** Co-located styles for BodyEditor. */
export const s = {
  frame: {
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    overflow: "hidden",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderBottom: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 12.5,
  } satisfies CSSProperties,
  fileName: { color: "var(--text-secondary)" } satisfies CSSProperties,
  tokens: { marginLeft: "auto", color: "var(--text-muted)" } satisfies CSSProperties,
  editor: { display: "flex", alignItems: "stretch", height: 420 } satisfies CSSProperties,
  gutter: {
    flexShrink: 0,
    minWidth: 44,
    padding: `${PAD_Y}px 10px ${PAD_Y}px 8px`,
    textAlign: "right",
    color: "var(--text-muted)",
    fontSize: FONT_SIZE,
    lineHeight: LINE_HEIGHT,
    borderRight: "1px solid var(--border)",
    overflow: "hidden",
    userSelect: "none",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  textarea: {
    flex: 1,
    minWidth: 0,
    resize: "none",
    border: "none",
    outline: "none",
    padding: `${PAD_Y}px 12px`,
    background: "transparent",
    color: "var(--text-primary)",
    fontSize: FONT_SIZE,
    lineHeight: LINE_HEIGHT,
    // Wrapping would break the 1:1 gutter ↔ line mapping.
    whiteSpace: "pre",
    overflowWrap: "normal",
    overflow: "auto",
  } satisfies CSSProperties,
} as const;
