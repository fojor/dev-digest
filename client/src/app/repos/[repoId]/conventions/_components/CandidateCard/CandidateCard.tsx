/* One candidate convention on SCR-01: rule (inline edit), category, status,
   evidence, confidence, Accept / Reject (flow 4). Read-only while scanning. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { ConventionCandidate, ConventionPatch } from "@devdigest/shared";
import { RULE_MAX } from "./constants";
import { Badge, Button, Chip, ProgressBar, Textarea } from "@devdigest/ui";
import { usePatchConvention } from "@/lib/hooks/conventions";
import { useToast } from "@/lib/toast";
import { EvidenceSnippet } from "../EvidenceSnippet";
import { errorKey } from "../ConventionsView/helpers";
import { confidencePct, validRule } from "./helpers";
import { s } from "./styles";

export function CandidateCard({
  repoId,
  candidate: c,
  readOnly,
}: {
  repoId: string;
  candidate: ConventionCandidate;
  readOnly?: boolean;
}) {
  const t = useTranslations("conventions");
  const patch = usePatchConvention(repoId);
  const toast = useToast();
  const [draft, setDraft] = React.useState<string | null>(null);
  const [invalid, setInvalid] = React.useState(false);
  const locked = readOnly || patch.isPending;

  const send = (p: ConventionPatch, onDone?: () => void) =>
    patch.mutate(
      { id: c.id, patch: p },
      {
        onSuccess: () => onDone?.(),
        onError: (e: unknown) => toast.error(t(`errors.${errorKey(e)}`)),
      },
    );

  const save = () => {
    const rule = validRule(draft ?? "");
    if (rule === null) {
      setInvalid(true);
      return;
    }
    send({ rule }, () => setDraft(null));
  };

  const cancelEdit = () => {
    setDraft(null);
    setInvalid(false);
  };

  const pct = confidencePct(c.confidence);

  return (
    <div data-testid="candidate-card" data-status={c.status} style={s.card(c.status)}>
      <div style={s.top}>
        {draft === null ? (
          <button
            type="button"
            style={s.rule}
            aria-label={t("card.editRule")}
            disabled={locked}
            onClick={() => setDraft(c.rule)}
          >
            {c.rule}
          </button>
        ) : (
          <div style={{ flex: 1 }}>
            <Textarea value={draft} onChange={(v) => (setDraft(v), setInvalid(false))} rows={3} />
            <div style={s.editFooter}>
              {invalid && <span style={s.fieldError}>{t("card.ruleLimit", { max: RULE_MAX })}</span>}
              <span style={s.counter}>{t("card.counter", { n: draft.length, max: RULE_MAX })}</span>
              <Button size="sm" onClick={cancelEdit}>
                {t("card.cancel")}
              </Button>
              <Button size="sm" kind="primary" onClick={save} disabled={locked}>
                {t("card.save")}
              </Button>
            </div>
          </div>
        )}
        {draft === null && (
          <div style={s.actions}>
            <Button
              size="sm"
              icon="Check"
              kind={c.status === "accepted" ? "primary" : "secondary"}
              disabled={locked}
              onClick={() => c.status !== "accepted" && send({ status: "accepted" })}
            >
              {t("card.accept")}
            </Button>
            <Button
              size="sm"
              icon="X"
              kind={c.status === "rejected" ? "danger" : "secondary"}
              disabled={locked}
              onClick={() => c.status !== "rejected" && send({ status: "rejected" })}
            >
              {t("card.reject")}
            </Button>
          </div>
        )}
      </div>
      <div style={s.tags}>
        <Chip>{c.category}</Chip>
        {c.status === "accepted" && <Badge icon="Check" color="var(--accent)">{t("card.accepted")}</Badge>}
        {c.status === "rejected" && <Badge icon="X" color="var(--crit)">{t("card.rejected")}</Badge>}
      </div>
      <EvidenceSnippet
        path={c.evidence_path}
        startLine={c.evidence_start_line}
        endLine={c.evidence_end_line}
        fragment={c.evidence_snippet}
      />
      <div style={s.confidence}>
        <div style={{ flex: 1 }}>
          <ProgressBar value={pct} />
        </div>
        <span className="mono tnum">{t("card.confidencePct", { pct })}</span>
      </div>
    </div>
  );
}
