/* SkillForm — the skill's editable fields: name, description (the skill's
   "interface", phrased as a directive), type and markdown body. Controlled:
   the parent owns the draft (editor panel or import preview). `bodyEditor`
   replaces the plain body textarea (the panel passes its BodyEditor). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, SelectInput, TextInput, Textarea } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { SKILL_TYPES } from "@/lib/skill-types";
import type { SkillDraft } from "./types";

export function SkillForm({
  draft,
  onChange,
  bodyEditor,
}: {
  draft: SkillDraft;
  onChange: (next: SkillDraft) => void;
  bodyEditor?: React.ReactNode;
}) {
  const t = useTranslations("skills");
  const set = <K extends keyof SkillDraft>(key: K) => (value: SkillDraft[K]) => onChange({ ...draft, [key]: value });
  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: t(`type.${v}`) }));
  return (
    <>
      <FormField label={t("form.name")} required>
        <TextInput value={draft.name} onChange={set("name")} placeholder={t("form.namePlaceholder")} mono />
      </FormField>
      <FormField label={t("form.description")} hint={t("form.descriptionHint")}>
        <TextInput
          value={draft.description}
          onChange={set("description")}
          placeholder={t("form.descriptionPlaceholder")}
        />
      </FormField>
      <FormField label={t("form.type")}>
        <SelectInput value={draft.type} onChange={(v) => set("type")(v as SkillType)} options={typeOptions} mono />
      </FormField>
      <FormField label={t("form.body")} hint={t("form.bodyHint")} required>
        {bodyEditor ?? (
          <Textarea
            value={draft.body}
            onChange={set("body")}
            rows={18}
            mono
            placeholder={t("form.bodyPlaceholder")}
          />
        )}
      </FormField>
    </>
  );
}
