/** 1-based line numbers for the gutter (an empty body still shows line 1). */
export function lineNumbers(text: string): number[] {
  const count = text.split("\n").length;
  return Array.from({ length: count }, (_, i) => i + 1);
}
