/* VersionsTab — the skill's history, newest first. The current version is
   marked; older ones offer Diff (vs current) and Restore. Restore never
   rewrites history: the server appends a new version with the old content,
   and the panel reseeds its editor from the result. */
"use client";

import React from "react";
import { useTranslations, useFormatter } from "next-intl";
import { Badge, Button, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill, SkillVersion } from "@devdigest/shared";
import { useRestoreSkillVersion, useSkillVersions } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { VersionDiff } from "./VersionDiff";
import { s } from "./styles";

export function VersionsTab({ skill, onRestored }: { skill: Skill; onRestored: (restored: Skill) => void }) {
  const t = useTranslations("skills");
  const format = useFormatter();
  const toast = useToast();
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion();
  const [diffOf, setDiffOf] = React.useState<SkillVersion | null>(null);

  if (isLoading) return <Skeleton height={120} />;
  if (isError || !versions) return <ErrorState body={t("versions.loadError")} onRetry={() => refetch()} />;

  const onRestore = (v: SkillVersion) => {
    if (!window.confirm(t("versions.restoreConfirm", { version: v.version }))) return;
    restore.mutate(
      { id: skill.id, version: v.version },
      {
        onSuccess: (restored) => {
          toast.success(t("versions.restored", { version: v.version, next: restored.version }));
          onRestored(restored);
        },
      },
    );
  };

  return (
    <div>
      <div style={s.headRow}>
        <h3 style={s.title}>{t("versions.title")}</h3>
        <span style={s.count}>{t("versions.count", { count: versions.length })}</span>
      </div>
      <p style={s.subtitle}>{t("versions.subtitle")}</p>
      {versions.length === 0 && <div style={s.muted}>{t("versions.empty")}</div>}
      {versions.map((v) => (
        <div key={v.version} style={s.row}>
          <span className="mono" style={s.version}>
            {t("panel.version", { version: v.version })}
          </span>
          {/* Note above date: the panel is narrow, so the note keeps the row's width. */}
          <div style={s.meta}>
            <span style={s.note} title={v.note ?? undefined}>
              {v.note || t("versions.noNote")}
            </span>
            <span style={s.date}>
              {format.dateTime(new Date(v.created_at), { dateStyle: "medium", timeStyle: "short" })}
            </span>
          </div>
          {v.current ? (
            <Badge color="var(--accent)">{t("versions.current")}</Badge>
          ) : (
            <div style={s.actions}>
              <Button kind="ghost" size="sm" icon="Eye" onClick={() => setDiffOf(v)}>
                {t("versions.diff")}
              </Button>
              <Button
                kind="secondary"
                size="sm"
                icon="RefreshCw"
                onClick={() => onRestore(v)}
                disabled={restore.isPending}
              >
                {t("versions.restore")}
              </Button>
            </div>
          )}
        </div>
      ))}
      {diffOf && <VersionDiff version={diffOf} current={skill} onClose={() => setDiffOf(null)} />}
    </div>
  );
}
