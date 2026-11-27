/* SkillCard — one skill in the Skills list: name, global enabled switch,
   description, type + source, and the usage row (`N agents · P% pull ·
   A% accept`) from the page's ONE batch stats request. A disabled skill never
   reaches any agent's prompt. The trash icon only reports intent (`onDelete`);
   the view owns the confirm, the mutation and the selection reset. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, Toggle } from "@devdigest/ui";
import type { Skill, SkillStatsSummary } from "@devdigest/shared";
import { SKILL_TYPE_COLOR } from "@/lib/skill-types";
import { formatRate } from "@/app/skills/helpers";
import { s } from "./styles";

export function SkillCard({
  skill,
  stats,
  active,
  onClick,
  onToggle,
  onDelete,
  deleting = false,
}: {
  skill: Skill;
  /** Undefined while loading / when the batch has no row for the skill. */
  stats?: SkillStatsSummary;
  active?: boolean;
  onClick: () => void;
  onToggle: (enabled: boolean) => void;
  /** Called when the trash icon is used; omitted → no delete control. */
  onDelete?: () => void;
  /** The delete request for this skill is in flight. */
  deleting?: boolean;
}) {
  const t = useTranslations("skills");
  const color = SKILL_TYPE_COLOR[skill.type];
  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={active ? "true" : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      style={s.card(!!active, skill.enabled)}
    >
      <div style={s.headerRow}>
        <span style={s.iconBox(color)}>
          <Icon.Sparkles size={14} />
        </span>
        <span className="mono" style={s.name}>
          {skill.name}
        </span>
        <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} title={t("card.enable")}>
          <Toggle on={skill.enabled} onChange={onToggle} size={14} />
        </span>
        {onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            // The card itself selects on Enter/Space; keep those keys on the button.
            onKeyDown={(e) => e.stopPropagation()}
            disabled={deleting}
            title={t("card.delete")}
            aria-label={t("card.delete")}
            style={s.deleteButton(deleting)}
          >
            <Icon.Trash size={14} style={deleting ? s.spinning : undefined} />
          </button>
        )}
      </div>
      <div style={s.description}>{skill.description || t("card.noDescription")}</div>
      <div style={s.metaRow}>
        <Badge color={color}>{t(`type.${skill.type}`)}</Badge>
        <span style={s.source}>{t(`card.source.${skill.source}`)}</span>
      </div>
      <div className="tnum" style={s.stats}>
        {stats
          ? t("card.stats", {
              agents: stats.used_by,
              pull: formatRate(stats.pull_rate),
              accept: formatRate(stats.accept_rate),
            })
          : t("card.statsUnknown")}
      </div>
    </div>
  );
}
