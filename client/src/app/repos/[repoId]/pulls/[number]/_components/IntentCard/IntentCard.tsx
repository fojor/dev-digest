"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon, SectionLabel, Skeleton } from "@devdigest/ui";
import { useClassifyIntent, usePrIntent } from "@/lib/hooks/intent";
import { IntentSources } from "./_components/IntentSources";
import { cardState, confidenceTone, sourceReasonKey } from "./helpers";
import { s } from "./styles";

/** PR intent card: what the system understood the PR is for, with a way to re-classify. */
export function IntentCard({ prId }: { prId: string | null }) {
  const t = useTranslations("intent");
  const { data } = usePrIntent(prId);
  const classify = useClassifyIntent(prId);
  const view = cardState(data, classify.isPending);
  const intent = data?.intent ?? null;
  const run = () => classify.mutate();

  const header = <SectionLabel icon="Sparkles">{t("title")}</SectionLabel>;

  if (view.state === "classifying") {
    return (
      <section style={s.card} aria-busy="true">
        {header}
        <Skeleton height={14} width="80%" />
        <Skeleton height={14} width="60%" />
        <span style={s.muted}>{t("classifying")}</span>
      </section>
    );
  }

  if (view.state === "none" || !intent) {
    return (
      <section style={s.card}>
        {header}
        <div style={s.muted}>{t("notClassified")}</div>
        <div style={s.notice}>{t("notClassifiedHint")}</div>
        <div>
          <Button kind="primary" size="sm" icon="Sparkles" disabled={!prId} onClick={run}>
            {t("classify")}
          </Button>
        </div>
      </section>
    );
  }

  if (view.state === "failed") {
    return (
      <section style={s.card}>
        {header}
        <div style={s.notice}>
          {t("failed")} {intent.error ? `(${t(sourceReasonKey(intent.error))})` : null}
        </div>
        <div>
          <Button kind="secondary" size="sm" icon="RefreshCw" onClick={run}>
            {t("retry")}
          </Button>
        </div>
      </section>
    );
  }

  const tone = confidenceTone(intent.confidence);
  return (
    <section style={s.card}>
      <div style={s.headerRow}>
        {header}
        <Badge color={tone.color} bg={tone.bg}>
          {t(`confidence.${intent.confidence}`)}
        </Badge>
        {view.stale && (
          <Badge icon="AlertTriangle" color="var(--warn, var(--text-secondary))">
            {t("staleBadge")}
          </Badge>
        )}
        <span style={s.spacer} />
        {view.stale && (
          <Button kind="primary" size="sm" icon="RefreshCw" onClick={run}>
            {t("reclassify")}
          </Button>
        )}
      </div>

      <blockquote style={s.summary}>{intent.summary}</blockquote>

      <div style={s.columns}>
        <div>
          <div style={s.colTitle}>
            <Icon.Check size={13} />
            {t("inScope")}
          </div>
          {intent.in_scope.length > 0 ? (
            <ul style={s.list}>
              {intent.in_scope.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          ) : (
            <span style={s.muted}>{t("nothingStated")}</span>
          )}
        </div>
        <div>
          <div style={s.colTitle}>
            <Icon.X size={13} />
            {t("outOfScope")}
          </div>
          {intent.out_of_scope.length > 0 ? (
            <ul style={s.list}>
              {intent.out_of_scope.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          ) : (
            <span style={s.muted}>{t("nothingStated")}</span>
          )}
        </div>
      </div>

      {view.stale && <div style={s.notice}>{t("staleHint")}</div>}
      {view.lowConfidence && <div style={s.notice}>{t("lowConfidenceNotice")}</div>}
      {!view.filterActive && !view.lowConfidence && !view.stale && <div style={s.notice}>{t("filterOff")}</div>}

      {intent.sources.length > 0 && <IntentSources sources={intent.sources} />}

      <div style={s.footer}>
        <span>
          {t("classifiedBy", {
            model: intent.model ?? "—",
            time: new Date(intent.classified_at).toLocaleString(),
          })}
        </span>
        <span style={s.spacer} />
        {!view.stale && (
          <Button kind="ghost" size="sm" icon="RefreshCw" onClick={run}>
            {t("reclassify")}
          </Button>
        )}
      </div>
    </section>
  );
}
