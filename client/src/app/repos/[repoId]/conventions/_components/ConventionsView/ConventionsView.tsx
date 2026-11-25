/* Conventions page — /repos/:repoId/conventions (SCR-01). Lists the repo's
   candidate conventions with scan facts, runs extraction / re-scan (with the
   SCR-02 confirmation) and opens the Create skill modal (SCR-03). */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ExtractionResult } from "@devdigest/shared";
import { Button, Card, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { useConventions, useExtractConventions } from "@/lib/hooks/conventions";
import { useToast } from "@/lib/toast";
import { RescanConfirm } from "../RescanConfirm";
import { acceptedCount, errorKey, isRepoNotFound, pendingStats, scanAgo } from "./helpers";
import { s } from "./styles";

const SKELETON_CARDS = 3;

export function ConventionsView() {
  const t = useTranslations("conventions");
  const tShell = useTranslations("shell");
  const { repoId } = useParams<{ repoId: string }>();
  const { repos } = useActiveRepo();
  const repoMissing = useRepoNotFound(repoId);
  const { data, isLoading, isError, error, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const toast = useToast();

  const [confirming, setConfirming] = React.useState(false);
  const [runError, setRunError] = React.useState<unknown>(null);

  const repoName = repos.find((r) => r.id === repoId)?.full_name ?? t("page.repoFallback");
  const crumb = [{ label: repoName, mono: true }, { label: tShell("nav.conventions") }];

  const startRun = () => {
    setConfirming(false);
    setRunError(null);
    extract.mutate(undefined, {
      onSuccess: (r: ExtractionResult) => {
        if (r.new_count === 0 && r.candidates.length > 0) toast.info(t("page.noNew"));
      },
      onError: (e: unknown) => setRunError(e),
    });
  };

  if (repoMissing || (isError && isRepoNotFound(error))) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const candidates = data?.candidates ?? [];
  const scanning = Boolean(data?.scanning) || extract.isPending;
  const accepted = acceptedCount(candidates);
  const { pending, edited } = pendingStats(candidates);

  const onRescan = () => (pending > 0 ? setConfirming(true) : startRun());

  const errorBanner = runError ? (
    <div style={s.banner}>
      <ErrorState
        title={t("page.extractionFailed")}
        body={`${t(`errors.${errorKey(runError)}`)} ${t("page.candidatesUnchanged")}`}
        onRetry={startRun}
      />
    </div>
  ) : null;

  const body = (() => {
    if (isLoading) {
      return (
        <div data-testid="conventions-loading" aria-busy="true" style={s.list}>
          {Array.from({ length: SKELETON_CARDS }).map((_, i) => (
            <Skeleton key={i} height={96} />
          ))}
        </div>
      );
    }
    if (isError) {
      return <ErrorState title={t("page.loadError")} onRetry={() => refetch()} fullScreen />;
    }
    if (candidates.length === 0) {
      return (
        <>
          {errorBanner}
          <EmptyState
            icon="ListChecks"
            title={t("page.empty.title")}
            body={data?.scan ? t("page.empty.noneVerified") : t("page.empty.body")}
            cta={scanning ? t("page.scanning") : t("page.empty.cta")}
            onCta={scanning ? undefined : startRun}
            ctaLoading={scanning}
          />
        </>
      );
    }
    return (
      <>
        {errorBanner}
        <div style={s.list}>
          {candidates.map((c) => (
            <Card key={c.id} pad>
              <p style={s.rule}>{c.rule}</p>
            </Card>
          ))}
        </div>
      </>
    );
  })();

  return (
    <AppShell crumb={crumb}>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.title}>
            {t("page.headingPrefix")}
            <span className="mono">{repoName}</span>
          </h1>
          <p style={s.subtitle}>
            {data?.scan
              ? t("page.scanFacts", {
                  count: data.scan.sample_count,
                  ago: (() => {
                    const a = scanAgo(data.scan.scanned_at, Date.now());
                    return t(`ago.${a.key}`, { n: a.n });
                  })(),
                })
              : t("page.subtitle")}
          </p>
        </div>
        {candidates.length > 0 && (
          <div style={s.actions}>
            <span style={s.accepted}>{t("page.acceptedOf", { accepted, total: candidates.length })}</span>
            <Button icon="RefreshCw" onClick={onRescan} disabled={scanning} loading={scanning}>
              {scanning ? t("page.scanning") : t("page.rescan")}
            </Button>
            <Button kind="primary" icon="Sparkles" disabled={scanning || accepted === 0}>
              {t("page.createSkill")}
            </Button>
            {accepted === 0 && <span style={s.hint}>{t("page.createSkillUnavailable")}</span>}
          </div>
        )}
      </div>
      {body}
      {confirming && (
        <RescanConfirm pending={pending} edited={edited} onCancel={() => setConfirming(false)} onConfirm={startRun} />
      )}
    </AppShell>
  );
}
