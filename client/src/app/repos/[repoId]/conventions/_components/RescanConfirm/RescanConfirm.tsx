/* SCR-02 — confirm that a re-scan replaces the pending candidates (AC-14). */
"use client";

import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";

export function RescanConfirm({
  pending,
  edited,
  onCancel,
  onConfirm,
}: {
  pending: number;
  edited: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("conventions.rescanConfirm");
  return (
    <Modal
      width={480}
      title={t("title")}
      onClose={onCancel}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <Button onClick={onCancel}>{t("cancel")}</Button>
          <Button kind="primary" icon="RefreshCw" onClick={onConfirm}>
            {t("confirm")}
          </Button>
        </div>
      }
    >
      <div style={{ padding: "18px 24px", fontSize: 14, lineHeight: 1.5 }}>
        <p style={{ margin: 0 }}>{edited > 0 ? t("body", { pending, edited }) : t("bodyNoEdits", { pending })}</p>
        <p style={{ margin: "8px 0 0", color: "var(--text-secondary)" }}>{t("keepHint")}</p>
      </div>
    </Modal>
  );
}
