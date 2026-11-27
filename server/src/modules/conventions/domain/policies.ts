import type { AnalysedFile, NormalizedCandidate } from './types.js';

/**
 * Run limits and the style-config allow-list (spec §6, sad §8). Pure — the
 * token counter is passed in by the caller.
 */

export const RULE_MAX = 1000;
export const CATEGORY_MAX = 40;
/** Ranked sample files per run. */
export const SAMPLE_LIMIT = 12;
/** Each analysed file is cut to this many lines. */
export const LINE_LIMIT = 400;
/** Total model input budget (tokens). */
export const TOKEN_BUDGET = 40_000;
/** Candidates stored per run. */
export const STORE_LIMIT = 20;
/** The model call is aborted after this. */
export const MODEL_TIMEOUT_MS = 120_000;

/**
 * Root-level style configs a run may read (AC-24). Environment files,
 * package-manager auth files and CI files never match.
 */
const STYLE_CONFIGS: readonly RegExp[] = [
  /^\.eslintrc(?:\.[a-z]+)?$/,
  /^eslint\.config\.[a-z]+$/,
  /^tsconfig(?:\.[\w-]+)?\.json$/,
  /^\.prettierrc(?:\.[a-z]+)?$/,
  /^prettier\.config\.[a-z]+$/,
  /^\.editorconfig$/,
  /^biome\.json$/,
];

export function isAllowedStyleConfig(path: string): boolean {
  return STYLE_CONFIGS.some((re) => re.test(path));
}

export function truncateLines(content: string, max: number = LINE_LIMIT): string {
  const lines = content.split('\n');
  return lines.length <= max ? content : lines.slice(0, max).join('\n');
}

/** Keep the `limit` most confident candidates; ties keep the model's order. */
export function keepMostConfident<C extends NormalizedCandidate>(
  candidates: readonly C[],
  limit: number = STORE_LIMIT,
): { kept: C[]; discarded: number } {
  const ranked = candidates
    .map((c, i) => ({ c, i }))
    .sort((a, b) => b.c.confidence - a.c.confidence || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.c);
  return { kept: ranked, discarded: candidates.length - ranked.length };
}

/**
 * Fit the run's input into the token budget: while over, drop the lowest-ranked
 * sample file whole (files are given in rank order). Style configs and the
 * do-not-repeat list are never trimmed.
 */
export function fitBudget(
  files: readonly AnalysedFile[],
  doNotRepeat: string,
  countTokens: (text: string) => number,
  budget: number = TOKEN_BUDGET,
): AnalysedFile[] {
  const kept = [...files];
  const total = () => countTokens(doNotRepeat) + kept.reduce((n, f) => n + countTokens(f.content), 0);
  while (total() > budget) {
    let last = -1;
    for (let i = kept.length - 1; i >= 0; i--) {
      if (kept[i]!.kind === 'sample') {
        last = i;
        break;
      }
    }
    if (last < 0) break;
    kept.splice(last, 1);
  }
  return kept;
}
