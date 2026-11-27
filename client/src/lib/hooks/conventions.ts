/* hooks/conventions.ts — React Query hooks for the Conventions page
   (GET /repos/:id/conventions, POST …/extract, PATCH /conventions/:id). */
"use client";

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  ConventionCandidate,
  ConventionList,
  ConventionPatch,
  ExtractionResult,
} from "@devdigest/shared";

/** Query-options factories for the conventions domain (key + fetcher together). */
export const conventionQueries = {
  list: (repoId: string) =>
    queryOptions({
      queryKey: ["conventions", repoId] as const,
      queryFn: () => api.get<ConventionList>(`/repos/${repoId}/conventions`),
    }),
};

export function useConventions(repoId: string) {
  return useQuery(conventionQueries.list(repoId));
}

/** Run an extraction; the response is the full refreshed list (written to the cache). */
export function useExtractConventions(repoId: string) {
  const qc = useQueryClient();
  const key = conventionQueries.list(repoId).queryKey;
  return useMutation({
    mutationFn: () => api.post<ExtractionResult>(`/repos/${repoId}/conventions/extract`),
    onSuccess: ({ new_count: _n, ...list }) => qc.setQueryData(key, list),
    onError: () => qc.invalidateQueries({ queryKey: key }),
  });
}

/** Accept / reject / edit one candidate; the updated row replaces the cached one. */
export function usePatchConvention(repoId: string) {
  const qc = useQueryClient();
  const key = conventionQueries.list(repoId).queryKey;
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ConventionPatch }) =>
      api.patch<ConventionCandidate>(`/conventions/${id}`, patch),
    onSuccess: (updated) =>
      qc.setQueryData(key, (old: ConventionList | undefined) =>
        old ? { ...old, candidates: old.candidates.map((c) => (c.id === updated.id ? updated : c)) } : old,
      ),
    onError: () => qc.invalidateQueries({ queryKey: key }),
  });
}
