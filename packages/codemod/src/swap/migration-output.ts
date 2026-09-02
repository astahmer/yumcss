import { SourcePass } from "../source-pass-utils.ts";
import { StyleRuleKindTag, type StyleProgram } from "./semantic-ir.ts";

/** Output mechanics shared by migration and differential proof use cases. */
export class MigrationOutput {
	static removeSourceImports(
		code: string,
		modules: readonly string[],
		moduleMatchers: readonly ((moduleSpecifier: string) => boolean)[] = [],
	): string {
		const ownedModules = new Set(modules);
		const imports = /\bimport\s+(?:[^;]*?\s+from\s+)?["']([^"']+)["']\s*;?/g;
		return MigrationOutput.removeExcludedMatchesByPredicate(code, imports, (match) => {
			const moduleSpecifier = match[1];
			return (
				moduleSpecifier !== undefined &&
				(ownedModules.has(moduleSpecifier) ||
					moduleMatchers.some((matcher) => matcher(moduleSpecifier)))
			);
		});
	}

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
				if (defaultPart !== undefined && defaultPart !== "")
					group.defaultImport = defaultPart.trim();
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
				const named = group.named.size > 0 ? `{ ${[...group.named].toSorted().join(", ")} }` : "";
				const specifier = [group.defaultImport, named].filter(Boolean).join(", ");
				return `import ${specifier} from "${module}";`;
			}),
			...other,
		];
	}

	static removeGeneratedStatements(code: string, statements: readonly string[]): string {
		let result = code;
		for (const statement of statements) {
			const escaped = statement.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			result = MigrationOutput.removeExcludedMatches(
				result,
				new RegExp(`^[ \\t]*${escaped}[ \\t]*(?:\\n[ \\t]*)+`, "gm"),
			);
		}
		return result;
	}

	static validationSource(text: string, program: StyleProgram): string {
		const rule = program.rules[0];
		return rule?.kind === StyleRuleKindTag.Keyframes && rule.name !== undefined
			? `const ${rule.name} = ${text}`
			: text;
	}

	private static removeExcludedMatches(source: string, pattern: RegExp): string {
		return MigrationOutput.removeExcludedMatchesByPredicate(source, pattern, () => true);
	}

	private static removeExcludedMatchesByPredicate(
		source: string,
		pattern: RegExp,
		shouldRemove: (match: RegExpMatchArray) => boolean,
	): string {
		let mask: ReturnType<typeof SourcePass.computeExcludedRanges> | undefined;
		try {
			mask = SourcePass.computeExcludedRanges(source, "pandwind-migration-output.ts");
		} catch {
			// Cleanup is best-effort for incomplete source snippets.
		}
		const edits: Array<{ start: number; end: number; text: string }> = [];
		for (const match of source.matchAll(pattern)) {
			const start = match.index ?? 0;
			if (mask?.isExcluded(start) || !shouldRemove(match)) continue;
			edits.push({ start, end: start + match[0].length, text: "" });
		}
		return SourcePass.applyEdits(source, edits);
	}
}
