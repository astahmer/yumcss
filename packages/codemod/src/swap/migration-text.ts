import type { StyleProgram } from "./semantic-ir.ts";

/** Text policies shared by migration orchestration, independent of adapters. */
export class MigrationText {
	static consolidateImports(statements: Iterable<string>): string[] {
		const grouped = new Map<string, { defaultImport?: string; named: Set<string> }>();
		const other: string[] = [];
		for (const statement of statements) {
			const match = /^import\s+(.+?)\s+from\s+["']([^"']+)["'];?$/.exec(statement.trim());
			if (match?.[1] === undefined || match[2] === undefined) {
				other.push(statement);
				continue;
			}
			const group = grouped.get(match[2]) ?? { named: new Set<string>() };
			const specifier = match[1].trim();
			if (specifier.startsWith("{")) {
				for (const name of specifier.slice(1, -1).split(",")) {
					const trimmed = name.trim();
					if (trimmed) group.named.add(trimmed);
				}
			} else {
				const [defaultPart, namedPart] = specifier.split(/\s*,\s*\{/);
				if (defaultPart !== undefined && defaultPart !== "") group.defaultImport = defaultPart.trim();
				if (namedPart !== undefined) {
					for (const name of namedPart.replace(/}\s*$/, "").split(",")) {
						const trimmed = name.trim();
						if (trimmed) group.named.add(trimmed);
					}
				}
			}
			grouped.set(match[2], group);
		}
		return [
			...[...grouped].map(([module, group]) => {
				const named = group.named.size > 0 ? "{ " + [...group.named].toSorted().join(", ") + " }" : "";
				const specifier = [group.defaultImport, named].filter(Boolean).join(", ");
				return "import " + specifier + " from \"" + module + "\";";
			}),
			...other,
		];
	}

	static validationSource(text: string, program: StyleProgram): string {
		const rule = program.rules[0];
		return rule?.kind === "keyframes" && rule.name !== undefined
			? "const " + rule.name + " = " + text
			: text;
	}
}
