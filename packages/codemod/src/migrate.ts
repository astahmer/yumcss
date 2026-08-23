/**
 * Source transforms for each migration mode.
 *
 * Safety model:
 * - conservative regex scope: plain-string `className` attributes and
 *   clsx-family imports/calls only; template literals and dynamic
 *   expressions are never touched;
 * - `pandwind:migrate-skip` marker (same or previous line) opts a call site
 *   out;
 * - every mode is idempotent — converted output no longer matches the
 *   input patterns.
 */
import type { PandwindMeta } from "./meta.ts";
import { mapClassList, type MappedToken } from "./map.ts";
import { tokenizeClassList } from "./tokens.ts";
import { runSourcePasses, type SourceId } from "./sources.ts";
import { ensureImport, hasCssBinding, SKIP_MARKER_DEFAULT } from "./shared.ts";

export type MigrateMode = "tw" | "cx" | "css" | "keep";

export interface TransformResult {
	code: string;
	changed: boolean;
	/** Call sites converted (className strings rewritten / imports swapped). */
	converted: number;
	/** Individual class tokens left verbatim, with reasons. */
	unmappedTokens: Array<{ file: string; token: string; reason: string }>;
	skippedByMarker: number;
}

export interface TransformOptions {
	mode: MigrateMode;
	file: string;
	skipMarker?: string;
	/** Source-library detectors to run before the mode pass (default none). */
	sources?: ReadonlyArray<SourceId>;
}

interface Edit {
	start: number;
	end: number;
	text: string;
}

function applyEdits(source: string, edits: Array<Edit>): string {
	let output = source;
	for (const edit of [...edits].toSorted((a, b) => b.start - a.start)) {
		output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
	}
	return output;
}

function hasSkipMarker(source: string, index: number, marker: string): boolean {
	const lineStart = source.lastIndexOf("\n", Math.max(0, index - 1)) + 1;
	const previousStart = Math.max(0, source.lastIndexOf("\n", Math.max(0, lineStart - 2)) + 1);
	const sameLine = source.slice(lineStart, index).includes(marker);
	const previousLine = source.slice(previousStart, lineStart).includes(marker);
	return sameLine || previousLine;
}

function classNameMatches(
	source: string,
): Array<{ full: string; classString: string; start: number }> {
	const matches: Array<{ full: string; classString: string; start: number }> = [];
	const regex = /\bclassName\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*"([^"]*)"\s*\})/g;
	for (const match of source.matchAll(regex)) {
		matches.push({
			full: match[0],
			classString: match[1] ?? match[2] ?? match[3] ?? "",
			start: match.index ?? 0,
		});
	}
	return matches;
}

/* ------------------------------------------------------------------ */
/* tw() object emission                                                */
/* ------------------------------------------------------------------ */

interface ObjectNode {
	entries: Array<{ key: string; value: string | true | ObjectNode }>;
}

function insertMapped(root: ObjectNode, mapped: MappedToken): void {
	let node = root;
	for (const variant of mapped.variants) {
		const existing = node.entries.find((e) => e.key === variant && typeof e.value === "object");
		if (existing !== undefined) {
			node = existing.value as ObjectNode;
		} else {
			const created: ObjectNode = { entries: [] };
			node.entries.push({ key: variant, value: created });
			node = created;
		}
	}
	node.entries.push({ key: mapped.key, value: mapped.value });
}

function serializeObject(node: ObjectNode, indent: string): string {
	if (node.entries.length === 0) return "{}";
	const inner = node.entries
		.map((entry) => {
			const key = /^[A-Za-z_$][\w$]*$/.test(entry.key) ? entry.key : JSON.stringify(entry.key);
			const value =
				typeof entry.value === "object"
					? serializeObject(entry.value, `${indent}\t`)
					: entry.value === true
						? "true"
						: JSON.stringify(entry.value);
			return `${indent}\t${key}: ${value},`;
		})
		.join("\n");
	return `{\n${inner}\n${indent}}`;
}

/* ------------------------------------------------------------------ */
/* Mode: tw                                                            */
/* ------------------------------------------------------------------ */

function transformTw(
	source: string,
	meta: PandwindMeta,
	options: TransformOptions,
): TransformResult {
	const marker = options.skipMarker ?? SKIP_MARKER_DEFAULT;
	const result: TransformResult = {
		code: source,
		changed: false,
		converted: 0,
		unmappedTokens: [],
		skippedByMarker: 0,
	};
	const edits: Array<Edit> = [];
	let needsCx = false;

	for (const match of classNameMatches(source)) {
		if (hasSkipMarker(source, match.start, marker)) {
			result.skippedByMarker++;
			continue;
		}
		const outcome = mapClassList(match.classString, meta);
		for (const token of outcome.unmapped) {
			result.unmappedTokens.push({ file: options.file, token: token.raw, reason: token.reason });
		}
		if (outcome.mapped.length === 0) continue; // nothing typed to gain

		const root: ObjectNode = { entries: [] };
		for (const mapped of outcome.mapped) insertMapped(root, mapped);

		let replacement: string;
		if (outcome.unmapped.length === 0) {
			replacement = `className={ tw(${serializeObject(root, "\t")}) }`;
		} else {
			const residual = outcome.unmapped.map((u) => u.raw).join(" ");
			replacement = `className={ cx(tw(${serializeObject(root, "\t")}), ${JSON.stringify(residual)}) }`;
			needsCx = true;
		}
		result.converted++;
		edits.push({ start: match.start, end: match.start + match.full.length, text: replacement });
	}

	if (edits.length > 0) {
		let code = ensureImport(applyEdits(source, edits), 'import { tw } from "pandwind/tw";');
		if (needsCx) code = ensureImport(code, 'import { cx } from "pandwind/cx";');
		return { ...result, code, changed: code !== source };
	}
	return result;
}

/* ------------------------------------------------------------------ */
/* Mode: cx (clsx / classnames / tailwind-merge -> cx)                 */
/* ------------------------------------------------------------------ */

export function rewriteClsxImports(code: string): {
	code: string;
	renamed: string[];
	removedImports: number;
} {
	const renamed: string[] = [];
	let removedImports = 0;

	code = code.replace(
		/import\s+(\w+)\s+from\s+["'](clsx|classnames|classcat|tailwind-merge)["'];?\n?/g,
		(_m, local: string) => {
			renamed.push(local);
			removedImports++;
			return "";
		},
	);
	code = code.replace(
		/import\s*\{\s*(?:\w+\s+as\s+)?(clsx|classNames|classnames|tailwind-merge|twMerge)(?:\s+as\s+(\w+))?\s*\}\s*from\s*["'][^"']*["'];?\n?/g,
		(_m, _imported: string, alias: string | undefined) => {
			renamed.push(alias ?? _imported);
			removedImports++;
			return "";
		},
	);

	if (renamed.length > 0) {
		code = ensureImport(code, 'import { cx } from "pandwind/cx";');
		for (const name of renamed) {
			if (name !== "cx") code = code.replace(new RegExp(`\\b${name}\\b`, "g"), "cx");
		}
	}
	return { code, renamed, removedImports };
}

function transformCx(
	source: string,
	_meta: PandwindMeta,
	options: TransformOptions,
): TransformResult {
	const marker = options.skipMarker ?? SKIP_MARKER_DEFAULT;
	const wrapperRegex = /\btwMerge\s*\(\s*(?:cx|clsx)\s*\(([^()]*)\)\s*\)/g;
	let converted = 0;
	for (const match of source.matchAll(wrapperRegex)) {
		if (hasSkipMarker(source, match.index ?? 0, marker)) continue;
		converted++;
	}
	let working = wrapperRegex.test(source)
		? source.replace(wrapperRegex, (_m, args: string) => `cx(${args.trim()})`)
		: source;

	const imports = rewriteClsxImports(working);
	converted += imports.renamed.length;
	working = imports.code;

	return {
		code: working,
		changed: working !== source,
		converted,
		unmappedTokens: [],
		skippedByMarker: 0,
	};
}

/* ------------------------------------------------------------------ */
/* Mode: css                                                           */
/* ------------------------------------------------------------------ */

/** kebab-case CSS property -> camelCase object key. */
const camelProperty = (prop: string): string =>
	prop.replace(/-(\w|$)/g, (_m, char: string) => char.toUpperCase());

function transformCss(
	source: string,
	meta: PandwindMeta,
	options: TransformOptions,
): TransformResult {
	const marker = options.skipMarker ?? SKIP_MARKER_DEFAULT;
	const result: TransformResult = {
		code: source,
		changed: false,
		converted: 0,
		unmappedTokens: [],
		skippedByMarker: 0,
	};

	const canEmit = hasCssBinding(source);
	const edits: Array<Edit> = [];

	for (const match of classNameMatches(source)) {
		if (hasSkipMarker(source, match.start, marker)) {
			result.skippedByMarker++;
			continue;
		}
		const tokens = tokenizeClassList(match.classString);
		const declarations: Array<[string, string]> = [];
		let allMapped = tokens.length > 0;

		for (const token of tokens) {
			const resolved = meta.bridgeInverse.get(token);
			if (resolved === undefined) {
				allMapped = false;
				result.unmappedTokens.push({
					file: options.file,
					token,
					reason: "not in generated bridge (css mode)",
				});
			} else {
				declarations.push([camelProperty(resolved.property), resolved.value]);
			}
		}
		if (!allMapped) continue;
		if (!canEmit) {
			result.unmappedTokens.push({
				file: options.file,
				token: "(file)",
				reason: "css mode needs an existing css binding in the file",
			});
			continue;
		}

		const body = declarations
			.map(([prop, value]) => {
				const key = /^[A-Za-z_$][\w$]*$/.test(prop) ? prop : JSON.stringify(prop);
				return `\t${key}: ${JSON.stringify(value)},`;
			})
			.join("\n");
		edits.push({
			start: match.start,
			end: match.start + match.full.length,
			text: `className={ css.class({\n${body}\n}) }`,
		});
		result.converted++;
	}

	if (edits.length === 0) return result;
	const code = applyEdits(source, edits);
	return { ...result, code, changed: code !== source };
}

/* ------------------------------------------------------------------ */
/* Mode: keep (analysis only)                                          */
/* ------------------------------------------------------------------ */

function transformKeep(
	source: string,
	meta: PandwindMeta,
	options: TransformOptions,
): TransformResult {
	const result: TransformResult = {
		code: source,
		changed: false,
		converted: 0,
		unmappedTokens: [],
		skippedByMarker: 0,
	};
	for (const match of classNameMatches(source)) {
		const outcome = mapClassList(match.classString, meta);
		result.converted += outcome.mapped.length;
		for (const token of outcome.unmapped) {
			result.unmappedTokens.push({ file: options.file, token: token.raw, reason: token.reason });
		}
		if (hasSkipMarker(source, match.start, options.skipMarker ?? SKIP_MARKER_DEFAULT)) {
			result.skippedByMarker++;
		}
	}
	return result;
}

/* ------------------------------------------------------------------ */

export function transformSource(
	source: string,
	meta: PandwindMeta,
	options: TransformOptions,
): TransformResult {
	if (options.sources !== undefined && options.sources.length > 0) {
		const marker = options.skipMarker ?? SKIP_MARKER_DEFAULT;
		const sourceAcc: TransformResult = {
			code: source,
			changed: false,
			converted: 0,
			unmappedTokens: [],
			skippedByMarker: 0,
		};
		sourceAcc.code = runSourcePasses(
			source,
			meta,
			options.sources,
			{ marker, file: options.file },
			sourceAcc,
		);
		const afterSources = sourceAcc;
		const modeResult = runMode(options.mode, afterSources.code, meta, options);
		return {
			code: modeResult.code,
			changed: modeResult.code !== source,
			converted: afterSources.converted + modeResult.converted,
			unmappedTokens: [...afterSources.unmappedTokens, ...modeResult.unmappedTokens],
			skippedByMarker: afterSources.skippedByMarker + modeResult.skippedByMarker,
		};
	}
	return runMode(options.mode, source, meta, options);
}

function runMode(
	mode: MigrateMode,
	source: string,
	meta: PandwindMeta,
	options: TransformOptions,
): TransformResult {
	switch (mode) {
		case "tw":
			return transformTw(source, meta, options);
		case "cx":
			return transformCx(source, meta, options);
		case "css":
			return transformCss(source, meta, options);
		case "keep":
			return transformKeep(source, meta, options);
	}
}
