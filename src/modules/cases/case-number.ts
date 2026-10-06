export function formatCaseNumber(
  calendarYear: number,
  sequence: number,
): string {
  if (!Number.isInteger(calendarYear) || calendarYear < 1900 || calendarYear > 9999) {
    throw new Error("calendarYear must be a four-digit year.");
  }
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error("sequence must be a positive integer.");
  }

  return `${calendarYear}-${String(sequence).padStart(6, "0")}`;
}
