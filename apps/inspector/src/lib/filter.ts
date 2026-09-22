/** Shared text matcher for Inspector search: case-insensitive substring. */
export type TextMatcher = (text: string) => boolean;

export function makeTextMatcher(query: string): TextMatcher {
	const q = query.toLowerCase();
	return (text: string): boolean => text.toLowerCase().includes(q);
}

export interface NamedEntry {
	name: string;
	[key: string]: unknown;
}

/**
 * Filter named entries by query against their name (plus optional extra
 * searchable strings). Empty query keeps everything.
 */
export function filterNamed<E extends NamedEntry>(
	entries: Array<E>,
	matches: TextMatcher,
	searchable?: (entry: E) => Array<string>,
): Array<E> {
	if (!searchable) return entries.filter((e) => matches(e.name));
	return entries.filter((e) => matches(e.name) || searchable(e).some(matches));
}
