/**
 * Shared project/team matching used by the user list, check-in table, exports and
 * Teamlead scoping. Keeps every screen agreeing on what "the same project" means.
 *
 * Values are compared after Unicode NFC normalisation, trimming, collapsing inner
 * whitespace (incl. NBSP) and lower-casing — so "CPFB HCD", "cpfb  hcd " and
 * "CPFB HCD" are one project.
 */
export function normalizeProject(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFC')
    .replace(/[\s ​]+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Build a row predicate for a selection.
 * - null / undefined / [] → no filter (returns null; callers show all rows)
 * - otherwise → predicate matching rows whose project is in the selection
 */
export function buildProjectMatcher(
  selected: readonly string[] | null | undefined,
): ((project: string | null | undefined) => boolean) | null {
  if (!selected || selected.length === 0) return null;
  const wanted = new Set(selected.map(normalizeProject));
  return project => wanted.has(normalizeProject(project));
}

/** De-duplicate project names that differ only by case/whitespace; first spelling wins (trimmed). */
export function dedupeProjects(values: readonly (string | null | undefined)[]): string[] {
  const seen = new Map<string, string>();
  for (const raw of values) {
    const key = normalizeProject(raw);
    if (!key || seen.has(key)) continue;
    seen.set(key, (raw ?? '').normalize('NFC').replace(/[\s ​]+/g, ' ').trim());
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
}
