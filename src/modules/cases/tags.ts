export function normalizeCaseTag(tag: string): string {
  return tag
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function normalizeCaseTags(tags: readonly string[]): string[] {
  return [
    ...new Set(
      tags
        .map(normalizeCaseTag)
        .filter(Boolean),
    ),
  ].sort();
}
