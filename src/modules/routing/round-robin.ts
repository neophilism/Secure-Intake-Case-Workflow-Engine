export function roundRobinIndex(
  cursorValue: number,
  candidateCount: number,
): number {
  if (!Number.isInteger(cursorValue) || cursorValue < 1) {
    throw new Error("cursorValue must be a positive integer.");
  }
  if (!Number.isInteger(candidateCount) || candidateCount < 1) {
    throw new Error("candidateCount must be a positive integer.");
  }

  return (cursorValue - 1) % candidateCount;
}
