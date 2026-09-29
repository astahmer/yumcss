export const uniqueLocalIdentifier = (source: string, base: string): string => {
	const identifiers = new Set(source.match(/[A-Za-z_$][\w$]*/gu) ?? []);
	let candidate = base;
	let suffix = 1;
	while (identifiers.has(candidate)) candidate = `${base}${suffix++}`;
	return candidate;
};
