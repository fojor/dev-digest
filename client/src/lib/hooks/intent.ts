/* hooks/intent.ts — React Query hooks for the PR intent card
   (GET /pulls/:id/intent, POST /pulls/:id/intent/classify). */
"use client";

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { notify } from "../toast";
import type { PrIntentResponse } from "@devdigest/shared";

/** Query-options factories for the intent domain (key + fetcher together). */
export const intentQueries = {
  forPull: (prId: string) =>
    queryOptions({
      queryKey: ["pr-intent", prId] as const,
      queryFn: () => api.get<PrIntentResponse>(`/pulls/${prId}/intent`),
    }),
};

/** The PR's stored intent; polls every 3 s only while a classification is running. */
export function usePrIntent(prId: string | null) {
  return useQuery({
    ...intentQueries.forPull(prId ?? ""),
    enabled: !!prId,
    refetchInterval: (q) => (q.state.data?.classifying ? 3000 : false),
  });
}

/** Classify (or re-classify) now; the response replaces the cached intent. */
export function useClassifyIntent(prId: string | null) {
  const qc = useQueryClient();
  const key = intentQueries.forPull(prId ?? "").queryKey;
  return useMutation({
    mutationFn: () => api.post<PrIntentResponse>(`/pulls/${prId}/intent/classify`),
    onSuccess: (res) => qc.setQueryData(key, res),
    onError: (err) => {
      qc.invalidateQueries({ queryKey: key });
      notify.error(err instanceof Error ? err.message : String(err));
    },
  });
}
