/** Side-panel tabs; `labelKey` resolves under the `skills` namespace.
 *  `needsSkill` tabs exist only for a saved skill (not the create form). */
export const PANEL_TABS = [
  { key: "config", labelKey: "panel.tabs.config", icon: "Settings", needsSkill: false },
  { key: "preview", labelKey: "panel.tabs.preview", icon: "Eye", needsSkill: false },
  { key: "stats", labelKey: "panel.tabs.stats", icon: "BarChart", needsSkill: true },
  { key: "versions", labelKey: "panel.tabs.versions", icon: "History", needsSkill: true },
] as const;

export type PanelTab = (typeof PANEL_TABS)[number]["key"];

/** Max length of the optional "What changed?" version note (API: ≤ 200). */
export const NOTE_MAX = 200;
