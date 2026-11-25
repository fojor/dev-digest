/* VersionDiff — what changed from an old version to the current skill: the
   name / description / type changes, then a line diff of the body. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@devdigest/ui";
import type { Skill, SkillVersion } from "@devdigest/shared";
import { fieldChanges, isUnchanged, lineDiff } from "./helpers";
import { s } from "./styles";

const SIGN = { same: " ", add: "+", del: "−" } as const;

export function VersionDiff({
  version,
  current,
  onClose,
}: {
  version: SkillVersion;
  current: Skill;
  onClose: () => void;
}) {
  const t = useTranslations("skills");
  const fields = fieldChanges(version, current);
  const lines = lineDiff(version.body, current.body);
  return (
    <Modal
      width={820}
      title={t("versions.diffTitle", { version: version.version, current: current.version })}
      subtitle={t("versions.diffSubtitle", { version: version.version })}
      onClose={onClose}
    >
      {fields.length > 0 && (
        <div style={s.diffSection}>
          <div style={s.diffSectionTitle}>{t("versions.fieldsTitle")}</div>
          {fields.map((f) => (
            <div key={f.field} style={s.field}>
              <strong>{t(`versions.field.${f.field}`)}:</strong> <span style={s.fieldFrom}>{f.from}</span> →{" "}
              <span style={s.fieldTo}>{f.to}</span>
            </div>
          ))}
        </div>
      )}
      <div style={s.diffSection}>
        <div style={s.diffSectionTitle}>{t("versions.bodyTitle")}</div>
        {isUnchanged(lines) ? (
          <div style={s.muted}>{t("versions.noChanges")}</div>
        ) : (
          <div className="mono" style={s.diffBox} data-testid="version-diff">
            {lines.map((l, i) => (
              // Lines are positional; the index is the stable identity here.
              <div key={i} style={s.diffLine(l.kind)} data-kind={l.kind}>
                <span style={s.diffSign(l.kind)}>{SIGN[l.kind]}</span>
                <span>{l.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
