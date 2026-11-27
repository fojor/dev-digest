/**
 * Evidence verification (AC-05, sad §8). Pure: works on the buffers read for
 * this run, never re-reads the disk. A candidate is kept only when
 *   - its path is exactly one of the analysed files (no traversal, no aliasing),
 *   - the fragment occurs in that file ignoring whitespace / line-ending
 *     differences, and
 *   - the matched span covers at least one complete non-blank line.
 * The recorded line range is that of the fragment's first occurrence.
 */

export type VerifyResult =
  | { ok: true; startLine: number; endLine: number }
  | { ok: false; reason: 'not_analysed' | 'fragment_absent' | 'partial_line' };

interface Normalized {
  text: string;
  /** 1-based source line of each char in `text`. */
  lineOf: number[];
  /** Per source line (index = line - 1): [first, last] index in `text` of its non-blank chars, or null. */
  lineSpan: Array<[number, number] | null>;
}

const WS = /\s/;

/** Collapse every whitespace run (incl. CR/LF) to one space; trim the ends. */
function normalize(src: string): Normalized {
  let text = '';
  const lineOf: number[] = [];
  const lineSpan: Array<[number, number] | null> = [null];
  let line = 1;
  let pendingSpace = false;
  for (const ch of src) {
    if (ch === '\n') {
      line++;
      lineSpan.push(null);
    }
    if (WS.test(ch)) {
      pendingSpace = text.length > 0;
      continue;
    }
    if (pendingSpace) {
      text += ' ';
      lineOf.push(line);
      pendingSpace = false;
    }
    const idx = text.length;
    text += ch;
    lineOf.push(line);
    const span = lineSpan[line - 1];
    if (span) span[1] = idx;
    else lineSpan[line - 1] = [idx, idx];
  }
  return { text, lineOf, lineSpan };
}

export function verifyEvidence(
  evidence: { path: string; snippet: string },
  analysed: ReadonlyMap<string, string>,
): VerifyResult {
  const content = analysed.get(evidence.path);
  if (content === undefined) return { ok: false, reason: 'not_analysed' };

  const needle = normalize(evidence.snippet).text;
  if (!needle) return { ok: false, reason: 'partial_line' };
  const hay = normalize(content);
  const start = hay.text.indexOf(needle);
  if (start < 0) return { ok: false, reason: 'fragment_absent' };
  const end = start + needle.length - 1;

  const startLine = hay.lineOf[start]!;
  const endLine = hay.lineOf[end]!;
  for (let l = startLine; l <= endLine; l++) {
    const span = hay.lineSpan[l - 1];
    if (span && span[0] >= start && span[1] <= end) {
      return { ok: true, startLine, endLine };
    }
  }
  return { ok: false, reason: 'partial_line' };
}
