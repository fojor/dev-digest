import type { NameMatch } from "../../helpers";
import { BODY_MAX, DESCRIPTION_MAX, NAME_MAX, SLUG } from "./constants";

export interface DraftFields {
  name: string;
  description: string;
  body: string;
}

/** Field → message key under `modal.errors.*` (+ values). Empty = valid. */
export type FieldErrors = Partial<Record<keyof DraftFields, { key: string; values?: Record<string, string | number> }>>;

/** Validate the modal's fields (AC-17) and the name clash rule (AC-20). Pure. */
export function validateDraft(d: DraftFields, match: NameMatch): FieldErrors {
  const e: FieldErrors = {};
  const name = d.name.trim();
  if (!name) e.name = { key: "nameRequired" };
  else if (name.length > NAME_MAX) e.name = { key: "nameMax", values: { max: NAME_MAX } };
  else if (!SLUG.test(name)) e.name = { key: "nameSlug" };
  else if (match.kind === "blocked") e.name = { key: "nameTaken", values: { name } };

  const description = d.description.trim();
  if (!description) e.description = { key: "descriptionRequired" };
  else if (description.length > DESCRIPTION_MAX) e.description = { key: "descriptionMax", values: { max: DESCRIPTION_MAX } };

  if (!d.body.trim()) e.body = { key: "bodyRequired" };
  else if (d.body.length > BODY_MAX) e.body = { key: "bodyMax", values: { max: BODY_MAX } };
  return e;
}
