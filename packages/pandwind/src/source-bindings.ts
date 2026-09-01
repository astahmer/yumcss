import type { ParseResult } from "oxc-parser";
import {
	parseSourceProgram,
	SOURCE_SCANNER_SERVICE,
	type SourceDocument,
	type SourceRange,
} from "./source-scanner.ts";
import { walk, type OxcNode } from "./tw/literal.ts";

/** Semantic import shapes understood by source adapters. */
export const enum SourceBindingKind {
	Named = "named",
	Default = "default",
	Namespace = "namespace",
	Reexport = "reexport",
}

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

export interface SourceBindingIndex {
	readonly bindings: readonly SourceBinding[];
	readonly reexports: readonly SourceReexport[];
	/** Resolve the authored local name to its imported module binding. */
	binding(localName: string): SourceBinding | undefined;
	/** Return all imports from one module, preserving authored order. */
	fromModule(source: string): readonly SourceBinding[];
	/** Match a semantic import without relying on the local spelling. */
	isImportedFrom(localName: string, source: string, importedName?: string): boolean;
	/** Conservative safety check for an imported name used in this module. */
	isShadowed(localName: string): boolean;
}

interface AstNode extends OxcNode {
	readonly start?: number;
	readonly end?: number;
}

const nodeName = (node: unknown): string | undefined => {
	if (node === null || typeof node !== "object") return undefined;
	const value = node as { name?: unknown; value?: unknown };
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
	if (node === null || typeof node !== "object") return undefined;
	const value = node as { source?: { value?: unknown } };
	return typeof value.source?.value === "string" ? value.source.value : undefined;
};

const bindingNames = (node: unknown, names: string[]): void => {
	if (node === null || typeof node !== "object") return;
	const value = node as {
		type?: string;
		name?: string;
		id?: unknown;
		left?: unknown;
		right?: unknown;
		argument?: unknown;
		elements?: unknown[];
		properties?: unknown[];
	};
	switch (value.type) {
		case "Identifier":
			if (typeof value.name === "string") names.push(value.name);
			return;
		case "RestElement":
			bindingNames(value.argument, names);
			return;
		case "AssignmentPattern":
			bindingNames(value.left, names);
			return;
		case "ArrayPattern":
			for (const element of value.elements ?? []) bindingNames(element, names);
			return;
		case "ObjectPattern":
			for (const property of value.properties ?? []) {
				if (property === null || typeof property !== "object") continue;
				const entry = property as { type?: string; value?: unknown; argument?: unknown };
				bindingNames(entry.type === "RestElement" ? entry.argument : entry.value, names);
			}
			return;
		default:
			return;
	}
};

const isImportNode = (node: AstNode): boolean => node.type === "ImportDeclaration";

function collectBindings(program: OxcNode): {
	bindings: SourceBinding[];
	reexports: SourceReexport[];
	declared: Set<string>;
} {
	const bindings: SourceBinding[] = [];
	const reexports: SourceReexport[] = [];
	const declared = new Set<string>();
	walk(program, (raw) => {
		const node = raw as AstNode;
		if (isImportNode(node)) {
			if ((node as { importKind?: string }).importKind === "type") return;
			const source = sourceOf(node);
			if (source === undefined) return;
			const nodeRange = rangeOf(node, { start: 0, end: 0 });
			for (const rawSpecifier of (node as { specifiers?: unknown[] }).specifiers ?? []) {
				if (rawSpecifier === null || typeof rawSpecifier !== "object") continue;
				const specifier = rawSpecifier as {
					type?: string;
					importKind?: string;
					local?: unknown;
					imported?: unknown;
				};
				if (specifier.importKind === "type") continue;
				const localName = nodeName(specifier.local);
				if (localName === undefined) continue;
				const kind =
					specifier.type === "ImportDefaultSpecifier"
						? SourceBindingKind.Default
						: specifier.type === "ImportNamespaceSpecifier"
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

		if (node.type === "ExportNamedDeclaration") {
			const source = sourceOf(node);
			if (source === undefined) return;
			const nodeRange = rangeOf(node, { start: 0, end: 0 });
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

		if (
			node.type === "VariableDeclarator" ||
			node.type === "FunctionDeclaration" ||
			node.type === "ClassDeclaration" ||
			node.type === "CatchClause"
		) {
			const names: string[] = [];
			bindingNames(
				node.type === "VariableDeclarator"
					? (node as { id?: unknown }).id
					: node.type === "CatchClause"
						? (node as { param?: unknown }).param
						: (node as { id?: unknown }).id,
				names,
			);
			if (node.type === "FunctionDeclaration") {
				for (const parameter of (node as { params?: unknown[] }).params ?? [])
					bindingNames(parameter, names);
			}
			for (const name of names) declared.add(name);
		}
	});
	return { bindings, reexports, declared };
}

/** Immutable AST import index shared by codemod, Vite, analyzer, and hosts. */
export class SourceBindings {
	private constructor(
		private readonly entries: readonly SourceBinding[],
		private readonly exported: readonly SourceReexport[],
		private readonly shadowed: ReadonlySet<string>,
	) {}

	static fromProgram(program: OxcNode): SourceBindingIndex {
		const collected = collectBindings(program);
		const importedNames = new Set(collected.bindings.map((binding) => binding.localName));
		const shadowed = new Set([...importedNames].filter((name) => collected.declared.has(name)));
		return new SourceBindings(collected.bindings, collected.reexports, shadowed);
	}

	static fromParseResult(result: ParseResult): SourceBindingIndex {
		return SourceBindings.fromProgram(result.program as unknown as OxcNode);
	}

	static fromDocument(document: SourceDocument): SourceBindingIndex {
		return SourceBindings.fromParseResult(
			SOURCE_SCANNER_SERVICE.parse({
				...document,
				language: document.language ?? SOURCE_SCANNER_SERVICE.languageForFile(document.file),
			}),
		);
	}

	static parse(document: SourceDocument): SourceBindingIndex {
		return SourceBindings.fromParseResult(parseSourceProgram(document));
	}

	get bindings(): readonly SourceBinding[] {
		return this.entries;
	}

	get reexports(): readonly SourceReexport[] {
		return this.exported;
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
}
