/* Evidence of one candidate: «path:lines» header with a copy action above the
   verbatim code fragment (screens.md — NEW: EvidenceSnippet). */
"use client";

import { useTranslations } from "next-intl";
import { IconBtn } from "@devdigest/ui";
import { useToast } from "@/lib/toast";
import { evidenceLocation } from "./helpers";

export function EvidenceSnippet({
  path,
  startLine,
  endLine,
  fragment,
}: {
  path: string;
  startLine: number;
  endLine: number;
  fragment: string;
}) {
  const t = useTranslations("conventions.card");
  const toast = useToast();
  const copy = () => {
    void navigator.clipboard?.writeText(fragment).then(() => toast.info(t("copied")), () => undefined);
  };
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "6px 10px",
          background: "var(--bg-surface)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span className="mono" style={{ fontSize: 12, color: "var(--text-secondary)", flex: 1 }}>
          {evidenceLocation(path, startLine, endLine)}
        </span>
        <IconBtn icon="Copy" label={t("copyFragment")} size={14} onClick={copy} />
      </div>
      <pre className="mono" style={{ margin: 0, padding: "8px 10px", fontSize: 12, whiteSpace: "pre-wrap", overflowX: "auto" }}>
        {fragment}
      </pre>
    </div>
  );
}
