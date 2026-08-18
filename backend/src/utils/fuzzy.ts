/**
 * Bounded Levenshtein distance. Returns a 0–1 similarity ratio.
 */
export function stringSimilarity(a: string, b: string): number {
  if (a === b) {
    return 1;
  }
  if (a.length === 0 || b.length === 0) {
    return 0;
  }

  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i += 1) {
    const row = matrix[i];
    if (row) {
      row[0] = i;
    }
  }
  const firstRow = matrix[0];
  if (firstRow) {
    for (let j = 0; j < cols; j += 1) {
      firstRow[j] = j;
    }
  }

  for (let i = 1; i < rows; i += 1) {
    const row = matrix[i];
    const prev = matrix[i - 1];
    if (!row || !prev) {
      continue;
    }
    for (let j = 1; j < cols; j += 1) {
      const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
      const deletion = (prev[j] ?? Number.POSITIVE_INFINITY) + 1;
      const insertion = (row[j - 1] ?? Number.POSITIVE_INFINITY) + 1;
      const substitution = (prev[j - 1] ?? Number.POSITIVE_INFINITY) + cost;
      row[j] = Math.min(deletion, insertion, substitution);
    }
  }

  const distance = matrix[a.length]?.[b.length] ?? Math.max(a.length, b.length);
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - distance / maxLen;
}
