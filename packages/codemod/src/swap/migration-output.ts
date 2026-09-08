import { SourcePass } from "../source-pass-utils.ts";
import { StyleRuleKindTag, type StyleProgram } from "./semantic-ir.ts";

/** Output mechanics shared by migration and differential proof use cases. */
export class MigrationOutput {
	static removeSourceImports(
		code: string,
		modules: readonly string[],
		moduleMatchers: readonly ((moduleSpecifier: string) => boolean)[] = [],
		reservedBindings: readonly string[] = [],
	): string {
		const ownedModules = new Set(modules);
		const reserved = new Set(reservedBindings);
		// Keep line breaks outside the match. The rewritten import may be kept
		// with a reduced specifier list; consuming the following newline would
		// concatenate it with the first non-import statement.
		const imports = /\bimport\s+(?:[^;]*?\s+from\s+)?["']([^"']+)["'][ \t]*;?/g;
		const edits: Array<{ start: number; end: number; text: string }> = [];
		const body = code
			.replace(imports, "")
			// JSX attribute names are not references to an imported binding. This
			// matters for source `css` imports when a target owns a `css` prop.
			.replace(/\b(?:className|class|css)\s*=/gu, "");
		let excluded: ReturnType<typeof SourcePass.computeExcludedRanges> | undefined;
		try {
			excluded = SourcePass.computeExcludedRanges(body, "pandwind-migration-output.ts");
		} catch {
			// Import cleanup remains conservative for incomplete snippets.
		}
		for (const match of code.matchAll(imports)) {
			const moduleSpecifier = match[1];
			if (
				moduleSpecifier === undefined ||
				(!ownedModules.has(moduleSpecifier) &&
					!moduleMatchers.some((matcher) => matcher(moduleSpecifier)))
			)
				continue;
			const statement = match[0];
			const clause = /^import\s+(.+?)\s+from\s+(["'][^"']+["'])/u.exec(statement);
			const start = match.index ?? 0;
			if (clause === null) {
				edits.push({ start, end: start + statement.length, text: "" });
				continue;
			}
			const used = (binding: string): boolean =>
				!reserved.has(binding) &&
				[
					...body.matchAll(
						new RegExp(`\\b${binding.replace(/[.*+?^${}()|[\\]\\]/g, "\\\\$&")}\\b`, "gu"),
					),
				].some((reference) => !excluded?.isExcluded(reference.index ?? -1));
			const imported = clause[1]!.trim();
			const namedMatch = /\{([^}]*)\}/u.exec(imported);
			const named =
				(namedMatch?.[1] ?? "")
					.split(",")
					.map((part) => part.trim())
					.filter((part) => part !== "") ?? [];
			const defaultPart = imported.split(",")[0]!.trim();
			const keptDefault =
				/^[A-Za-z_$][\w$]*$/u.test(defaultPart) && used(defaultPart) ? defaultPart : undefined;
			const keptNamed = named.filter((part) => {
				const binding = part
					.split(/\s+as\s+/u)
					.pop()!
					.trim();
				return used(binding);
			});
			const namespace = /\*\s+as\s+([A-Za-z_$][\w$]*)/u.exec(imported)?.[1];
			if (namespace !== undefined && used(namespace)) {
				edits.push({ start, end: start + statement.length, text: statement });
				continue;
			}
			const specifier = [
				keptDefault,
				keptNamed.length === 0 ? undefined : `{ ${keptNamed.join(", ")} }`,
			].filter((part): part is string => part !== undefined);
			edits.push({
				start,
				end: start + statement.length,
				text: specifier.length === 0 ? "" : `import ${specifier.join(", ")} from ${clause[2]!};`,
			});
		}
		for (const edit of edits.toReversed())
			code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
		return code;
	}
	/** Remove import specifiers whose binding name no longer appears in the
	 * module body; a statement left with no specifiers is removed with its line. */
	static removeUnreferencedImportSpecifiers(code: string, candidates: readonly string[]): string {
		let result = code;
		for (const candidate of candidates) {
			const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			// Judge references against the module with import statements stripped,
			// so the candidate's own declaration never keeps itself alive.
			const body = result.replace(/import\s*\{[^}]*\}\s*from\s*("[^"]+"|'[^']+')/gu, "");
			if (new RegExp(`\\b${escaped}\\b`, "u").test(body)) continue;
			const importPattern = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*("[^"]+"|'[^']+')`, "g");
			const edits: Array<{ start: number; end: number; text: string }> = [];
			for (const match of result.matchAll(importPattern)) {
				const start = match.index ?? 0;
				const clause = match[1] ?? "";
				let removed = false;
				const kept: string[] = [];
				for (const part of clause.split(",")) {
					const trimmed = part.trim();
					if (trimmed === "") continue;
					const name = trimmed.split(/\s+as\s+/u).pop() ?? "";
					if (name === candidate) {
						removed = true;
						continue;
					}
					kept.push(trimmed);
				}
				if (!removed) continue;
				const replacement =
					kept.length === 0 ? "" : `import { ${kept.join(", ")} } from ${match[2]};`;
				const lineStart = result.lastIndexOf("\n", start) + 1;
				let lineEnd = start + match[0].length;
				if (result[lineEnd] === ";") lineEnd += 1;
				if (replacement === "" && result.slice(lineEnd).startsWith("\n")) lineEnd += 1;
				edits.push({ start: lineStart, end: lineEnd, text: replacement });
			}
			for (const edit of edits.toReversed())
				result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
		}
		return result;
	}

	static removeNamedImportSpecifiers(
		code: string,
		modules: readonly string[],
		candidates: readonly string[],
	): string {
		const owned = new Set(modules);
		const pattern = /import\s*\{([^}]*)\}\s*from\s*(["'])([^"']+)\2[ \t]*;?/gu;
		const edits: Array<{ start: number; end: number; text: string }> = [];
		for (const match of code.matchAll(pattern)) {
			if (match[3] === undefined || !owned.has(match[3])) continue;
			const kept = match[1]!
				.split(",")
				.map((part) => part.trim())
				.filter(
					(part) =>
						!candidates.includes(
							part
								.split(/\s+as\s+/u)
								.pop()!
								.trim(),
						),
				);
			if (kept.length === match[1]!.split(",").filter((part) => part.trim() !== "").length)
				continue;
			const start = match.index ?? 0;
			edits.push({
				start,
				end: start + match[0].length,
				text:
					kept.length === 0
						? ""
						: `import { ${kept.join(", ")} } from ${match[2]}${match[3]}${match[2]};`,
			});
		}
		for (const edit of edits.toReversed())
			code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
		return code;
	}

	static consolidateImports(statements: Iterable<string>): string[] {
		const input = [...statements];
		const runtimeBindings = new Set(
			input.flatMap((statement) => {
				const binding = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*createRuntimeCss\(/u.exec(
					statement,
				)?.[1];
				return binding === undefined ? [] : [binding];
			}),
		);
		// A stylesheet migration can emit several rules in one generated module.
		// If one rule requires the runtime carrier, the same binding can serve the
		// static rules too. Keeping both initializers would declare the binding
		// twice and make the generated module invalid.
		const normalized = input.filter((statement) => {
			if (
				runtimeBindings.size > 0 &&
				statement.trim() === 'import { createCss } from "pandwind/css";'
			)
				return false;
			const staticBinding = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*createCss\(\)/u.exec(
				statement,
			)?.[1];
			return staticBinding === undefined || !runtimeBindings.has(staticBinding);
		});
		const grouped = new Map<string, { defaultImport?: string; named: Set<string> }>();
		const other: string[] = [];
		for (const statement of normalized) {
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
