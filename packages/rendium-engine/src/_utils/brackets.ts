/**
 * Validates and calculates depths for bracket-like structures (e.g., ScopeStart/ScopeEnd).
 *
 * @param items Array of items.
 * @param isStart Predicate that increments depth.
 * @param isEnd Predicate that decrements depth.
 * @returns Array of depths corresponding to each item.
 * @throws Error if brackets are unbalanced.
 */
export function calculateDepths<T>(
  items: T[],
  isStart: (item: T) => boolean,
  isEnd: (item: T) => boolean,
): number[] {
  const depths: number[] = [];
  let currentDepth = 0;

  for (const item of items) {
    if (isStart(item)) {
      depths.push(currentDepth);
      currentDepth++;
    } else if (isEnd(item)) {
      currentDepth--;
      if (currentDepth < 0) {
        throw new Error('Unbalanced brackets: unexpected end marker');
      }
      depths.push(currentDepth);
    } else {
      depths.push(currentDepth);
    }
  }

  if (currentDepth !== 0) {
    throw new Error(`Unbalanced brackets: ${currentDepth} unclosed scope(s)`);
  }

  return depths;
}
