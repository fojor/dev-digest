/* SkillsTab — the agent's skills: every workspace skill with a checkbox (link
   on/off for THIS agent) in prompt order. Drag (or Alt+↑/↓ on the handle) to
   reorder; earlier skills come earlier in the assembled prompt. Each change
   saves the whole ordered set; unchecked skills keep their position. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Checkbox, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { useAgentSkillLinks, useSetAgentSkills, useSkills } from "@/lib/hooks/skills";
import { SKILL_TYPE_COLOR } from "@/lib/skill-types";
import { filterRows, mergeRows, moveRow, toPayload, toggleRow, type SkillRow } from "./helpers";
import { s } from "./styles";

export function SkillsTab({ agentId }: { agentId: string }) {
  const t = useTranslations("agents");
  const ts = useTranslations("skills");
  const skills = useSkills();
  const links = useAgentSkillLinks(agentId);
  const setSkills = useSetAgentSkills(agentId);
  const [filter, setFilter] = React.useState("");
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [overIndex, setOverIndex] = React.useState<number | null>(null);

  if (skills.isLoading || links.isLoading) return <Skeleton height={240} />;
  if (skills.isError || links.isError || !skills.data || !links.data) {
    return <ErrorState body={t("skillsTab.loadError")} onRetry={() => void Promise.all([skills.refetch(), links.refetch()])} />;
  }

  const rows = mergeRows(skills.data, links.data);
  const visible = filterRows(rows, filter);
  const reorderable = visible.length === rows.length;
  const enabledCount = rows.filter((r) => r.checked).length;
  const save = (next: SkillRow[]) => setSkills.mutate(toPayload(next));
  const move = (from: number, to: number) => {
    const next = moveRow(rows, from, to);
    if (next !== rows) save(next);
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skillsTab.title")}</h2>
        <Badge color="var(--accent)">{t("skillsTab.enabledCount", { enabled: enabledCount, total: rows.length })}</Badge>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("skillsTab.filterPlaceholder")}
          aria-label={t("skillsTab.filterPlaceholder")}
          style={s.filter}
        />
      </div>
      <p style={s.hint}>{t("skillsTab.hint")}</p>

      {rows.length === 0 && (
        <p style={s.hint}>
          {t("skillsTab.empty")} <Link href="/skills">{t("skillsTab.goToSkills")}</Link>
        </p>
      )}
      {rows.length > 0 && visible.length === 0 && <p style={s.hint}>{t("skillsTab.noMatch")}</p>}

      <ul style={{ ...s.list, listStyle: "none", padding: 0, margin: 0 }} aria-label={t("skillsTab.title")}>
        {visible.map((row) => {
          const index = rows.indexOf(row);
          return (
            <li
              key={row.skill.id}
              data-testid="agent-skill-row"
              draggable={reorderable}
              onDragStart={(e) => {
                setDragIndex(index);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (dragIndex === null) return;
                e.preventDefault();
                setOverIndex(index);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null) move(dragIndex, index);
                setDragIndex(null);
                setOverIndex(null);
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
              style={s.row(dragIndex === index, overIndex === index && dragIndex !== index)}
            >
              <button
                type="button"
                aria-label={t("skillsTab.dragHandle", { name: row.skill.name })}
                disabled={!reorderable}
                onKeyDown={(e) => {
                  if (!e.altKey) return;
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    move(index, index - 1);
                  } else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    move(index, index + 1);
                  }
                }}
                style={s.handle(reorderable)}
              >
                <Icon.Menu size={15} />
              </button>
              <Checkbox
                checked={row.checked}
                onChange={() => save(toggleRow(rows, row.skill.id))}
                label={
                  <span className="mono" style={s.name}>
                    {row.skill.name}
                  </span>
                }
              />
              <span style={s.right}>
                {!row.skill.enabled && <span style={s.muted}>{t("skillsTab.globallyOff")}</span>}
                <Badge color={SKILL_TYPE_COLOR[row.skill.type]}>{ts(`type.${row.skill.type}`)}</Badge>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
