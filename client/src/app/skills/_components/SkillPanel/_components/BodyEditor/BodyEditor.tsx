/* BodyEditor — the skill body editor: a file header (`<name>.md`, an
   "unsaved" badge while dirty, the live token count on the right) over a
   line-number gutter that scrolls with the textarea. Presentational: the
   panel owns the draft and the token query. No syntax highlighting (that would
   need an editor dependency). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import { lineNumbers } from "./helpers";
import { s } from "./styles";

export function BodyEditor({
  value,
  onChange,
  fileName,
  dirty,
  tokens,
  placeholder,
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  fileName: string;
  dirty: boolean;
  /** Undefined while unknown (empty body, first request in flight). */
  tokens: number | undefined;
  placeholder?: string;
  /** Accessible name of the textarea. */
  label: string;
}) {
  const t = useTranslations("skills");
  const gutter = React.useRef<HTMLDivElement>(null);
  const lines = lineNumbers(value);
  return (
    <div style={s.frame}>
      <div style={s.header}>
        <span className="mono" style={s.fileName}>
          {fileName}
        </span>
        {dirty && <Badge color="var(--warn)">{t("form.unsaved")}</Badge>}
        <span className="mono tnum" style={s.tokens}>
          {tokens == null ? t("form.tokensUnknown") : t("form.tokens", { count: tokens })}
        </span>
      </div>
      <div style={s.editor}>
        <div ref={gutter} className="mono tnum" style={s.gutter} aria-hidden="true" data-testid="line-gutter">
          {lines.map((n) => (
            <div key={n}>{n}</div>
          ))}
        </div>
        <textarea
          className="mono"
          aria-label={label}
          value={value}
          placeholder={placeholder}
          spellCheck={false}
          wrap="off"
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => {
            if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop;
          }}
          style={s.textarea}
        />
      </div>
    </div>
  );
}
