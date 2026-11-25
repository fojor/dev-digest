/* SkillPanel — the side panel of the Skills page over ONE draft, so Preview
   shows unsaved edits. Tabs: Config (the editor: Configuration heading with
   vN + Enabled, body editor with file header / unsaved / live tokens / line
   numbers, optional "What changed?" note), Preview (the exact prompt block the
   agent receives), and — for a saved skill — Stats and Versions. `skill`
   undefined = creating a new skill. The parent renders it with
   key={skill id | "new"} so switching skills reseeds the draft. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon, Markdown, Tabs, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useCreateSkill, useDeleteSkill, useSkillTokens, useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { SKILL_TYPE_COLOR } from "@/lib/skill-types";
import { EMPTY_DRAFT, SkillForm, draftFrom, isDirty, isDraftValid, type SkillDraft } from "../SkillForm";
import { BodyEditor } from "./_components/BodyEditor";
import { StatsTab } from "./_components/StatsTab";
import { VersionsTab } from "./_components/VersionsTab";
import { NOTE_MAX, type PanelTab } from "./constants";
import { editorFileName, renderSkillBlock, tabsFor, visibleTab } from "./helpers";
import { s } from "./styles";

export function SkillPanel({
  skill,
  tab: requestedTab,
  onTab,
  onCreated,
  onDeleted,
}: {
  skill?: Skill;
  tab: PanelTab;
  onTab: (tab: PanelTab) => void;
  onCreated: (id: string) => void;
  onDeleted: () => void;
}) {
  const t = useTranslations("skills");
  const toast = useToast();
  const create = useCreateSkill();
  const update = useUpdateSkill();
  const del = useDeleteSkill();
  const [draft, setDraft] = React.useState<SkillDraft>(() => (skill ? draftFrom(skill) : EMPTY_DRAFT));
  const [note, setNote] = React.useState("");
  const tokens = useSkillTokens(draft);

  const tab = visibleTab(requestedTab, !!skill);
  const valid = isDraftValid(draft);
  const dirty = skill ? isDirty(draft, draftFrom(skill)) : true;
  // The create form only reads as "unsaved" once something was typed.
  const showUnsaved = skill ? dirty : isDirty(draft, EMPTY_DRAFT);
  const saving = create.isPending || update.isPending;
  const tabs = tabsFor(!!skill).map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));

  const save = () => {
    if (!valid) {
      toast.error(t("form.required"));
      return;
    }
    if (skill) {
      const trimmed = note.trim();
      update.mutate(
        { id: skill.id, patch: { ...draft, ...(trimmed ? { note: trimmed } : {}) } },
        { onSuccess: () => setNote("") },
      );
    } else {
      create.mutate(draft, {
        onSuccess: (created) => {
          toast.success(t("form.created", { name: created.name }));
          onCreated(created.id);
        },
      });
    }
  };

  const remove = () => {
    if (!skill || !window.confirm(t("panel.deleteConfirm", { name: skill.name }))) return;
    del.mutate(skill.id, {
      onSuccess: () => {
        toast.success(t("panel.deleted"));
        onDeleted();
      },
    });
  };

  const onRestored = (restored: Skill) => {
    setDraft(draftFrom(restored));
    setNote("");
    onTab("config");
  };

  const block = renderSkillBlock(draft);

  return (
    <div style={s.root}>
      <div style={s.header}>
        <Icon.Sparkles size={18} style={{ color: skill ? SKILL_TYPE_COLOR[skill.type] : "var(--accent)" }} />
        <h2 className="mono" style={s.title}>
          {skill ? skill.name : t("panel.newTitle")}
        </h2>
        {skill && <Badge color={SKILL_TYPE_COLOR[skill.type]}>{t(`type.${skill.type}`)}</Badge>}
        {skill && <Badge color="var(--text-secondary)">{t("panel.version", { version: skill.version })}</Badge>}
        {skill && (
          <div style={s.headerRight}>
            <Button kind="ghost" size="sm" icon="Trash" onClick={remove} disabled={del.isPending}>
              {t("panel.delete")}
            </Button>
          </div>
        )}
      </div>
      <Tabs tabs={tabs} value={tab} onChange={(k) => onTab(k as PanelTab)} pad="0 24px" />
      <div style={s.body}>
        <div style={s.inner}>
          {tab === "stats" && skill && <StatsTab skillId={skill.id} />}
          {tab === "versions" && skill && <VersionsTab skill={skill} onRestored={onRestored} />}
          {tab === "preview" && (
            <>
              <h3 style={s.previewTitle}>{t("preview.title")}</h3>
              <p style={s.previewSubtitle}>{t("preview.subtitle")}</p>
              <div style={s.preview} data-testid="skill-preview" data-block={block}>
                {draft.body.trim() ? <Markdown>{block}</Markdown> : <span style={s.muted}>{t("form.noPreview")}</span>}
              </div>
            </>
          )}
          {tab === "config" && (
            <>
              <div style={s.configHead}>
                <h3 style={s.configTitle}>{t("form.title")}</h3>
                {skill && <Badge color="var(--text-secondary)">{t("panel.version", { version: skill.version })}</Badge>}
                {skill && (
                  <label style={s.enabledLabel}>
                    {t("form.enabled")}
                    <Toggle
                      on={skill.enabled}
                      onChange={(enabled) => update.mutate({ id: skill.id, patch: { enabled } })}
                      size={16}
                    />
                  </label>
                )}
              </div>
              <SkillForm
                draft={draft}
                onChange={setDraft}
                bodyEditor={
                  <BodyEditor
                    value={draft.body}
                    onChange={(body) => setDraft({ ...draft, body })}
                    fileName={editorFileName(draft.name)}
                    dirty={showUnsaved}
                    tokens={draft.body.trim() ? tokens.data?.tokens : undefined}
                    placeholder={t("form.bodyPlaceholder")}
                    label={t("form.body")}
                  />
                }
              />
              <div style={s.actions}>
                <Button kind="primary" icon="Check" onClick={save} disabled={saving || !dirty}>
                  {saving ? t("form.saving") : skill ? t("form.save") : t("form.create")}
                </Button>
                {skill && (
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={NOTE_MAX}
                    placeholder={t("form.notePlaceholder")}
                    aria-label={t("form.note")}
                    style={s.noteInput}
                  />
                )}
                {skill && update.isSuccess && !dirty && (
                  <span style={s.savedNote}>{t("form.saved", { version: skill.version })}</span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
