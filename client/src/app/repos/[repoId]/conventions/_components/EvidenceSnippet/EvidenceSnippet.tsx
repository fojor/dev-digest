/* Evidence of one candidate: «path:lines» header with a copy action above the
   verbatim code fragment (screens.md — NEW: EvidenceSnippet). With `href` the
   header opens the file at those lines on GitHub in a new tab. */
"use client";

import { useTranslations } from "next-intl";
import { Icon, IconBtn } from "@devdigest/ui";
import { useToast } from "@/lib/toast";
import { evidenceLocation } from "./helpers";

export function EvidenceSnippet({
  path,
  startLine,
  endLine,
  fragment,
  href,
}: {
  path: string;
  startLine: number;
  endLine: number;
  fragment: string;
  /** GitHub blob URL of the evidence lines; without it the header is plain text. */
  href?: string | null;
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
        {href ? (
          <a
            className="mono"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            title={t("openOnGitHub")}
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              flex: 1,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              textUnderlineOffset: 2,
            }}
          >
            {evidenceLocation(path, startLine, endLine)}
            <Icon.ExternalLink size={12} aria-hidden />
          </a>
        ) : (
          <span className="mono" style={{ fontSize: 12, color: "var(--text-secondary)", flex: 1 }}>
            {evidenceLocation(path, startLine, endLine)}
          </span>
        )}
        <IconBtn icon="Copy" label={t("copyFragment")} size={14} onClick={copy} />
      </div>
      <pre className="mono" style={{ margin: 0, padding: "8px 10px", fontSize: 12, whiteSpace: "pre-wrap", overflowX: "auto" }}>
        {fragment}
      </pre>
    </div>
  );
}
