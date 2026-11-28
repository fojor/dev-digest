"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { IntentSource } from "@devdigest/shared";
import { SOURCE_STATUS_ICON } from "../../constants";
import { sourceReasonKey } from "../../helpers";

const listStyle: React.CSSProperties = { margin: "8px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 };
const rowStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-secondary)" };
const toggleStyle: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-muted)", background: "transparent", border: "none", padding: 0, cursor: "pointer" };

/** Collapsible list of every source the intent was derived from, with status and reason. */
export function IntentSources({ sources }: { sources: IntentSource[] }) {
  const t = useTranslations("intent");
  const [open, setOpen] = React.useState(false);
  return (
    <div>
      <button type="button" style={toggleStyle} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon.ChevronDown size={14} style={{ transform: open ? "none" : "rotate(-90deg)" }} />
        {t("sources.title", { count: sources.length })}
      </button>
      {open && (
        <ul style={listStyle}>
          {sources.map((src, i) => {
            const StatusIcon = Icon[SOURCE_STATUS_ICON[src.status]];
            return (
              <li key={`${src.kind}-${src.ref}-${i}`} style={rowStyle}>
                <StatusIcon size={13} />
                <span className="mono">{src.ref}</span>
                <span style={{ color: "var(--text-muted)" }}>{t(`sources.status.${src.status}`)}</span>
                {src.relation && (
                  <span style={{ color: "var(--text-muted)" }}>· {t(`sources.relation.${src.relation}`)}</span>
                )}
                {src.reason && src.status !== "fetched" && (
                  <span style={{ color: "var(--text-muted)" }}>— {t(sourceReasonKey(src.reason))}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
