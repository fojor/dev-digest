/* /skills — Skills Lab → Skills. Left: searchable list of skill cards (global
   enabled switch). Right: the selected skill's panel (Config editor / Preview)
   or the create form. Selection and tab live in ?skill= / ?tab=. "Add Skill"
   offers create or import (drawer). */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useDeleteSkill, useSkillStatsSummary, useSkills, useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { ImportSkillDrawer } from "../ImportSkillDrawer";
import { SkillCard } from "../SkillCard";
import { SkillPanel, type PanelTab } from "../SkillPanel";
import { filterSkills, parsePanelTab, resolveSelection } from "./helpers";
import { s } from "./styles";

export function SkillsView() {
  const t = useTranslations("skills");
  const router = useRouter();
  const params = useSearchParams();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const del = useDeleteSkill();
  const toast = useToast();
  // One batch request for every card's usage row.
  const { data: stats } = useSkillStatsSummary();
  const statsById = new Map((stats ?? []).map((row) => [row.skill_id, row]));
  const [search, setSearch] = React.useState("");
  const [importing, setImporting] = React.useState(false);

  const tab = parsePanelTab(params.get("tab"));
  const selection = resolveSelection(params.get("skill"), skills);
  const list = filterSkills(skills ?? [], search);

  const go = (skill: string | null, nextTab: PanelTab = tab) => {
    const sp = new URLSearchParams();
    if (skill) sp.set("skill", skill);
    if (skill && nextTab !== "config") sp.set("tab", nextTab);
    const qs = sp.toString();
    router.replace(qs ? `/skills?${qs}` : "/skills");
  };
  const selectedId = selection.kind === "skill" ? selection.skill.id : null;

  // Card trash icon: same confirm as the panel's Delete; closes the panel only
  // when it was showing the deleted skill.
  const deleteSkill = (skill: { id: string; name: string }) => {
    if (!window.confirm(t("panel.deleteConfirm", { name: skill.name }))) return;
    del.mutate(skill.id, {
      onSuccess: () => {
        toast.success(t("panel.deleted"));
        if (skill.id === selectedId) go(null);
      },
    });
  };

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
      {importing && (
        <ImportSkillDrawer
          onClose={() => setImporting(false)}
          onSaved={(id) => {
            setImporting(false);
            go(id, "config");
          }}
        />
      )}
      <div style={s.page}>
        <aside style={s.list}>
          <div style={s.listHeader}>
            <div style={s.titleRow}>
              <h1 style={s.h1}>{t("page.heading")}</h1>
              <Dropdown
                width={210}
                align="right"
                trigger={
                  <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                    {t("page.addSkill")}
                  </Button>
                }
                items={[
                  { label: t("page.create"), icon: "Edit", onClick: () => go("new", "config") },
                  { label: t("page.import"), icon: "Upload", onClick: () => setImporting(true) },
                ]}
              />
            </div>
            <div style={s.search}>
              <Icon.Search size={13} style={s.searchIcon} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("page.searchPlaceholder")}
                aria-label={t("page.searchPlaceholder")}
                style={s.searchInput}
              />
            </div>
          </div>
          <div style={s.scroll}>
            {isLoading && (
              <>
                <Skeleton height={96} />
                <div style={{ height: 8 }} />
                <Skeleton height={96} />
              </>
            )}
            {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
            {skills && skills.length > 0 && list.length === 0 && <div style={s.muted}>{t("page.noMatch")}</div>}
            {list.map((skill) => (
              <SkillCard
                key={skill.id}
                skill={skill}
                stats={statsById.get(skill.id)}
                active={skill.id === selectedId}
                onClick={() => go(skill.id)}
                onToggle={(enabled) => update.mutate({ id: skill.id, patch: { enabled } })}
                onDelete={() => deleteSkill(skill)}
                deleting={del.isPending && del.variables === skill.id}
              />
            ))}
          </div>
        </aside>

        {selection.kind === "skill" || selection.kind === "new" ? (
          <SkillPanel
            key={selection.kind === "skill" ? selection.skill.id : "new"}
            skill={selection.kind === "skill" ? selection.skill : undefined}
            tab={tab}
            onTab={(next) => go(selection.kind === "skill" ? selection.skill.id : "new", next)}
            onCreated={(id) => go(id, "config")}
            onDeleted={() => go(null)}
          />
        ) : (
          <div style={s.empty}>
            {skills && skills.length === 0 ? (
              <EmptyState
                icon="Sparkles"
                title={t("page.empty.title")}
                body={t("page.empty.body")}
                cta={t("page.empty.cta")}
                onCta={() => go("new", "config")}
              />
            ) : (
              <EmptyState
                icon="Sparkles"
                title={selection.kind === "missing" ? t("page.notFound") : t("page.selectPrompt.title")}
                body={t("page.selectPrompt.body")}
              />
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
