/**
 * Hunk headers only: lines of a unified-diff patch that start with `@@`.
 * Body lines (context, `+`, `-`) are never returned.
 */
export function hunkHeaders(patch: string, perFile: number, maxChars: number): string[] {
  const out: string[] = [];
  for (const line of patch.split('\n')) {
    if (out.length >= perFile) break;
    if (line.startsWith('@@')) out.push(line.slice(0, maxChars).trimEnd());
  }
  return out;
}
