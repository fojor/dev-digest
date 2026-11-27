import { githubBlobUrl } from "@/lib/github-urls";

/**
 * GitHub link to the evidence lines, pinned to the commit the fragment was
 * verified at; falls back to the default branch when the commit is unknown
 * (lines may have moved there). null when the repo is not known yet.
 */
export function evidenceUrl(
  repo: { full_name: string; default_branch: string } | null | undefined,
  e: { path: string; startLine: number; endLine: number; commitSha: string | null },
): string | null {
  if (!repo) return null;
  return githubBlobUrl(repo.full_name, e.commitSha ?? repo.default_branch, e.path, e.startLine, e.endLine);
}

/** «path:25» for a single line, «path:3-5» for a range. */
export function evidenceLocation(path: string, startLine: number, endLine: number): string {
  return startLine === endLine ? `${path}:${startLine}` : `${path}:${startLine}-${endLine}`;
}
