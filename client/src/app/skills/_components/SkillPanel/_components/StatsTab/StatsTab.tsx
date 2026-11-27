/* StatsTab — the skill's usage over the last 30 days: tiles (used by, pull
   frequency, accept rate + ring, findings), the agents that have it enabled
   (Open → their Skills tab) and a donut of attributed findings per category.
   Every number comes from GET /skills/:id/stats; "—" means no data. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, CircularScore, ErrorState, Skeleton } from "@devdigest/ui";
import type { SkillCategoryCount } from "@devdigest/shared";
import { useSkillStats } from "@/lib/hooks/skills";
import { formatRate } from "@/app/skills/helpers";
import { CATEGORY_COLOR, DONUT_SIZE, DONUT_STROKE, FALLBACK_COLOR, KNOWN_CATEGORIES } from "./constants";
import { acceptScore, donutArcs } from "./helpers";
import { s } from "./styles";

export function StatsTab({ skillId }: { skillId: string }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useSkillStats(skillId);

  if (isLoading) return <Skeleton height={120} />;
  if (isError || !data) return <ErrorState body={t("stats.loadError")} onRetry={() => refetch()} />;

  const days = data.window_days;
  const score = acceptScore(data.accept_rate);
  const categoryLabel = (c: string) =>
    (KNOWN_CATEGORIES as readonly string[]).includes(c) ? t(`stats.category.${c}`) : c;

  return (
    <div>
      <p style={s.window}>{t("stats.window", { days })}</p>
      <div style={s.tiles}>
        <div style={s.tile}>
          <div style={s.tileLabel}>{t("stats.usedBy")}</div>
          <div style={s.tileRow}>
            <span className="tnum" style={s.tileValue}>
              {t("stats.usedByValue", { count: data.used_by })}
            </span>
          </div>
        </div>
        <div style={s.tile}>
          <div style={s.tileLabel}>{t("stats.pull")}</div>
          <div style={s.tileRow}>
            <span className="tnum" style={s.tileValue}>
              {formatRate(data.pull_rate)}
            </span>
          </div>
          <div className="tnum" style={s.tileSub}>
            {t("stats.pullRuns", { with: data.runs_with_skill, total: data.runs_total })}
          </div>
        </div>
        <div style={s.tile}>
          <div style={s.tileLabel}>{t("stats.accept")}</div>
          <div style={s.tileRow}>
            {score != null && <CircularScore score={score} size={40} />}
            <span className="tnum" style={s.tileValue}>
              {formatRate(data.accept_rate)}
            </span>
          </div>
          <div style={s.tileSub}>{t("stats.acceptHint")}</div>
        </div>
        <div style={s.tile}>
          <div style={s.tileLabel}>{t("stats.findings", { days })}</div>
          <div style={s.tileRow}>
            <span className="tnum" style={s.tileValue}>
              {data.findings}
            </span>
          </div>
        </div>
      </div>

      <section style={s.section}>
        <h3 style={s.sectionTitle}>{t("stats.agentsTitle")}</h3>
        {data.agents.length === 0 ? (
          <div style={s.muted}>{t("stats.agentsEmpty")}</div>
        ) : (
          data.agents.map((a) => (
            <div key={a.id} style={s.agentRow}>
              <span style={s.agentName}>{a.name}</span>
              <Button
                kind="ghost"
                size="sm"
                iconRight="ArrowRight"
                onClick={() => router.push(`/agents/${a.id}?tab=skills`)}
              >
                {t("stats.open")}
              </Button>
            </div>
          ))
        )}
      </section>

      <section style={s.section}>
        <h3 style={s.sectionTitle}>{t("stats.categoriesTitle")}</h3>
        <CategoryDonut
          categories={data.categories}
          label={categoryLabel}
          empty={t("stats.categoriesEmpty", { days })}
        />
      </section>
    </div>
  );
}

/** Ring of finding counts per category with a legend; non-zero only. */
function CategoryDonut({
  categories,
  label,
  empty,
}: {
  categories: SkillCategoryCount[];
  label: (category: string) => string;
  empty: string;
}) {
  const r = (DONUT_SIZE - DONUT_STROKE) / 2;
  const circ = 2 * Math.PI * r;
  const arcs = donutArcs(categories, circ);
  if (arcs.length === 0) return <div style={s.muted}>{empty}</div>;
  const color = (c: string) => CATEGORY_COLOR[c] ?? FALLBACK_COLOR;
  return (
    <div style={s.donutRow}>
      <svg width={DONUT_SIZE} height={DONUT_SIZE} style={{ transform: "rotate(-90deg)" }} aria-hidden="true">
        {arcs.map((a) => (
          <circle
            key={a.category}
            cx={DONUT_SIZE / 2}
            cy={DONUT_SIZE / 2}
            r={r}
            fill="none"
            stroke={color(a.category)}
            strokeWidth={DONUT_STROKE}
            strokeDasharray={`${a.length} ${circ - a.length}`}
            strokeDashoffset={a.offset}
          />
        ))}
      </svg>
      <ul style={{ ...s.legend, listStyle: "none", padding: 0, margin: 0 }}>
        {arcs.map((a) => (
          <li key={a.category} style={s.legendRow}>
            <span style={s.swatch(color(a.category))} />
            <span style={s.legendLabel}>{label(a.category)}</span>
            <span className="mono tnum" style={s.legendValue}>
              {a.count}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
