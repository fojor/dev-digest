/* SCR-03 — assemble the accepted candidates into a convention skill and save it
   through the skills API (ADR-0002): create, or update the matching extracted
   skill; manual/imported name clashes are blocked. Refuses while scanning. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { ConventionCandidate, Skill } from "@devdigest/shared";
import { Button, ErrorState, FormField, Modal, Textarea, TextInput, Toggle } from "@devdigest/ui";
import { useConventions } from "@/lib/hooks/conventions";
import { useCreateSkill, useSkills, useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { buildSkillDraft, findExtractedMatch, type NameMatch } from "../../helpers";
import { validateDraft, type FieldErrors } from "./helpers";
import { s } from "./styles";

interface Ready {
  candidates: ConventionCandidate[];
  skills: Skill[];
}

export function CreateSkillModal({
  repoId,
  repoName,
  onClose,
}: {
  repoId: string;
  repoName: string;
  onClose: () => void;
}) {
  const t = useTranslations("conventions.modal");
  const toast = useToast();
  const conventions = useConventions(repoId);
  const skills = useSkills();
  const [ready, setReady] = React.useState<Ready | null>(null);

  // Flow 7: refetch candidates (scanning flag) and skills before the modal opens.
  React.useEffect(() => {
    let live = true;
    void Promise.all([conventions.refetch(), skills.refetch()]).then(([c, sk]) => {
      if (!live) return;
      if (!c.data || c.data.scanning) {
        toast.error(t("scanning"));
        onClose();
        return;
      }
      setReady({ candidates: c.data.candidates, skills: sk.data ?? [] });
    });
    return () => {
      live = false;
    };
    // Runs once per opening; the refetch functions are stable per query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready) return null;
  return <DraftForm repoName={repoName} ready={ready} onClose={onClose} recheck={() => conventions.refetch()} />;
}

function DraftForm({
  repoName,
  ready,
  onClose,
  recheck,
}: {
  repoName: string;
  ready: Ready;
  onClose: () => void;
  recheck: () => Promise<{ data?: { scanning: boolean } }>;
}) {
  const t = useTranslations("conventions.modal");
  const toast = useToast();
  const create = useCreateSkill();
  const update = useUpdateSkill();

  const draft = React.useMemo(() => buildSkillDraft(ready.candidates, repoName), [ready, repoName]);
  const acceptedCount = ready.candidates.filter((c) => c.status === "accepted").length;
  const enabledFor = (m: NameMatch) => (m.kind === "update" ? m.skill.enabled : false);

  const [name, setName] = React.useState(draft.name);
  const [description, setDescription] = React.useState(draft.description);
  const [body, setBody] = React.useState(draft.body);
  const [match, setMatch] = React.useState(() => findExtractedMatch(ready.skills, draft.name));
  const [enabled, setEnabled] = React.useState(() => enabledFor(findExtractedMatch(ready.skills, draft.name)));
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [saveError, setSaveError] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const onName = (v: string) => {
    setName(v);
    const next = findExtractedMatch(ready.skills, v);
    // The switch starts from the matched extracted skill's state (AC-19); off for a new skill.
    if (next.kind !== match.kind || (next.kind === "update" && match.kind === "update" && next.skill.id !== match.skill.id)) {
      setEnabled(enabledFor(next));
    }
    setMatch(next);
  };

  const save = async () => {
    const found = validateDraft({ name, description, body }, match);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaveError(false);
    setSaving(true);
    const fresh = await recheck();
    if (!fresh.data || fresh.data.scanning) {
      setSaving(false);
      toast.error(t("scanning"));
      return;
    }
    const fields = {
      name: name.trim(),
      description: description.trim(),
      body,
      enabled,
      evidence_files: draft.evidenceFiles,
    };
    const done = {
      onSuccess: () => {
        toast.success(t("saved"));
        onClose();
      },
      onError: () => {
        setSaving(false);
        setSaveError(true);
      },
    };
    if (match.kind === "update") update.mutate({ id: match.skill.id, patch: fields }, done);
    else create.mutate({ ...fields, type: "convention", source: "extracted" }, done);
  };

  const fieldError = (f: keyof FieldErrors) =>
    errors[f] ? <div style={s.fieldError}>{t(`errors.${errors[f]!.key}`, errors[f]!.values)}</div> : null;
  const isUpdate = match.kind === "update";

  return (
    <Modal
      width={720}
      title={t("title")}
      subtitle={t("subtitle", { count: acceptedCount, repo: repoName })}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <span style={s.footerNote}>
            {isUpdate ? t("footerUpdate", { next: match.skill.version + 1 }) : t("footerCreate")}
          </span>
          <Button onClick={onClose}>{t("cancel")}</Button>
          <Button kind="primary" icon="Sparkles" onClick={() => void save()} loading={saving} disabled={saving}>
            {isUpdate ? t("update") : t("create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        {saveError && <ErrorState title={t("saveError")} />}
        <div style={s.warning}>{t("trust")}</div>
        {isUpdate && (
          <div style={s.info}>
            {t("updateWarning", {
              name: match.skill.name.trim(),
              next: match.skill.version + 1,
              current: match.skill.version,
            })}
          </div>
        )}
        <FormField label={t("name")} required hint={t("nameHint")}>
          <div data-testid="field-name">
            <TextInput value={name} onChange={onName} mono />
          </div>
          {fieldError("name")}
        </FormField>
        <FormField label={t("description")} required>
          <div data-testid="field-description">
            <TextInput value={description} onChange={setDescription} />
          </div>
          {fieldError("description")}
        </FormField>
        <FormField label={t("enabled")} hint={t("enabledHint")}>
          <Toggle on={enabled} onChange={setEnabled} />
        </FormField>
        <FormField label={t("body")} required>
          <div data-testid="field-body">
            <Textarea value={body} onChange={setBody} rows={14} mono />
          </div>
          {fieldError("body")}
        </FormField>
      </div>
    </Modal>
  );
}
