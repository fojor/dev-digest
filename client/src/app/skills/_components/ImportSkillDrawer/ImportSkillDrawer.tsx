/* ImportSkillDrawer — upload a .md / .zip skill, review the extracted core
   (editable), the ignored archive files and the warnings, then confirm. The
   server parses without storing; only "Save skill" creates it (source
   "imported"). Executable archive entries are listed, never read or run. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Drawer, FormField, Icon } from "@devdigest/ui";
import type { SkillImportPreview } from "@devdigest/shared";
import { useCreateSkill, useImportPreview } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { SkillForm, draftFrom, isDraftValid, type SkillDraft } from "../SkillForm";
import { ACCEPT, MAX_IMPORT_BYTES } from "./constants";
import { bytesToBase64, readFileBytes } from "./helpers";
import { s } from "./styles";

export function ImportSkillDrawer({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const preview = useImportPreview();
  const create = useCreateSkill();
  const fileInput = React.useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<SkillImportPreview | null>(null);
  const [draft, setDraft] = React.useState<SkillDraft | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setDraft(null);
    if (file.size > MAX_IMPORT_BYTES) {
      toast.error(t("import.tooLarge"));
      return;
    }
    const content_base64 = bytesToBase64(await readFileBytes(file));
    preview.mutate(
      { filename: file.name, content_base64 },
      {
        onSuccess: (p) => {
          setResult(p);
          setDraft(draftFrom(p));
        },
      },
    );
  };

  const save = () => {
    if (!draft || !isDraftValid(draft)) {
      toast.error(t("form.required"));
      return;
    }
    create.mutate(
      // source_file → the first version's note ("Imported from …").
      { ...draft, source: "imported", source_file: result?.source_file },
      {
        onSuccess: (skill) => {
          toast.success(t("import.saved", { name: skill.name }));
          onSaved(skill.id);
        },
      },
    );
  };

  return (
    <Drawer
      width={760}
      title={t("import.title")}
      subtitle={t("import.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="secondary" onClick={onClose}>
            {t("import.cancel")}
          </Button>
          <Button kind="primary" icon="Check" onClick={save} disabled={!draft || create.isPending}>
            {t("import.confirm")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div role="note" style={s.trust}>
          <Icon.AlertTriangle size={16} style={{ color: "var(--warn)", flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={s.trustTitle}>{t("import.trustTitle")}</div>
            {t("import.trustBody")}
          </div>
        </div>

        <FormField label={t("import.fileLabel")} hint={t("import.fileHint")}>
          <div style={s.fileRow}>
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPT}
              aria-label={t("import.fileLabel")}
              style={{ display: "none" }}
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            <Button kind="secondary" icon="Upload" onClick={() => fileInput.current?.click()} loading={preview.isPending}>
              {preview.isPending ? t("import.reading") : t("import.choose")}
            </Button>
            {fileName && <span className="mono" style={s.fileName}>{fileName}</span>}
          </div>
        </FormField>

        {result && draft && (
          <>
            {result.warnings.length > 0 && (
              <div style={s.section}>
                <div style={s.sectionTitle}>{t("import.warnings")}</div>
                <ul style={s.list}>
                  {result.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.ignored_files.length > 0 && (
              <div style={s.section}>
                <div style={s.sectionTitle}>{t("import.ignoredTitle", { count: result.ignored_files.length })}</div>
                {result.ignored_files.map((f) => (
                  <div key={f.path} style={s.ignoredRow}>
                    <span className="mono">{f.path}</span>
                    {f.executable ? (
                      <Badge color="var(--crit)">{t("import.executable")}</Badge>
                    ) : (
                      <Badge color="var(--text-muted)">{t("import.notRead")}</Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div style={s.section}>
              <div style={s.sectionTitle}>{t("import.previewTitle")}</div>
              <div style={{ ...s.muted, marginBottom: 12 }}>{t("import.sourceFile", { file: result.source_file })}</div>
              <SkillForm draft={draft} onChange={setDraft} />
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}
