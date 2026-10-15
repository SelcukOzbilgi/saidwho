// How many times less a run cost than the same calls at Ultra's prices, as a
// whole number. Null when Ultra's figure is unknown or the run cost nothing, and
// when the gap is too small to be worth saying ("1x less" says nothing).
// Ultra's figure prices the run's own token counts at Ultra's rates; it is not a
// separate run on Ultra (see Cost in progress.tsx).
export function ultraRatio(nebiusUsd: number, ultraUsd: number | null): number | null {
  if (ultraUsd === null || ultraUsd <= 0 || nebiusUsd <= 0) return null;
  const ratio = Math.round(ultraUsd / nebiusUsd);
  return ratio >= 2 ? ratio : null;
}
