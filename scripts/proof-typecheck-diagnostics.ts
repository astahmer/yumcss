const diagnosticGroups = (lines: readonly string[]): string[] => {
	const groups: string[] = [];
	for (const line of lines) {
		if (/^\s/u.test(line) && groups.length > 0) {
			groups[groups.length - 1] += `\n${line}`;
			continue;
		}
		groups.push(line);
	}
	return groups;
};

export const partitionTypecheckDiagnostics = ({
	generated,
	source,
}: {
	readonly generated: readonly string[];
	readonly source: readonly string[];
}): { readonly baseline: string[]; readonly errors: string[] } => {
	const normalize = (diagnostic: string) =>
		diagnostic.replace(/\(\d+,\d+\): error TS/u, ": error TS");
	const remaining = diagnosticGroups(source).map(normalize);
	const baseline: string[] = [];
	const errors: string[] = [];
	for (const diagnostic of diagnosticGroups(generated)) {
		const index = remaining.indexOf(normalize(diagnostic));
		if (index < 0) {
			errors.push(diagnostic);
			continue;
		}
		remaining.splice(index, 1);
		baseline.push(diagnostic);
	}
	return { baseline, errors };
};
