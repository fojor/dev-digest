/* hooks/skills.ts — React Query hooks for the M2 Skills page, skill editor,
   import preview and the agent editor's Skills tab (per-agent links). */
"use client";

import React from "react";
import { keepPreviousData, queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { agentQueries } from "./agents";
import type {
  AgentSkillLink,
  Skill,
  SkillImportPreview,
  SkillStats,
  SkillStatsSummary,
  SkillTokens,
  SkillType,
  SkillVersion,
} from "@devdigest/shared";

/** Query-options factories for the skills domain (key + fetcher together). */
export const skillQueries = {
  list: () =>
    queryOptions({
      queryKey: ["skills"] as const,
      queryFn: () => api.get<Skill[]>("/skills"),
    }),
  /** Per-card numbers for every skill — ONE request for the whole list. */
  statsSummary: () =>
    queryOptions({
      queryKey: ["skills", "stats"] as const,
      queryFn: () => api.get<SkillStatsSummary[]>("/skills/stats"),
    }),
  /** The Stats tab of one skill (30-day window). */
  stats: (id: string) =>
    queryOptions({
      queryKey: ["skills", id, "stats"] as const,
      queryFn: () => api.get<SkillStats>(`/skills/${id}/stats`),
    }),
  /** Version history of one skill, newest first. */
  versions: (id: string) =>
    queryOptions({
      queryKey: ["skills", id, "versions"] as const,
      queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    }),
  /** Ordered links of one agent (with the per-agent enabled flag). */
  agentLinks: (agentId: string) =>
    queryOptions({
      queryKey: ["agent-skills", agentId] as const,
      queryFn: () => api.get<AgentSkillLink[]>(`/agents/${agentId}/skills`),
    }),
};

export function useSkills() {
  return useQuery(skillQueries.list());
}

export function useSkillStatsSummary() {
  return useQuery(skillQueries.statsSummary());
}

export function useSkillStats(id: string) {
  return useQuery(skillQueries.stats(id));
}

export function useSkillVersions(id: string) {
  return useQuery(skillQueries.versions(id));
}

/** Delay a fast-changing value (keystrokes) until it settles for `ms`. */
function useDebouncedValue<T>(value: T, ms: number): T {
  const [settled, setSettled] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return settled;
}

/** Debounce for the editor's live token count. */
export const SKILL_TOKENS_DEBOUNCE_MS = 400;

/**
 * Tokens the draft's prompt block adds (server tokenizer — the same number a run
 * records in run_skills.tokens). Debounced; keeps the last count while typing.
 */
export function useSkillTokens(draft: { name: string; description: string; body: string }) {
  const settled = useDebouncedValue(
    { name: draft.name, description: draft.description, body: draft.body },
    SKILL_TOKENS_DEBOUNCE_MS,
  );
  return useQuery({
    queryKey: ["skills", "tokens", settled.name, settled.description, settled.body] as const,
    queryFn: () => api.post<SkillTokens>("/skills/tokens", settled),
    enabled: settled.body.trim().length > 0,
    placeholderData: keepPreviousData,
    staleTime: Infinity,
  });
}

export interface SkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  enabled?: boolean;
  /** "imported" when saved from the import preview. */
  source?: "manual" | "imported";
  /** File the import preview read (recorded in the first version's note). */
  source_file?: string;
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SkillInput) => api.post<Skill>("/skills", input),
    // ["skills"] is the prefix of the list, stats and versions keys.
    onSuccess: () => qc.invalidateQueries({ queryKey: skillQueries.list().queryKey }),
  });
}

export interface UpdateSkillInput {
  id: string;
  patch: Partial<Pick<Skill, "name" | "description" | "type" | "body" | "enabled">> & {
    /** Optional "What changed?" note for the version a content edit records. */
    note?: string;
  };
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateSkillInput) => api.put<Skill>(`/skills/${id}`, patch),
    // Prefix ["skills"]: list, card stats, and this skill's versions/stats.
    onSuccess: () => qc.invalidateQueries({ queryKey: skillQueries.list().queryKey }),
  });
}

/** Restore an old version: the server appends a NEW version with that content. */
export function useRestoreSkillVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      api.post<Skill>(`/skills/${id}/versions/${version}/restore`),
    onSuccess: () => qc.invalidateQueries({ queryKey: skillQueries.list().queryKey }),
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: skillQueries.list().queryKey });
      // Links cascade server-side; every agent's link list (and skill count) may have changed.
      qc.invalidateQueries({ queryKey: ["agent-skills"] });
      qc.invalidateQueries({ queryKey: agentQueries.list().queryKey });
    },
  });
}

/** Parse an uploaded .md / .zip into a preview. Stores nothing. */
export function useImportPreview() {
  return useMutation({
    mutationFn: (input: { filename: string; content_base64: string }) =>
      api.post<SkillImportPreview>("/skills/import/preview", input),
  });
}

export function useAgentSkillLinks(agentId: string) {
  return useQuery(skillQueries.agentLinks(agentId));
}

/** Replace an agent's ordered skill set; position = list index. */
export function useSetAgentSkills(agentId: string) {
  const qc = useQueryClient();
  const key = skillQueries.agentLinks(agentId).queryKey;
  return useMutation({
    mutationFn: (skills: { skill_id: string; enabled: boolean }[]) =>
      api.post<AgentSkillLink[]>(`/agents/${agentId}/skills`, { skills }),
    // Optimistic: the tab reorders / toggles instantly; rolled back on error.
    onMutate: async (skills) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData(key);
      qc.setQueryData(
        key,
        skills.map((s, order) => ({ agent_id: agentId, skill_id: s.skill_id, enabled: s.enabled, order })),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(key, ctx?.previous),
    onSuccess: (data) => {
      qc.setQueryData(key, data);
      // "N agents" on the skill cards and "N skills" on the agent cards count enabled links.
      qc.invalidateQueries({ queryKey: skillQueries.statsSummary().queryKey });
      qc.invalidateQueries({ queryKey: agentQueries.list().queryKey });
    },
  });
}
