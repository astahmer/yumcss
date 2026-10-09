import { SOURCE_SCANNER_SERVICE } from "yumcss/source";
import { NodeKind, walk } from "yumcss/tw/literal";
import { SourcePass } from "../source-pass-utils.ts";
import { StyleRuleKindTag, type StyleProgram } from "./semantic-ir.ts";

const decodedIdentifierName = (name: string): string | undefined => {
	try {
		return name.replace(
			/\\u(?:([0-9a-fA-F]{4})|\{([0-9a-fA-F]{1,6})\})/gu,
			(_escape, fixed: string | undefined, braced: string | undefined) =>
				String.fromCodePoint(Number.parseInt(fixed ?? braced ?? "", 16)),
		);
	} catch {
		return undefined;
	}
};

const jsxTagBindingName = (node: unknown, isMember = false): string | undefined => {
	if (node === null || typeof node !== "object") return undefined;
	const value = node as {
		readonly type?: string;
		readonly name?: unknown;
		readonly object?: unknown;
	};
	if (value.type === NodeKind.JSXIdentifier && typeof value.name === "string")
		return isMember || /^[a-z]/u.test(value.name) === false ? value.name : undefined;
	if (value.type === NodeKind.JSXMemberExpression) return jsxTagBindingName(value.object, true);
	return undefined;
};

const identifierNames = (
	source: string,
	file = "migration-output.tsx",
): ReadonlySet<string> | undefined => {
	try {
		const parsed = SOURCE_SCANNER_SERVICE.parse({ file, source });
		if (parsed.errors.length > 0) return undefined;
		const names = new Set<string>();
		walk(parsed.program, (node) => {
			if (node.type === NodeKind.Identifier && typeof node.name === "string") names.add(node.name);
			if (node.type === NodeKind.JSXOpeningElement) {
				const localName = jsxTagBindingName((node as { readonly name?: unknown }).name);
				if (localName !== undefined) names.add(localName);
			}
		});
		return names;
	} catch {
		return undefined;
	}
};

const excludedSourceRanges = (source: string) => {
	try {
		return SourcePass.computeExcludedRanges(source, "yumcss-migration-output.ts");
	} catch {
		return undefined;
	}
};

const codeMatches = (
	source: string,
	pattern: RegExp,
	excluded: ReturnType<typeof SourcePass.computeExcludedRanges>,
): RegExpMatchArray[] =>
	[...source.matchAll(pattern)].filter((match) => !excluded.isExcluded(match.index ?? -1));

const removeMatches = (source: string, matches: readonly RegExpMatchArray[]): string =>
	SourcePass.applyEdits(
		source,
		matches.map((match) => {
			const start = match.index ?? 0;
			return { start, end: start + match[0].length, text: "" };
		}),
	);

const importDeclarationPattern = /\bimport\s+(?:[^;]*?\s+from\s+)?["'][^"']+["'][ \t]*;?/gu;

/** Output mechanics shared by migration and differential proof use cases. */
export interface SourceImportCleanupOptions {
	readonly modules: readonly string[];
	readonly moduleMatchers?: readonly ((moduleSpecifier: string) => boolean)[];
	readonly reservedBindings?: readonly string[];
	readonly sideEffectFreeModules?: readonly string[];
	readonly sideEffectFreeMatchers?: readonly ((moduleSpecifier: string) => boolean)[];
	readonly file?: string;
}

export class MigrationOutput {
	static removeSourceImports(code: string, options: SourceImportCleanupOptions): string {
		const ownedModules = new Set(options.modules);
		const sideEffectFreeModules = new Set(options.sideEffectFreeModules ?? []);
		const reserved = new Set(options.reservedBindings ?? []);
		let parsed: ReturnType<typeof SOURCE_SCANNER_SERVICE.parse>;
		try {
			parsed = SOURCE_SCANNER_SERVICE.parse({
				file: options.file ?? "migration-output.tsx",
				source: code,
			});
			if (parsed.errors.length > 0) return code;
		} catch {
			return code;
		}
		type SourceRange = { readonly start: number; readonly end: number };
		type ImportDeclarationNode = {
			readonly importKind?: string;
			readonly source?: unknown;
			readonly specifiers?: unknown;
		};
		const sourceRange = (node: unknown): SourceRange | undefined => {
			if (node === null || typeof node !== "object") return undefined;
			const value = node as { readonly start?: unknown; readonly end?: unknown };
			return typeof value.start === "number" && typeof value.end === "number"
				? { start: value.start, end: value.end }
				: undefined;
		};
		const imports: Array<{
			readonly declaration: ImportDeclarationNode;
			readonly range: SourceRange;
			readonly end: number;
		}> = [];
		let invalidImportRange = false;
		try {
			walk(parsed.program, (node) => {
				if (node.type !== NodeKind.ImportDeclaration) return;
				const range = sourceRange(node);
				if (range === undefined) {
					invalidImportRange = true;
					return;
				}
				const end = range.end + (code[range.end] === ";" ? 1 : 0);
				imports.push({ declaration: node as ImportDeclarationNode, range, end });
			});
		} catch {
			return code;
		}
		if (invalidImportRange) return code;
		const bodyWithoutImports = SourcePass.applyEdits(
			code,
			imports.map(({ range, end }) => ({ start: range.start, end, text: "" })),
		);
		const references = identifierNames(bodyWithoutImports, options.file ?? "migration-output.tsx");
		if (references === undefined) return code;
		const edits: Array<{ start: number; end: number; text: string }> = [];
		for (const { declaration, range, end } of imports) {
			const sourceNode = declaration.source;
			if (sourceNode === null || typeof sourceNode !== "object") continue;
			const source = sourceNode as { readonly value?: unknown };
			const moduleSpecifier = source.value;
			if (
				typeof moduleSpecifier !== "string" ||
				(!ownedModules.has(moduleSpecifier) &&
					!(options.moduleMatchers ?? []).some((matcher) => matcher(moduleSpecifier)))
			)
				continue;
			const moduleIsSideEffectFree =
				sideEffectFreeModules.has(moduleSpecifier) ||
				(options.sideEffectFreeMatchers ?? []).some((matcher) => matcher(moduleSpecifier));
			const sourceSpan = sourceRange(sourceNode);
			if (sourceSpan === undefined) return code;
			const used = (binding: string | undefined): boolean => {
				if (binding === undefined) return true;
				const localName = decodedIdentifierName(binding) ?? binding;
				return !reserved.has(binding) && !reserved.has(localName) && references.has(localName);
			};
			const specifiers = Array.isArray(declaration.specifiers)
				? (declaration.specifiers as Array<{
						readonly type?: string;
						readonly importKind?: string;
						readonly local?: unknown;
					}>)
				: [];
			if (specifiers.length === 0) {
				if (!moduleIsSideEffectFree) continue;
				const lineStart = code.lastIndexOf("\n", range.start) + 1;
				const lineEnd = code.indexOf("\n", end);
				const isStandaloneLine =
					code.slice(lineStart, range.start).trim() === "" &&
					(lineEnd === -1 || code.slice(end, lineEnd).trim() === "");
				edits.push({
					start: isStandaloneLine ? lineStart : range.start,
					end: isStandaloneLine && lineEnd !== -1 ? lineEnd + 1 : end,
					text: "",
				});
				continue;
			}
			const kept: Array<{
				readonly type: string;
				readonly importKind?: string;
				readonly text: string;
			}> = [];
			for (const specifier of specifiers) {
				const specifierRange = sourceRange(specifier);
				if (specifierRange === undefined) return code;
				const local = specifier.local;
				const localName =
					local !== null && typeof local === "object" && "name" in local
						? (local as { readonly name?: unknown }).name
						: undefined;
				const binding = typeof localName === "string" ? localName : undefined;
				if (!used(binding)) continue;
				kept.push({
					type: specifier.type ?? "",
					importKind: specifier.importKind,
					text: code.slice(specifierRange.start, specifierRange.end).trim(),
				});
			}
			if (kept.length === specifiers.length) continue;
			const defaultSpecifier = kept.find(
				(specifier) => specifier.type === NodeKind.ImportDefaultSpecifier,
			);
			const namespaceSpecifier = kept.find(
				(specifier) => specifier.type === NodeKind.ImportNamespaceSpecifier,
			);
			const namedSpecifiers = kept.filter(
				(specifier) => specifier.type === NodeKind.ImportSpecifier,
			);
			const importClause = [
				defaultSpecifier?.text,
				namespaceSpecifier?.text,
				namedSpecifiers.length === 0
					? undefined
					: "{ " + namedSpecifiers.map((specifier) => specifier.text).join(", ") + " }",
				...kept
					.filter(
						(specifier) =>
							specifier.type !== NodeKind.ImportDefaultSpecifier &&
							specifier.type !== NodeKind.ImportNamespaceSpecifier &&
							specifier.type !== NodeKind.ImportSpecifier,
					)
					.map((specifier) => specifier.text),
			].filter((part): part is string => part !== undefined);
			const keepsModuleEvaluation =
				declaration.importKind !== "type" &&
				specifiers.some(
					(specifier) =>
						specifier.type !== NodeKind.ImportSpecifier || specifier.importKind !== "type",
				);
			const keptBindingsKeepModuleEvaluation =
				declaration.importKind !== "type" &&
				kept.some(
					(specifier) =>
						specifier.type !== NodeKind.ImportSpecifier || specifier.importKind !== "type",
				);
			const lineStart = code.lastIndexOf("\n", range.start) + 1;
			const lineEnd = code.indexOf("\n", end);
			const isStandaloneLine =
				code.slice(lineStart, range.start).trim() === "" &&
				(lineEnd === -1 || code.slice(end, lineEnd).trim() === "");
			const preserveSideEffectImport =
				!moduleIsSideEffectFree && keepsModuleEvaluation && !keptBindingsKeepModuleEvaluation;
			const rewrittenImport =
				importClause.length === 0
					? ""
					: "import " +
						(declaration.importKind === "type" ? "type " : "") +
						importClause.join(", ") +
						" from " +
						code.slice(sourceSpan.start, sourceSpan.end) +
						code.slice(sourceSpan.end, end);
			edits.push({
				start:
					importClause.length === 0 && !preserveSideEffectImport && isStandaloneLine
						? lineStart
						: range.start,
				end:
					importClause.length === 0 &&
					!preserveSideEffectImport &&
					isStandaloneLine &&
					lineEnd !== -1
						? lineEnd + 1
						: end,
				text: preserveSideEffectImport
					? importClause.length === 0
						? "import " + code.slice(sourceSpan.start, end)
						: rewrittenImport + "\nimport " + code.slice(sourceSpan.start, end)
					: rewrittenImport,
			});
		}
		for (const edit of edits.toReversed())
			code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
		return code;
	}

	static removeRedundantSideEffectImports(code: string, file = "migration-output.tsx"): string {
		let parsed: ReturnType<typeof SOURCE_SCANNER_SERVICE.parse>;
		try {
			parsed = SOURCE_SCANNER_SERVICE.parse({ file, source: code });
			if (parsed.errors.length > 0) return code;
		} catch {
			return code;
		}
		type SourceRange = { readonly start: number; readonly end: number };
		type ImportDeclarationNode = {
			readonly importKind?: string;
			readonly source?: unknown;
			readonly specifiers?: unknown;
		};
		const sourceRange = (node: unknown): SourceRange | undefined => {
			if (node === null || typeof node !== "object") return undefined;
			const value = node as { readonly start?: unknown; readonly end?: unknown };
			return typeof value.start === "number" && typeof value.end === "number"
				? { start: value.start, end: value.end }
				: undefined;
		};
		const imports: Array<{
			readonly range: SourceRange;
			readonly end: number;
			readonly key: string;
			readonly runtime: boolean;
			readonly sideEffectOnly: boolean;
		}> = [];
		let invalidImportRange = false;
		try {
			walk(parsed.program, (node) => {
				if (node.type !== NodeKind.ImportDeclaration) return;
				const range = sourceRange(node);
				const declaration = node as ImportDeclarationNode;
				const source = sourceRange(declaration.source);
				if (range === undefined || source === undefined) {
					invalidImportRange = true;
					return;
				}
				const sourceNode = declaration.source as { readonly value?: unknown };
				if (typeof sourceNode.value !== "string") {
					invalidImportRange = true;
					return;
				}
				const end = range.end + (code[range.end] === ";" ? 1 : 0);
				const importSuffix = code.slice(source.end, range.end).replace(/;\s*$/u, "").trim();
				const specifiers = Array.isArray(declaration.specifiers)
					? (declaration.specifiers as Array<{
							readonly type?: string;
							readonly importKind?: string;
						}>)
					: [];
				const runtime =
					declaration.importKind !== "type" &&
					specifiers.some(
						(specifier) =>
							specifier.type !== NodeKind.ImportSpecifier || specifier.importKind !== "type",
					);
				imports.push({
					range,
					end,
					key: `${sourceNode.value}\u0000${importSuffix}`,
					runtime,
					sideEffectOnly: declaration.importKind !== "type" && specifiers.length === 0,
				});
			});
		} catch {
			return code;
		}
		if (invalidImportRange) return code;
		const runtimeImports = new Set(imports.filter((item) => item.runtime).map((item) => item.key));
		const seenSideEffectImports = new Set<string>();
		const edits: Array<{ readonly start: number; readonly end: number }> = [];
		for (const item of imports) {
			if (!item.sideEffectOnly) continue;
			if (!runtimeImports.has(item.key) && !seenSideEffectImports.has(item.key)) {
				seenSideEffectImports.add(item.key);
				continue;
			}
			const lineStart = code.lastIndexOf("\n", item.range.start) + 1;
			const lineEnd = code.indexOf("\n", item.end);
			const isStandaloneLine =
				code.slice(lineStart, item.range.start).trim() === "" &&
				(lineEnd === -1 || code.slice(item.end, lineEnd).trim() === "");
			edits.push({
				start: isStandaloneLine ? lineStart : item.range.start,
				end: isStandaloneLine && lineEnd !== -1 ? lineEnd + 1 : item.end,
			});
		}
		for (const edit of edits.toReversed()) code = code.slice(0, edit.start) + code.slice(edit.end);
		return code;
	}

	/** Remove import specifiers whose binding name no longer appears in the
	 * module body; a statement left with no specifiers is removed with its line. */
	static removeUnreferencedImportSpecifiers(code: string, candidates: readonly string[]): string {
		let result = code;
		for (const candidate of candidates) {
			// Judge references against the module with import statements stripped,
			// so the candidate's own declaration never keeps itself alive.
			const sourceExcluded = excludedSourceRanges(result);
			if (sourceExcluded === undefined) return result;
			const body = removeMatches(
				result,
				codeMatches(result, importDeclarationPattern, sourceExcluded),
			);
			const references = identifierNames(body);
			if (references === undefined || references.has(candidate)) continue;
			const importPattern = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*("[^"]+"|'[^']+')`, "g");
			const edits: Array<{ start: number; end: number; text: string }> = [];
			for (const match of codeMatches(result, importPattern, sourceExcluded)) {
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
		const sourceExcluded = excludedSourceRanges(code);
		if (sourceExcluded === undefined) return code;
		const body = removeMatches(code, codeMatches(code, importDeclarationPattern, sourceExcluded));
		const references = identifierNames(body);
		if (references === undefined) return code;
		const isReferenced = (binding: string): boolean => references.has(binding);
		const edits: Array<{ start: number; end: number; text: string }> = [];
		for (const match of codeMatches(code, pattern, sourceExcluded)) {
			if (match[3] === undefined || !owned.has(match[3])) continue;
			const kept = match[1]!
				.split(",")
				.map((part) => part.trim())
				.filter((part) => {
					const localName = part
						.split(/\s+as\s+/u)
						.pop()!
						.trim();
					return !candidates.includes(localName) || isReferenced(localName);
				});
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
		const staticBindings = new Set(
			input.flatMap((statement) => {
				const binding = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*createUnsafeCss\(\)/u.exec(
					statement,
				)?.[1];
				return binding === undefined ? [] : [binding];
			}),
		);
		const collidingBindings = new Set(
			[...runtimeBindings].filter((binding) => staticBindings.has(binding)),
		);
		// A stylesheet migration can emit several rules in one generated module.
		// A runtime carrier is deliberately separate from the normal extracted
		// `css` lane. Only legacy emissions that reuse the same local binding need
		// the old single-carrier deduplication.
		const normalized = input.filter((statement) => {
			if (
				collidingBindings.size > 0 &&
				statement.trim() === 'import { createUnsafeCss } from "yumcss/unsafe/css";'
			)
				return false;
			const staticBinding =
				/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*createUnsafeCss\(\)/u.exec(statement)?.[1];
			return staticBinding === undefined || !collidingBindings.has(staticBinding);
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
			if (specifier.startsWith("type ")) {
				other.push(statement);
				continue;
			}
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
			mask = SourcePass.computeExcludedRanges(source, "yumcss-migration-output.ts");
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
