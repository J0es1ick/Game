export function pageHash(page: string): string {
  return `#/${encodeURIComponent(page)}`;
}

export function pageFromHash<Page extends string>(
  hash: string,
  pages: readonly Page[],
  fallback: Page,
): Page {
  const raw = hash.replace(/^#\/?/, "").split(/[?&]/, 1)[0];
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  return pages.includes(decoded as Page) ? (decoded as Page) : fallback;
}
