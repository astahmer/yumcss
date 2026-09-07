import { SourcePass } from "../source-pass-utils.ts";
import { ensureImport } from "../shared.ts";
import type { SourceBindingIndex, SourceScanResult, SourceScannerService } from "pandwind/source";
import type { AdapterParseContext } from "./adapter-contract.ts";
import { intrinsicTagForSubject } from "./host-component-rewriter.ts";
import { BuiltinHostFramework, detectHostFramework } from "./host-adapters.ts";
import type { StyleProgram } from "./semantic-ir.ts";

/**
 * Source and host facts needed while projecting one migration into a file.
 *
 * These operations are deliberately kept together because they all answer the
 * same application question: where does the emitted style attach to the source
 * document, and how should generated statements enter that document?
 */
export interface AdapterMigrationSupport {
	tagForStandalone(source: string, start: number): string | undefined;
	isStandaloneDefaultExport(source: string, start: number): boolean;
	bindingForMatch(bindings: SourceBindingIndex | undefined, start: number): string | undefined;
	frameworkForHost(
		file: string,
		document: SourceScanResult,
		semantic: AdapterParseContext["semantic"],
		program: StyleProgram,
	): string | undefined;
	hasHostBindingUse(bindings: SourceBindingIndex | undefined, binding: string | undefined): boolean;
	hasComponentBindingUse(
		bindings: SourceBindingIndex | undefined,
		binding: string | undefined,
	): boolean;
	hasInlineHostUse(
		bindings: SourceBindingIndex | undefined,
		start: number,
		source: string,
	): boolean;
	classExpressionFromEmission(emitted: string): string | undefined;
	hostClassExpression(source: string, start: number, end: number, emitted: string): string;
	generatedBindings(imports: ReadonlySet<string>): readonly string[];
	ensureGeneratedStatement(code: string, statement: string, file: string): string;
	fileWithExtension(file: string, extension: string | undefined): string;
	selectNonOverlappingMatches<
		T extends { readonly start: number; readonly end: number; readonly program: StyleProgram },
	>(
		matches: readonly T[],
	): readonly T[];
}

export function createAdapterMigrationSupport(
	scanner: SourceScannerService,
): AdapterMigrationSupport {
	const tagForStandalone = (source: string, start: number): string | undefined => {
		const subject = source
			.slice(start)
			.match(/^styled\s*(\.\s*[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))/)?.[0]
			.trim();
		return subject === undefined ? undefined : intrinsicTagForSubject(subject);
	};

	const isStandaloneDefaultExport = (source: string, start: number): boolean =>
		/export\s+default\s*$/.test(source.slice(0, start));

	const bindingForMatch = (
		bindings: SourceBindingIndex | undefined,
		start: number,
	): string | undefined =>
		bindings?.callSites.find((site) => site.start === start)?.assignedBinding;

	const frameworkForHost = (
		file: string,
		document: SourceScanResult,
		semantic: AdapterParseContext["semantic"],
		program: StyleProgram,
	): string | undefined =>
		semantic?.source?.framework ??
		detectHostFramework(document.document.source, document.document.file)?.id ??
		document.framework ??
		program.source?.framework ??
		(
			{
				tsx: BuiltinHostFramework.React,
				jsx: BuiltinHostFramework.React,
				vue: BuiltinHostFramework.Vue,
				svelte: BuiltinHostFramework.Svelte,
				astro: BuiltinHostFramework.Astro,
			} as Partial<Record<string, BuiltinHostFramework>>
		)[document.language ?? scanner.languageForFile(file)];

	const hasHostBindingUse = (
		bindings: SourceBindingIndex | undefined,
		binding: string | undefined,
	): boolean => binding !== undefined && bindings?.hasAttributeUse(binding) === true;

	const hasComponentBindingUse = (
		bindings: SourceBindingIndex | undefined,
		binding: string | undefined,
	): boolean => binding !== undefined && bindings?.hasComponentUse(binding) === true;

	const hasInlineHostUse = (
		bindings: SourceBindingIndex | undefined,
		start: number,
		source: string,
	): boolean => {
		if (bindings?.hasInlineAttributeUse(start) === true) return true;
		const openingStart = source.lastIndexOf("<", start);
		const openingEnd = source.indexOf(">", start);
		if (openingStart < 0 || openingEnd < start) return false;
		const openingTag = source.slice(openingStart, openingEnd + 1);
		for (const attribute of openingTag.matchAll(/\b(?:className|class)\s*=\s*\{/gu)) {
			const open = openingStart + (attribute.index ?? 0) + attribute[0].lastIndexOf("{");
			const block = SourcePass.matchBlock(source, open);
			if (block !== null && start > open && start < block.end) return true;
		}
		return false;
	};

	const classExpressionFromEmission = (emitted: string): string | undefined => {
		const expression = emitted.trim();
		return expression.length === 0 ? undefined : expression;
	};

	const hostClassExpression = (
		source: string,
		start: number,
		end: number,
		emitted: string,
	): string => {
		const expression = emitted.trim();
		if (!expression.startsWith("css.vars(") || /\.class\s*$/u.test(expression)) return emitted;
		const tagStart = source.lastIndexOf("<", start);
		const tagEnd = source.indexOf(">", end);
		if (tagStart === -1 || tagEnd === -1) return emitted;
		const openingTag = source.slice(tagStart, tagEnd + 1);
		const classStart = Math.max(
			openingTag.lastIndexOf("class="),
			openingTag.lastIndexOf("className="),
		);
		if (classStart === -1 || tagStart + classStart > start) return emitted;
		return `${emitted}.class`;
	};

	const generatedBindings = (imports: ReadonlySet<string>): readonly string[] => {
		const bindings = new Set<string>();
		for (const statement of imports) {
			const declarations = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/gu;
			for (const match of statement.matchAll(declarations)) {
				if (match[1] !== undefined) bindings.add(match[1]);
			}
			const clause = /^import\s+(.+?)\s+from\s+["'][^"']+["']/u.exec(statement)?.[1];
			if (clause === undefined) continue;
			const defaultPart = clause.split(",")[0]?.trim();
			if (defaultPart !== undefined && /^[A-Za-z_$][\w$]*$/u.test(defaultPart))
				bindings.add(defaultPart);
			const namespace = /\*\s+as\s+([A-Za-z_$][\w$]*)/u.exec(clause)?.[1];
			if (namespace !== undefined) bindings.add(namespace);
			const named = /\{([^}]*)\}/u.exec(clause)?.[1];
			for (const item of named?.split(",") ?? []) {
				const local = item
					.trim()
					.split(/\s+as\s+/u)
					.pop()
					?.trim();
				if (local !== undefined && /^[A-Za-z_$][\w$]*$/u.test(local)) bindings.add(local);
			}
		}
		return [...bindings];
	};

	const ensureGeneratedStatement = (code: string, statement: string, file: string): string => {
		if (scanner.languageForFile(file) !== "vue" || code.includes(statement))
			return ensureImport(code, statement);
		const script = /<script(?:\s+setup)?(?:\s[^>]*)?>/i.exec(code);
		if (script === null) return `<script setup>\n${statement}\n</script>\n${code}`;
		const contentStart = script.index + script[0].length;
		const contentEnd = code.indexOf("</script>", contentStart);
		if (contentEnd === -1)
			return `${code.slice(0, contentStart)}\n${statement}${code.slice(contentStart)}`;
		const content = code.slice(contentStart, contentEnd);
		const updated = ensureImport(content, statement);
		return `${code.slice(0, contentStart)}${updated.startsWith("\n") ? "" : "\n"}${updated}${code.slice(contentEnd)}`;
	};

	const fileWithExtension = (file: string, extension: string | undefined): string => {
		if (extension === undefined) return file;
		const slash = Math.max(file.lastIndexOf("/"), file.lastIndexOf("\\"));
		const dot = file.lastIndexOf(".");
		return dot > slash ? `${file.slice(0, dot)}${extension}` : `${file}${extension}`;
	};

	const selectNonOverlappingMatches = <
		T extends { readonly start: number; readonly end: number; readonly program: StyleProgram },
	>(
		matches: readonly T[],
	): readonly T[] => {
		const selected: T[] = [];
		for (const match of matches.toSorted(
			(left, right) => left.start - right.start || right.end - left.end,
		)) {
			const containing = selected.at(-1);
			if (containing === undefined || match.start >= containing.end) {
				selected.push(match);
				continue;
			}
			if (
				containing.start <= match.start &&
				match.end <= containing.end &&
				containing.program.source?.hostOpenTag !== undefined
			)
				continue;
			if (match.start === containing.start && match.end > containing.end)
				selected[selected.length - 1] = match;
		}
		return selected;
	};

	return {
		tagForStandalone,
		isStandaloneDefaultExport,
		bindingForMatch,
		frameworkForHost,
		hasHostBindingUse,
		hasComponentBindingUse,
		hasInlineHostUse,
		classExpressionFromEmission,
		hostClassExpression,
		generatedBindings,
		ensureGeneratedStatement,
		fileWithExtension,
		selectNonOverlappingMatches,
	};
}
