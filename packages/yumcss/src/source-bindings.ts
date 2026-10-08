import { toOxcNode } from "./oxc-node.ts";
import type { ParseResult } from "oxc-parser";
import { SOURCE_SCANNER_SERVICE, type SourceDocument, type SourceRange } from "./source-scanner.ts";
import { walkWithParent, type OxcNode } from "./tw/literal.ts";
import { ImportKindTag, NodeKind } from "./ast-node-kind.ts";

/** Runtime-safe typed identity values used by source adapters. */
export const SourceBindingKind = {
	Named: "named",
	Default: "default",
	Namespace: "namespace",
	Reexport: "reexport",
} as const;
export type SourceBindingKind = (typeof SourceBindingKind)[keyof typeof SourceBindingKind];

/** AST-owned semantic call shapes exposed to adapter parsers. */
export const SourceCallSiteKind = {
	Call: "call",
	TaggedTemplate: "tagged-template",
} as const;
export type SourceCallSiteKind = (typeof SourceCallSiteKind)[keyof typeof SourceCallSiteKind];

export interface SourceBinding {
	readonly localName: string;
	readonly importedName: string;
	readonly source: string;
	readonly kind: SourceBindingKind;
	readonly range: SourceRange;
}

export interface SourceReexport {
	readonly exportedName: string;
	readonly importedName: string;
	readonly source: string;
	readonly range: SourceRange;
}

export interface SourceExportAll {
	readonly source: string;
	readonly range: SourceRange;
}

export interface SourceModuleReference {
	readonly source: string;
	readonly range: SourceRange;
}

export interface SourceCallSite {
	readonly kind: SourceCallSiteKind;
	readonly start: number;
	readonly end: number;
	readonly localName: string;
	readonly property?: string;
	readonly binding?: SourceBinding;
	/** Identifier bound to the call result when the call initializes a variable. */
	readonly assignedBinding?: string;
}

export const SourceHostUseKind = {
	Component: "component",
	Attribute: "attribute",
} as const;
export type SourceHostUseKind = (typeof SourceHostUseKind)[keyof typeof SourceHostUseKind];

export interface SourceHostUse {
	readonly kind: SourceHostUseKind;
	readonly localName: string;
	readonly start: number;
	readonly end: number;
	/** AST range for a non-self-closing JSX element's closing tag. */
	readonly closing?: SourceRange;
}

export interface SourceBindingIndex {
	readonly bindings: readonly SourceBinding[];
	readonly declaredNames: ReadonlySet<string>;
	readonly reexports: readonly SourceReexport[];
	readonly exportAllSources: readonly SourceExportAll[];
	/** AST ranges for static imports, re-exports, dynamic imports, and require calls. */
	readonly moduleReferences: readonly SourceModuleReference[];
	/** AST-owned calls and tagged templates with resolved imported bindings. */
	readonly callSites: readonly SourceCallSite[];
	/** JSX component and attribute uses resolved from AST ranges. */
	readonly hostUses: readonly SourceHostUse[];
	/** Resolve the authored local name to its imported module binding. */
	binding(localName: string): SourceBinding | undefined;
	/** Return all imports from one module, preserving authored order. */
	fromModule(source: string): readonly SourceBinding[];
	/** Match a semantic import without relying on the local spelling. */
	isImportedFrom(localName: string, source: string, importedName?: string): boolean;
	/** Conservative safety check for an imported name used in this module. */
	isShadowed(localName: string): boolean;
	/** Check whether an imported name is shadowed at a specific source offset. */
	isShadowedAt(localName: string, offset: number): boolean;
	/** Check whether a binding is used as a JSX component element. */
	hasComponentUse(localName: string): boolean;
	/** Check whether a binding is used as a JSX style/class attribute expression. */
	hasAttributeUse(localName: string): boolean;
	/** Check whether an offset is inside a JSX attribute expression. */
	hasInlineAttributeUse(offset: number): boolean;
}

/** Project binding resolution often revisits the same barrel once per consumer file. */
const SOURCE_BINDING_INDEX_CACHE_LIMIT = 512;
const sourceBindingIndexCache = new Map<
	string,
	{ readonly source: string; readonly index: SourceBindingIndex }
>();

interface AstNode extends OxcNode {
	readonly start?: number;
	readonly end?: number;
}

interface ShadowedScope {
	readonly name: string;
	readonly range: SourceRange;
}

const isNodeRecord = (node: unknown): node is Record<string, unknown> =>
	typeof node === "object" && node !== null && !Array.isArray(node);

const nodeName = (node: unknown): string | undefined => {
	if (!isNodeRecord(node)) return undefined;
	const value = node;
	if (typeof value.name === "string") return value.name;
	return typeof value.value === "string" ? value.value : undefined;
};

const rangeOf = (node: unknown, fallback: SourceRange): SourceRange => {
	if (node === null || typeof node !== "object") return fallback;
	const value = node as { start?: unknown; end?: unknown };
	return typeof value.start === "number" && typeof value.end === "number"
		? { start: value.start, end: value.end }
		: fallback;
};

const sourceOf = (node: unknown): string | undefined => {
	if (!isNodeRecord(node)) return undefined;
	const source = node.source;
	if (!isNodeRecord(source)) return undefined;
	return typeof source.value === "string" ? source.value : undefined;
};

interface EmbeddedProgram {
	readonly program: OxcNode;
	readonly hostUses: readonly SourceHostUse[];
}

/** Parse framework-embedded script/template islands with original source offsets. */
const embeddedPrograms = (
	document: SourceDocument,
	options: { readonly includeScripts?: boolean } = {},
): readonly EmbeddedProgram[] => {
	const programs: EmbeddedProgram[] = [];
	const source = document.source;
	if (options.includeScripts !== false) {
		const scriptPattern = /<script\b[^>]*>([\s\S]*?)<\/script\s*>/giu;
		for (const match of source.matchAll(scriptPattern)) {
			const body = match[1];
			const matchStart = match.index;
			if (body === undefined || matchStart === undefined) continue;
			const bodyStart = matchStart + match[0].indexOf(body);
			try {
				const parsed = SOURCE_SCANNER_SERVICE.parse({
					file: `${document.file}.tsx`,
					source: `${" ".repeat(bodyStart)}${body}`,
					language: "tsx",
				});
				programs.push({
					program: toOxcNode(parsed.program),
					hostUses: collectHostUses(toOxcNode(parsed.program)),
				});
			} catch {
				// A malformed script island remains unindexed and therefore unrewritten.
			}
		}
	}
	const templatePattern = /<template\b[^>]*>([\s\S]*?)<\/template\s*>/giu;
	for (const match of source.matchAll(templatePattern)) {
		const body = match[1];
		const matchStart = match.index;
		if (body === undefined || matchStart === undefined) continue;
		const bodyStart = matchStart + match[0].indexOf(body);
		const prefix = `const __yumcss_template = <>`;
		const normalizedBody = body.replace(
			/:([A-Za-z_$][\w$-]*)="([^"]*)"/gu,
			(full, name: string, expression: string) => {
				const replacement = `${name}={${expression}}`;
				return replacement.length < full.length
					? `${replacement}${" ".repeat(full.length - replacement.length)}`
					: replacement;
			},
		);
		try {
			const parsed = SOURCE_SCANNER_SERVICE.parse({
				file: `${document.file}.tsx`,
				source: `${" ".repeat(bodyStart)}${prefix}${normalizedBody}</>;`,
				language: "tsx",
			});
			const prefixLength = prefix.length;
			const hostUses = collectHostUses(toOxcNode(parsed.program)).map((use) => ({
				...use,
				start: use.start - prefixLength,
				end: use.end - prefixLength,
				...(use.closing === undefined
					? {}
					: {
							closing: {
								start: use.closing.start - prefixLength,
								end: use.closing.end - prefixLength,
							},
						}),
			}));
			programs.push({
				program: toOxcNode(parsed.program),
				hostUses,
			});
		} catch {
			// Unsupported template syntax is intentionally handled by its host adapter.
		}
	}
	return programs;
};

const bindingNames = (node: unknown, names: string[]): void => {
	const stack: unknown[] = [node];
	while (stack.length > 0) {
		const current = stack.pop();
		if (current === null || typeof current !== "object") continue;
		const value = current as {
			type?: string;
			name?: string;
			left?: unknown;
			argument?: unknown;
			elements?: unknown[];
			properties?: unknown[];
		};
		switch (value.type) {
			case NodeKind.Identifier:
				if (typeof value.name === "string") names.push(value.name);
				break;
			case NodeKind.RestElement:
			case "AssignmentPattern":
				stack.push(value.type === NodeKind.RestElement ? value.argument : value.left);
				break;
			case "ArrayPattern":
				for (const element of (value.elements ?? []).toReversed()) stack.push(element);
				break;
			case NodeKind.ObjectPattern:
				for (const property of (value.properties ?? []).toReversed()) {
					if (property === null || typeof property !== "object") continue;
					const entry = property as { type?: string; value?: unknown; argument?: unknown };
					stack.push(entry.type === NodeKind.RestElement ? entry.argument : entry.value);
				}
				break;
		}
	}
};

const isImportNode = (node: AstNode): boolean => node.type === NodeKind.ImportDeclaration;

const recoverableParse = (document: SourceDocument): ParseResult => {
	const parsed = SOURCE_SCANNER_SERVICE.parse({
		...document,
		language: document.language ?? SOURCE_SCANNER_SERVICE.languageForFile(document.file),
	});
	const errors = parsed.errors;
	if (errors === undefined || errors.length === 0 || parsed.program.body.length > 0) return parsed;
	const recoveryEnd = Math.min(
		...errors.flatMap((error) =>
			(error.labels ?? [])
				.map((label) => label.start)
				.filter((start): start is number => typeof start === "number"),
		),
	);
	if (!Number.isFinite(recoveryEnd) || recoveryEnd <= 0) return parsed;
	let candidateEnd = recoveryEnd;
	while (candidateEnd > 0) {
		const recovered = SOURCE_SCANNER_SERVICE.parse({
			...document,
			source: document.source.slice(0, candidateEnd),
			language: document.language ?? SOURCE_SCANNER_SERVICE.languageForFile(document.file),
		});
		const recoveredErrors = recovered.errors;
		if (recovered.program.body.length > 0 && (recoveredErrors?.length ?? 0) === 0) return recovered;
		candidateEnd = document.source.lastIndexOf("\n", candidateEnd - 1);
	}
	return parsed;
};

function collectBindings(program: OxcNode): {
	bindings: SourceBinding[];
	reexports: SourceReexport[];
	exportAllSources: SourceExportAll[];
	moduleReferences: SourceModuleReference[];
	declared: Set<string>;
	shadowedScopes: ShadowedScope[];
} {
	const bindings: SourceBinding[] = [];
	const reexports: SourceReexport[] = [];
	const exportAllSources: SourceExportAll[] = [];
	const moduleReferences: SourceModuleReference[] = [];
	const declared = new Set<string>();
	const shadowedScopes: ShadowedScope[] = [];
	const addShadowedScope = (names: readonly string[], body: unknown): void => {
		const range = rangeOf(body, { start: 0, end: 0 });
		if (range.end <= range.start) return;
		for (const name of names) shadowedScopes.push({ name, range });
	};
	walkWithParent(program, (node) => {
		if (isImportNode(node)) {
			if ((node as { importKind?: string }).importKind === ImportKindTag.Type) return;
			const source = sourceOf(node);
			if (source === undefined) return;
			const nodeRange = rangeOf(node, { start: 0, end: 0 });
			const sourceNode = (node as { source?: unknown }).source;
			moduleReferences.push({ source, range: rangeOf(sourceNode, nodeRange) });
			for (const rawSpecifier of (node as { specifiers?: unknown[] }).specifiers ?? []) {
				if (rawSpecifier === null || typeof rawSpecifier !== "object") continue;
				const specifier = rawSpecifier as {
					type?: string;
					importKind?: string;
					local?: unknown;
					imported?: unknown;
				};
				if (specifier.importKind === ImportKindTag.Type) continue;
				const localName = nodeName(specifier.local);
				if (localName === undefined) continue;
				const kind =
					specifier.type === NodeKind.ImportDefaultSpecifier
						? SourceBindingKind.Default
						: specifier.type === NodeKind.ImportNamespaceSpecifier
							? SourceBindingKind.Namespace
							: SourceBindingKind.Named;
				const importedName =
					kind === SourceBindingKind.Default
						? "default"
						: kind === SourceBindingKind.Namespace
							? "*"
							: (nodeName(specifier.imported) ?? localName);
				bindings.push({
					localName,
					importedName,
					source,
					kind,
					range: rangeOf(rawSpecifier, nodeRange),
				});
			}
			return;
		}

		if (node.type === NodeKind.ExportNamedDeclaration) {
			const source = sourceOf(node);
			if (source === undefined) return;
			const nodeRange = rangeOf(node, { start: 0, end: 0 });
			const sourceNode = (node as { source?: unknown }).source;
			moduleReferences.push({ source, range: rangeOf(sourceNode, nodeRange) });
			for (const rawSpecifier of (node as { specifiers?: unknown[] }).specifiers ?? []) {
				if (rawSpecifier === null || typeof rawSpecifier !== "object") continue;
				const specifier = rawSpecifier as { local?: unknown; exported?: unknown };
				const importedName = nodeName(specifier.local);
				const exportedName = nodeName(specifier.exported);
				if (importedName === undefined || exportedName === undefined) continue;
				reexports.push({
					exportedName,
					importedName,
					source,
					range: rangeOf(rawSpecifier, nodeRange),
				});
			}
		}

		if (node.type === NodeKind.ExportAllDeclaration) {
			const source = sourceOf(node);
			if (source !== undefined) {
				const sourceNode = (node as { source?: unknown }).source;
				const nodeRange = rangeOf(node, { start: 0, end: 0 });
				exportAllSources.push({
					source,
					range: nodeRange,
				});
				moduleReferences.push({ source, range: rangeOf(sourceNode, nodeRange) });
			}
		}

		if (node.type === NodeKind.ImportExpression) {
			const sourceNode = (node as { source?: unknown }).source;
			const source = nodeName(sourceNode);
			if (source !== undefined)
				moduleReferences.push({
					source,
					range: rangeOf(sourceNode, rangeOf(node, { start: 0, end: 0 })),
				});
		}

		if (node.type === NodeKind.CallExpression) {
			const call = node as { callee?: unknown; arguments?: unknown[] };
			const argument = call.arguments?.[0];
			const source = nodeName(argument);
			if (nodeName(call.callee) === "require" && source !== undefined)
				moduleReferences.push({
					source,
					range: rangeOf(argument, rangeOf(node, { start: 0, end: 0 })),
				});
		}

		if (
			node.type === NodeKind.VariableDeclarator ||
			node.type === NodeKind.FunctionDeclaration ||
			node.type === NodeKind.ClassDeclaration ||
			node.type === NodeKind.CatchClause
		) {
			const names: string[] = [];
			bindingNames(
				node.type === NodeKind.VariableDeclarator
					? (node as { id?: unknown }).id
					: node.type === NodeKind.CatchClause
						? (node as { param?: unknown }).param
						: (node as { id?: unknown }).id,
				names,
			);
			if (node.type === NodeKind.FunctionDeclaration) {
				for (const parameter of (node as { params?: unknown[] }).params ?? [])
					bindingNames(parameter, names);
			}
			for (const name of names) declared.add(name);
		}

		if (
			node.type === NodeKind.FunctionDeclaration ||
			node.type === NodeKind.FunctionExpression ||
			node.type === NodeKind.ArrowFunctionExpression
		) {
			const names: string[] = [];
			if (node.type === NodeKind.FunctionExpression)
				bindingNames((node as { id?: unknown }).id, names);
			for (const parameter of (node as { params?: unknown[] }).params ?? [])
				bindingNames(parameter, names);
			for (const name of names) declared.add(name);
			addShadowedScope(names, (node as { body?: unknown }).body);
		}
		if (node.type === NodeKind.CatchClause) {
			const names: string[] = [];
			bindingNames((node as { param?: unknown }).param, names);
			addShadowedScope(names, (node as { body?: unknown }).body);
		}
	});
	return { bindings, reexports, exportAllSources, moduleReferences, declared, shadowedScopes };
}

const memberCallee = (node: unknown): { localName: string; property?: string } | undefined => {
	if (node === null || typeof node !== "object") return undefined;
	const value = node as {
		type?: string;
		name?: string;
		object?: unknown;
		property?: unknown;
		computed?: boolean;
		callee?: unknown;
	};
	if (value.type === NodeKind.Identifier && typeof value.name === "string")
		return { localName: value.name };
	if (value.type === NodeKind.CallExpression) return memberCallee(value.callee);
	if (
		value.type === NodeKind.MemberExpression &&
		value.computed !== true &&
		value.property !== undefined
	) {
		const object = memberCallee(value.object);
		const property = nodeName(value.property);
		if (object !== undefined && property !== undefined) return { ...object, property };
	}
	return undefined;
};

function collectCallSites(program: OxcNode, bindings: readonly SourceBinding[]): SourceCallSite[] {
	const sites: SourceCallSite[] = [];
	const bindingFor = (localName: string): SourceBinding | undefined =>
		bindings.find((binding) => binding.localName === localName);
	const add = (
		kind: SourceCallSiteKind,
		node: AstNode,
		callee: unknown,
		parent: OxcNode | undefined,
		ancestors: readonly OxcNode[],
	): void => {
		const shape = memberCallee(callee);
		const range = rangeOf(node, { start: 0, end: 0 });
		if (shape === undefined || range.end <= range.start) return;
		const assignment =
			parent?.type === NodeKind.VariableDeclarator
				? parent
				: [...ancestors]
						.toReversed()
						.find((ancestor) => ancestor.type === NodeKind.VariableDeclarator);
		sites.push({
			kind,
			...range,
			...shape,
			...(bindingFor(shape.localName) === undefined
				? {}
				: { binding: bindingFor(shape.localName) }),
			...(assignment !== undefined &&
			rangeOf((assignment as { init?: unknown }).init, { start: -1, end: -1 }).start ===
				range.start &&
			rangeOf((assignment as { init?: unknown }).init, { start: -1, end: -1 }).end === range.end &&
			nodeName((assignment as { id?: unknown }).id) !== undefined
				? { assignedBinding: nodeName((assignment as { id?: unknown }).id) }
				: {}),
		});
	};
	walkWithParent(program, (node, parent, ancestors) => {
		if (node.type === NodeKind.CallExpression)
			add(SourceCallSiteKind.Call, node, (node as { callee?: unknown }).callee, parent, ancestors);
		else if (node.type === NodeKind.TaggedTemplateExpression)
			add(
				SourceCallSiteKind.TaggedTemplate,
				node,
				(node as { tag?: unknown }).tag,
				parent,
				ancestors,
			);
	});
	return sites.toSorted((a, b) => a.start - b.start);
}

function collectHostUses(program: OxcNode): SourceHostUse[] {
	const uses: SourceHostUse[] = [];
	walkWithParent(program, (node, parent) => {
		if (node.type !== NodeKind.JSXOpeningElement) return;
		const element = node as {
			name?: { type?: string; name?: string };
			attributes?: unknown[];
			start?: number;
			end?: number;
		};
		const name = element.name;
		const closingElement =
			parent?.type === NodeKind.JSXElement
				? (parent as { closingElement?: { start?: number; end?: number } | null }).closingElement
				: undefined;
		const closing =
			closingElement?.start !== undefined && closingElement.end !== undefined
				? { start: closingElement.start, end: closingElement.end }
				: undefined;
		if (
			name?.type === NodeKind.JSXIdentifier &&
			typeof name.name === "string" &&
			element.start !== undefined &&
			element.end !== undefined
		)
			uses.push({
				kind: SourceHostUseKind.Component,
				localName: name.name,
				start: element.start,
				end: element.end,
				...(closing === undefined ? {} : { closing }),
			});
		for (const rawAttribute of element.attributes ?? []) {
			if (rawAttribute === null || typeof rawAttribute !== "object") continue;
			const attribute = rawAttribute as {
				type?: string;
				start?: number;
				end?: number;
				value?: { type?: string; expression?: { type?: string; name?: string } } | null;
			};
			const expression = attribute.value?.expression;
			if (
				attribute.type !== NodeKind.JSXAttribute ||
				expression?.type !== NodeKind.Identifier ||
				typeof expression.name !== "string" ||
				attribute.start === undefined ||
				attribute.end === undefined
			)
				continue;
			uses.push({
				kind: SourceHostUseKind.Attribute,
				localName: expression.name,
				start: attribute.start,
				end: attribute.end,
			});
		}
	});
	return uses.toSorted((a, b) => a.start - b.start || a.end - b.end);
}

/** Immutable AST import index shared by codemod, Vite, analyzer, and hosts. */
export class SourceBindings {
	private readonly entries: readonly SourceBinding[];
	private readonly declarations: ReadonlySet<string>;
	private readonly exported: readonly SourceReexport[];
	private readonly exportedAll: readonly SourceExportAll[];
	private readonly references: readonly SourceModuleReference[];
	private readonly calls: readonly SourceCallSite[];
	private readonly hosts: readonly SourceHostUse[];
	private readonly shadowed: ReadonlySet<string>;
	private readonly shadowedScopes: readonly ShadowedScope[];

	private constructor(
		entries: readonly SourceBinding[],
		declaredNames: ReadonlySet<string>,
		exported: readonly SourceReexport[],
		exportedAll: readonly SourceExportAll[],
		references: readonly SourceModuleReference[],
		calls: readonly SourceCallSite[],
		hosts: readonly SourceHostUse[],
		shadowed: ReadonlySet<string>,
		shadowedScopes: readonly ShadowedScope[],
	) {
		this.entries = entries;
		this.declarations = declaredNames;
		this.exported = exported;
		this.exportedAll = exportedAll;
		this.references = references;
		this.calls = calls;
		this.hosts = hosts;
		this.shadowed = shadowed;
		this.shadowedScopes = shadowedScopes;
	}

	static fromProgram(program: OxcNode): SourceBindingIndex {
		const collected = collectBindings(program);
		const importedNames = new Set(collected.bindings.map((binding) => binding.localName));
		const shadowed = new Set([...importedNames].filter((name) => collected.declared.has(name)));
		return new SourceBindings(
			collected.bindings,
			collected.declared,
			collected.reexports,
			collected.exportAllSources,
			collected.moduleReferences,
			collectCallSites(program, collected.bindings),
			collectHostUses(program),
			shadowed,
			collected.shadowedScopes,
		);
	}

	static fromParseResult(result: ParseResult): SourceBindingIndex {
		return SourceBindings.fromProgram(toOxcNode(result.program));
	}

	static fromDocument(document: SourceDocument): SourceBindingIndex {
		const language = document.language ?? SOURCE_SCANNER_SERVICE.languageForFile(document.file);
		const cacheKey = `${document.file}\0${language}`;
		const cached = sourceBindingIndexCache.get(cacheKey);
		if (cached?.source === document.source) {
			sourceBindingIndexCache.delete(cacheKey);
			sourceBindingIndexCache.set(cacheKey, cached);
			return cached.index;
		}
		sourceBindingIndexCache.delete(cacheKey);
		let index: SourceBindingIndex;
		try {
			const parsed = recoverableParse({ ...document, language });
			if (language !== "vue") {
				index = SourceBindings.fromParseResult(parsed);
			} else {
				const templates = embeddedPrograms(document, { includeScripts: false });
				index =
					templates.length === 0
						? SourceBindings.fromParseResult(parsed)
						: SourceBindings.fromPrograms(
								[toOxcNode(parsed.program), ...templates.map(({ program }) => program)],
								templates.flatMap(({ hostUses }) => hostUses),
							);
			}
		} catch {
			const embedded = embeddedPrograms(document);
			if (embedded.length === 0) throw new Error(`unable to parse ${document.file}`);
			index = SourceBindings.fromPrograms(
				embedded.map(({ program }) => program),
				embedded.flatMap(({ hostUses }) => hostUses),
			);
		}
		if (sourceBindingIndexCache.size >= SOURCE_BINDING_INDEX_CACHE_LIMIT)
			sourceBindingIndexCache.delete(sourceBindingIndexCache.keys().next().value!);
		sourceBindingIndexCache.set(cacheKey, { source: document.source, index });
		return index;
	}

	static parse(document: SourceDocument): SourceBindingIndex {
		return SourceBindings.fromDocument(document);
	}

	private static fromPrograms(
		programs: readonly OxcNode[],
		extraHosts: readonly SourceHostUse[] = [],
	): SourceBindingIndex {
		const collected = programs.map(collectBindings);
		const bindings = collected.flatMap(({ bindings }) => bindings);
		const importedNames = new Set(bindings.map((binding) => binding.localName));
		const declared = new Set(collected.flatMap(({ declared }) => [...declared]));
		return new SourceBindings(
			bindings,
			declared,
			collected.flatMap(({ reexports }) => reexports),
			collected.flatMap(({ exportAllSources }) => exportAllSources),
			collected.flatMap(({ moduleReferences }) => moduleReferences),
			programs.flatMap((program) => collectCallSites(program, bindings)),
			[...programs.flatMap((program) => collectHostUses(program)), ...extraHosts],
			new Set([...importedNames].filter((name) => declared.has(name))),
			collected.flatMap(({ shadowedScopes }) => shadowedScopes),
		);
	}

	get bindings(): readonly SourceBinding[] {
		return this.entries;
	}

	get declaredNames(): ReadonlySet<string> {
		return this.declarations;
	}

	get reexports(): readonly SourceReexport[] {
		return this.exported;
	}

	get exportAllSources(): readonly SourceExportAll[] {
		return this.exportedAll;
	}

	get moduleReferences(): readonly SourceModuleReference[] {
		return this.references;
	}

	get callSites(): readonly SourceCallSite[] {
		return this.calls;
	}

	get hostUses(): readonly SourceHostUse[] {
		return this.hosts;
	}

	binding(localName: string): SourceBinding | undefined {
		return this.entries.find((entry) => entry.localName === localName);
	}

	fromModule(source: string): readonly SourceBinding[] {
		return this.entries.filter((entry) => entry.source === source);
	}

	isImportedFrom(localName: string, source: string, importedName?: string): boolean {
		const entry = this.binding(localName);
		return (
			entry !== undefined &&
			entry.source === source &&
			(importedName === undefined || entry.importedName === importedName) &&
			!this.isShadowed(localName)
		);
	}

	isShadowed(localName: string): boolean {
		return this.shadowed.has(localName);
	}

	isShadowedAt(localName: string, offset: number): boolean {
		return this.shadowedScopes.some(
			(scope) =>
				scope.name === localName && offset >= scope.range.start && offset < scope.range.end,
		);
	}

	hasComponentUse(localName: string): boolean {
		return this.hosts.some(
			(use) => use.kind === SourceHostUseKind.Component && use.localName === localName,
		);
	}

	hasAttributeUse(localName: string): boolean {
		return this.hosts.some(
			(use) => use.kind === SourceHostUseKind.Attribute && use.localName === localName,
		);
	}

	hasInlineAttributeUse(offset: number): boolean {
		return this.hosts.some(
			(use) => use.kind === SourceHostUseKind.Attribute && offset >= use.start && offset < use.end,
		);
	}
}
