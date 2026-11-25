/** «path:25» for a single line, «path:3-5» for a range. */
export function evidenceLocation(path: string, startLine: number, endLine: number): string {
  return startLine === endLine ? `${path}:${startLine}` : `${path}:${startLine}-${endLine}`;
}
