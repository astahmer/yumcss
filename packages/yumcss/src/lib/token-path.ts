/**
 * Token-name aliases shared by the CSS and design resolvers.
 *
 * `$blue-500` is the legacy authored spelling. `blue.500` is its canonical
 * dot-delimited reference; unprefixed hyphens remain part of a token segment.
 */
export function canonicalTokenName(name: string): string {
	return name.startsWith("$") ? name.slice(1).replaceAll("-", ".") : name;
}

export function tokenNameAliases(name: string): readonly string[] {
	const canonical = canonicalTokenName(name);
	return canonical === name ? [name] : [name, canonical];
}
