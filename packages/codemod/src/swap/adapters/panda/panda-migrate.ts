/**
 * Panda project migration orchestrator.
 *
 * One entry point (`runPandaMigration`) drives the whole inbound flow over
 * a host app:
 *
 * 1. collect files, load the host panda theme (token vars + textStyles);
 * 2. scan project-wide styling usage (recipes/patterns/jsx/factory tags);
 * 3. tier decision per variant definition: ONE call site folds inline,
 *    shared definitions re-emit as dedicated modules with identical export
 *    names under `<alias>/<outDir>/{recipes,patterns,jsx}/`;
 * 4. rewrite call sites: css({...}) -> css.class({...}), `<panda.x …>` ->
 *    `<x className={…}>`, styled-system import specifiers -> emitted
 *    modules; anything non-literal keeps a skip marker (never half-converted).
 */
import { basename, dirname, join, relative } from "node:path";
import type { PandwindMeta } from "../../../meta.ts";
import { SourcePass } from "../../../source-pass-utils.ts";
import { planPandwindNextIntegration } from "../../host-integration.ts";
import { CodemodAdapterId } from "../../identifiers.ts";
import {
	foldRecipeCall,
	renderCssBootstrap,
	renderPandaPreset,
	renderPatternModule,
	renderRecipeModule,
	renderStackBootstrap,
	renderVirtualCssDeclaration,
} from "./modules.ts";
import { BUILTIN_PATTERNS } from "./patterns.ts";
import { aliasSpecifier, type ProjectUsage } from "./project.ts";
import { parseObjectLiteral } from "../../parse.ts";
import { PandaCallKindTag, PandaRecipeKindTag } from "./parse.ts";
import { discoverPandaMigration, type PandaMigrationFile } from "./migration-discovery.ts";
import type { PandaMigrationWorkspace } from "./migration-discovery.ts";
import { createSourceWorkspace } from "pandwind/source/workspace";
import { SOURCE_SCANNER_SERVICE } from "pandwind/source";
import { walk, type OxcNode } from "pandwind/tw/literal";
import { NodeKind } from "pandwind/tw/literal";
import { createPandaProjectFileSystem, type PandaProjectFileSystem } from "./panda-file-system.ts";
import {
	convertPandaRecipe,
	convertPandaStyle,
	emitPandaStyle,
	rewritePandaSource,
	validatePandaSource,
} from "./migration-stages.ts";
import type { PandaTheme } from "./theme.ts";
import { literalToPlain, normalizePandaStyleObject, parsePandaCalls } from "./parse.ts";
import {
	TokenReferenceFormat,
	type TokenReferenceFormat as TokenReferenceFormatValue,
} from "../../tokens.ts";
import { simplifyPandwindStaticStyles } from "../../static-style-simplifier.ts";

export interface PandaMigrateOptions {
	projectRoot: string;
	patterns: Array<string>;
	meta: PandwindMeta;
	/** Output folder name under the alias root (default "pandwind"). */
	outDirName?: string;
	write: boolean;
	diff: boolean;
	skipMarker: string;
	/** Preserve existing generated modules unless explicitly forcing regeneration. */
	force?: boolean;
	/** @internal pipeline-provided discovery result; avoids a second scan. */
	workspace?: PandaMigrationWorkspace;
	/** @internal injectable host-file effects for config integration and emission. */
	fileSystem?: PandaProjectFileSystem;
	/** Token spelling policy used by generated Pandwind sources and modules. */
	tokenReferenceFormat?: TokenReferenceFormatValue;
	/** Keep static style calls colocated unless module-scope hoisting is requested. */
	hoistStaticStyles?: boolean;
}

export interface PandaMigrateReport {
	filesScanned: number;
	filesChanged: number;
	cssCallsConverted: number;
	cssCallsFlagged: number;
	factoryElementsConverted: number;
	factoryElementsFlagged: number;
	emittedModules: Array<string>;
	tier0Folded: Array<string>;
	tier1Modules: Array<string>;
	anatomyResidualRecipes: Array<string>;
	patternModules: Array<string>;
	residualsByKind: Record<string, number>;
	notes: Array<string>;
}

type FileEntry = PandaMigrationFile;

/** Longest common directory of all collected files (project-root guess). */
export function inferCommonRoot(files: Array<{ path: string }>): string {
	if (files.length === 0) return process.cwd();
	let common = dirname(files[0]!.path);
	for (const f of files.slice(1)) {
		while (!f.path.startsWith(`${common}/`)) {
			const parent = dirname(common);
			if (parent === common) return common;
			common = parent;
		}
	}
	return common;
}

/* ------------------------------------------------------------------ */
/* emission helpers                                                    */
/* ------------------------------------------------------------------ */

function irToText(
	ir: SwapIrLike,
	meta: PandwindMeta,
	tokenReferenceFormat?: TokenReferenceFormatValue,
): string {
	return emitPandaStyle(ir, meta, tokenReferenceFormat);
}

const cssImportFor = (depth: number): string =>
	depth <= 0 ? "./css" : `${"../".repeat(depth)}css`;

const uniquePandaCssBinding = (source: string): string => {
	let binding = "pandwindCss";
	let suffix = 2;
	while (source.includes(binding)) binding = `pandwindCss${suffix++}`;
	return binding;
};

const pandaCssCallText = (text: string, binding: string): string =>
	binding === "css" ? text : text.replace(/^css(?=\.class\b)/u, binding);

/** Register the generated extractor in host frameworks that need a plugin. */
function integrateNextApp(
	projectRoot: string,
	outDir: string,
	write: boolean,
	notes: string[],
	fileSystem: PandaProjectFileSystem,
): void {
	const plan = planPandwindNextIntegration({
		projectRoot,
		outputDirectory: outDir,
		fileSystem,
		presetFile: "preset.ts",
		presetBinding: "preset",
	});
	notes.push(...plan.notes);
	if (write) {
		for (const change of plan.fileChanges) fileSystem.write(change.path, change.content);
	}
}

/** Stop package lifecycle scripts from recreating Panda's obsolete output. */
function removePandaCodegenScripts(
	projectRoot: string,
	write: boolean,
	notes: string[],
	fileSystem: PandaProjectFileSystem,
	preservePandaSource: boolean,
): void {
	const packagePath = join(projectRoot, "package.json");
	const packageSource = fileSystem.read(packagePath);
	if (packageSource === undefined) return;
	let packageJson: { scripts?: Record<string, string> };
	try {
		packageJson = JSON.parse(packageSource) as {
			scripts?: Record<string, string>;
		};
	} catch {
		return;
	}
	if (packageJson.scripts === undefined) return;
	const hasPandaCodegenScript = Object.values(packageJson.scripts).some((command) =>
		/\bpanda\s+codegen\b/.test(command),
	);
	if (preservePandaSource) {
		if (hasPandaCodegenScript) {
			notes.push(
				"kept Panda codegen scripts because residual Panda source still uses its generated system",
			);
		}
		return;
	}

	let changed = false;
	for (const [name, command] of Object.entries(packageJson.scripts)) {
		if (!/\bpanda\s+codegen\b/.test(command)) continue;
		const remaining = command
			.split(/\s*&&\s*/)
			.filter((part) => !/^panda\s+codegen(?:\s|$)/.test(part.trim()))
			.join(" && ")
			.trim();
		if (remaining === "") delete packageJson.scripts[name];
		else packageJson.scripts[name] = remaining;
		changed = true;
	}
	if (!changed) return;
	notes.push("removed Panda codegen lifecycle scripts from package.json");
	if (write) fileSystem.write(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

/** Keep generated imports after a file's directive prologue (`"use client"`). */
function importInsertionOffset(source: string): number {
	let offset = source.charCodeAt(0) === 0xfeff ? 1 : 0;
	if (source.startsWith("#!", offset)) {
		const newline = source.indexOf("\n", offset);
		offset = newline === -1 ? source.length : newline + 1;
	}

	const skipTrivia = (at: number): number => {
		let next = at;
		for (;;) {
			while (/\s/.test(source[next] ?? "")) next++;
			if (source.startsWith("//", next)) {
				const newline = source.indexOf("\n", next + 2);
				next = newline === -1 ? source.length : newline + 1;
				continue;
			}
			if (source.startsWith("/*", next)) {
				const end = source.indexOf("*/", next + 2);
				next = end === -1 ? source.length : end + 2;
				continue;
			}
			return next;
		}
	};

	for (;;) {
		const start = skipTrivia(offset);
		const quote = source[start];
		if (quote !== "'" && quote !== '"') return start;
		let end = start + 1;
		let escaped = false;
		for (; end < source.length; end++) {
			const char = source[end];
			if (escaped) {
				escaped = false;
				continue;
			}
			if (char === "\\") {
				escaped = true;
				continue;
			}
			if (char === quote) break;
		}
		if (source[end] !== quote) return start;
		end = skipTrivia(end + 1);
		if (source[end] === ";") end++;
		offset = end;
	}
}

/** Lower Panda's compile-time-only text-style helper to its object payload. */
function defineTextStylesEdits(
	source: string,
): Array<{ start: number; end: number; text: string }> {
	const edits: Array<{ start: number; end: number; text: string }> = [];
	for (const match of source.matchAll(/\bdefineTextStyles\s*\(\s*\{/g)) {
		const callStart = match.index ?? 0;
		const open = source.indexOf("{", callStart);
		const block = SourcePass.matchBlock(source, open);
		if (block === null) continue;
		let end = block.end;
		while (/\s/.test(source[end] ?? "")) end++;
		if (source[end] !== ")") continue;
		edits.push({ start: callStart, end: end + 1, text: source.slice(open, block.end) });
	}
	for (const match of source.matchAll(
		/import\s*\{\s*defineTextStyles\s*\}\s*from\s*["'][^"']+["']\s*;?\s*/g,
	)) {
		edits.push({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length, text: "" });
	}
	return edits;
}

function countResidual(report: PandaMigrateReport, kind: string, amount = 1): void {
	report.residualsByKind[kind] = (report.residualsByKind[kind] ?? 0) + amount;
}

/** Compact unified diff for the project-migration path. */
function unifiedDiff(before: string, after: string, file: string): string {
	if (before === after) return "";
	const removed = before.split("\n").map((line) => `-${line}`);
	const added = after.split("\n").map((line) => `+${line}`);
	return [
		`--- a/${file}`,
		`+++ b/${file}`,
		`@@ -1,${removed.length} +1,${added.length} @@`,
		...removed,
		...added,
	].join("\n");
}

type SwapIrLike = import("../../ir.ts").SwapIR;

/* ------------------------------------------------------------------ */
/* variant (cva/sva/defineRecipe) definitions                          */
/* ------------------------------------------------------------------ */

interface RecipeDef {
	name: string;
	kind: "cva" | "sva";
	file: FileEntry;
	start: number;
	end: number;
	body: string;
}

/** Parse `const X = cva|defineRecipe|sva|defineSlotRecipe({...})` spans. */
function parseRecipeDefs(file: FileEntry): Array<RecipeDef> {
	const excluded = SourcePass.computeExcludedRanges(file.source, file.path);
	const defs: Array<RecipeDef> = [];
	for (const m of file.source.matchAll(
		/(?:const|let|var)\s+([\w$]+)\s*=\s*(?:(cva|defineRecipe)|(sva|defineSlotRecipe))\s*\(\s*\{/g,
	)) {
		if (excluded.isExcluded(m.index ?? -1)) continue;
		const open = (m.index ?? 0) + m[0].length - 1;
		const block = SourcePass.matchBlock(file.source, open);
		if (block === null) continue;
		let end = block.end;
		while (/\s/.test(file.source[end] ?? "")) end++;
		if (file.source[end] === ")") {
			end++;
			if (file.source[end] === ";") end++;
		}
		defs.push({
			name: m[1]!,
			kind: (m[3] !== undefined ? PandaRecipeKindTag.Sva : PandaRecipeKindTag.Cva) as "cva" | "sva",
			file,
			start: m.index ?? 0,
			end,
			body: block.body,
		});
	}
	return defs;
}

/**
 * Remove `...helper({...})` / `...ident` spread elements from an object
 * literal body so recipe definitions using anatomy helpers (`parts(...)`)
 * still parse as data. Returns null when nothing was stripped.
 */
export function stripSpreadElements(body: string): string | null {
	let out = body;
	let stripped = false;
	for (;;) {
		const call = /\.\.\.\s*[\w$]+\s*\(/.exec(out);
		if (call !== null) {
			const open = (call.index ?? 0) + call[0].length - 1;
			// balance parens
			let depth = 0;
			let j = open;
			for (; j < out.length; j++) {
				if (out[j] === "(") depth++;
				else if (out[j] === ")") {
					depth--;
					if (depth === 0) break;
				}
			}
			if (depth !== 0) return null;
			let end = j + 1;
			if (out[end] === ",") end++;
			out = out.slice(0, call.index ?? 0) + out.slice(end);
			stripped = true;
			continue;
		}
		const ident = /\.\.\.\s*[\w$]+\s*(?=[,}])/.exec(out);
		if (ident !== null) {
			let end = (ident.index ?? 0) + ident[0].length;
			if (out[end] === ",") end++;
			out = out.slice(0, ident.index ?? 0) + out.slice(end);
			stripped = true;
			continue;
		}
		// `key: helper({...})` call values (anatomy helpers etc.) -> {}
		const callValue = /([\w$]+|["'][^"']*["'])\s*:\s*[\w$]+\s*\(/.exec(out);
		if (callValue !== null) {
			const openParen = (callValue.index ?? 0) + callValue[0].length - 1;
			let depth = 0;
			let j = openParen;
			for (; j < out.length; j++) {
				if (out[j] === "(") depth++;
				else if (out[j] === ")") {
					depth--;
					if (depth === 0) break;
				}
			}
			if (depth !== 0) return null;
			out = out.slice(0, callValue.index ?? 0) + `${callValue[1]}: {}` + out.slice(j + 1);
			stripped = true;
			continue;
		}
		break;
	}
	return stripped ? out : null;
}

interface CallSite {
	file: FileEntry;
	start: number;
	end: number;
	argsLiteral: boolean;
	props?: Record<string, string>;
}

const isStringRecord = (value: unknown): value is Record<string, string> =>
	typeof value === "object" &&
	value !== null &&
	!Array.isArray(value) &&
	Object.values(value).every((entry) => typeof entry === "string");

/** Call sites of a definition's binding, excluding its own declaration. */
function findCallSites(
	files: Array<FileEntry>,
	def: RecipeDef,
	exportNames: ReadonlyMap<string, string>,
): Array<CallSite> {
	const names = [def.name];
	const cls = exportNames.get(def.name);
	if (cls !== undefined && cls !== def.name) names.push(cls);
	const sites: Array<CallSite> = [];
	for (const f of files) {
		for (const name of names) {
			const re = new RegExp(`(?<![\\w.$])${name}\\s*\\(`, "g");
			for (const m of f.source.matchAll(re)) {
				const start = m.index ?? 0;
				if (f.path === def.file.path && start >= def.start && start < def.end) continue;
				const openParen = start + m[0].length - 1;
				let depth = 0;
				let j = openParen;
				for (; j < f.source.length; j++) {
					if (f.source[j] === "(") depth++;
					else if (f.source[j] === ")") {
						depth--;
						if (depth === 0) break;
					}
				}
				const argsRaw = f.source.slice(openParen + 1, j).trim();
				const stripped = argsRaw.startsWith("{")
					? argsRaw.slice(1, argsRaw.endsWith("}") ? -1 : undefined)
					: null;
				const parsedArgs = stripped === null ? null : parseObjectLiteral(stripped);
				const emptyArgs = argsRaw === "{}";
				sites.push({
					file: f,
					start,
					end: j + 1,
					argsLiteral: argsRaw === "" || emptyArgs || parsedArgs !== null,
					props: emptyArgs
						? {}
						: parsedArgs === null
							? undefined
							: (() => {
									const props = literalToPlain(parsedArgs);
									return isStringRecord(props) ? props : undefined;
								})(),
				});
			}
		}
	}
	return sites;
}

const pandaCssBindingsFromSource = (
	source: string,
	excluded: (start: number) => boolean,
): Array<string> => {
	const bindings = new Set<string>();
	const imports = /import\s*\{([^}]*)\}\s*from\s*(["'])([^"']*styled-system\/css)\2\s*;?/gu;
	for (const match of source.matchAll(imports)) {
		const start = match.index ?? 0;
		const moduleOffset = start + match[0]!.lastIndexOf(match[3]!);
		if (excluded(moduleOffset) && !isActualImportSpecifier(source, moduleOffset)) continue;
		for (const rawSpecifier of match[1]!.split(",")) {
			const [imported, local = imported] = rawSpecifier.trim().split(/\s+as\s+/u);
			if (imported !== "css" || local === undefined || !/^[A-Za-z_$][\w$]*$/u.test(local)) continue;
			bindings.add(local);
		}
	}
	if (bindings.size === 0 && !hasCssBinding(source, "css", excluded)) {
		const globalCssCalls = /(?<![\w.])css\s*\(/gu;
		if ([...source.matchAll(globalCssCalls)].some((match) => !excluded(match.index ?? -1))) {
			bindings.add("css");
		}
	}
	return [...bindings];
};

const escapePandaBinding = (binding: string): string =>
	binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const unparsedPandaCssCallStarts = (
	source: string,
	bindings: readonly string[],
	excluded: (start: number) => boolean,
	parsedStarts: ReadonlySet<number>,
): Array<number> => {
	const starts = new Set<number>();
	for (const binding of bindings) {
		const calls = new RegExp(`(?<![\\w.])${escapePandaBinding(binding)}\\s*\\(`, "gu");
		for (const match of source.matchAll(calls)) {
			const start = match.index ?? -1;
			if (start < 0 || excluded(start) || parsedStarts.has(start)) continue;
			let argumentStart = start + match[0]!.length;
			while (/\s/u.test(source[argumentStart] ?? "")) argumentStart++;
			if (source[argumentStart] === "{") continue;
			starts.add(start);
		}
	}
	return [...starts].toSorted((left, right) => left - right);
};

/* ------------------------------------------------------------------ */
/* <panda.x> JSX scanning + rewriting                                  */
/* ------------------------------------------------------------------ */

/** Props that stay DOM attributes (never become declarations). */
const DOM_ATTR_RE =
	/^(key|ref|children|as|href|src|alt|title|target|rel|role|type|id|lang|dir|hidden|tabIndex|download|loading|method|action|placeholder|for|style|aria-[\w-]+|data-[\w-]+|on[A-Z][\w]*)$/;

interface FactoryAttr {
	name: string;
	nameStart: number;
	attrEnd: number;
	/** Raw value text: quotes included for string literals, braces excluded. */
	valueText: string | null;
	/** Quoted JSX string attribute ("…"/'…') — always a literal string. */
	quoted: boolean;
	literal: boolean;
}

interface FactoryElement {
	start: number;
	openEnd: number;
	selfClosing: boolean;
	tag: string;
	attrs: Array<FactoryAttr>;
}

type JsxTagMatcher = (name: {
	type?: string;
	object?: { name?: string };
	property?: { name?: string };
	name?: string;
}) => string | undefined;

const scanJsxElements = (
	source: string,
	isExcluded: (start: number) => boolean,
	matchTag: JsxTagMatcher,
): Array<FactoryElement> => {
	const out: Array<FactoryElement> = [];
	let program: OxcNode;
	try {
		program = SOURCE_SCANNER_SERVICE.parse({ file: "panda-factory.tsx", source })
			.program as unknown as OxcNode;
	} catch {
		return out;
	}
	walk(program, (node) => {
		if (node.type !== NodeKind.JSXElement) return;
		const opening = (node as { openingElement?: unknown }).openingElement;
		if (opening === null || typeof opening !== "object") return;
		const element = opening as {
			type?: string;
			name?: {
				type?: string;
				object?: { name?: string };
				property?: { name?: string };
				name?: string;
			};
			attributes?: unknown[];
			selfClosing?: boolean;
			start?: number;
			end?: number;
		};
		const name = element.name;
		const tag = name === undefined ? undefined : matchTag(name);
		if (
			tag === undefined ||
			element.start === undefined ||
			element.end === undefined ||
			isExcluded(element.start)
		)
			return;
		const attrs: Array<FactoryAttr> = [];
		for (const raw of element.attributes ?? []) {
			if (raw === null || typeof raw !== "object") continue;
			const attribute = raw as {
				type?: string;
				name?: { name?: string };
				value?: {
					type?: string;
					value?: unknown;
					raw?: string;
					expression?: { start?: number; end?: number };
				} | null;
				start?: number;
				end?: number;
			};
			if (attribute.start === undefined || attribute.end === undefined) continue;
			if (attribute.type === NodeKind.JSXSpreadAttribute) {
				attrs.push({
					name: "...spread",
					nameStart: attribute.start,
					attrEnd: attribute.end,
					valueText: null,
					quoted: false,
					literal: false,
				});
				continue;
			}
			const attrName = attribute.name?.name;
			if (attrName === undefined) continue;
			const value = attribute.value;
			if (value === null || value === undefined) {
				attrs.push({
					name: attrName,
					nameStart: attribute.start,
					attrEnd: attribute.end,
					valueText: null,
					quoted: false,
					literal: true,
				});
				continue;
			}
			if (value.type === NodeKind.Literal && typeof value.value === "string") {
				attrs.push({
					name: attrName,
					nameStart: attribute.start,
					attrEnd: attribute.end,
					valueText: value.value,
					quoted: true,
					literal: true,
				});
				continue;
			}
			if (value.type === NodeKind.JSXExpressionContainer) {
				const expression = value.expression;
				const start = expression?.start;
				const end = expression?.end;
				const valueText =
					start === undefined || end === undefined ? "" : source.slice(start, end).trim();
				const objBody = stripOuterBraces(valueText);
				const literal =
					(objBody !== null && parseObjectLiteral(objBody) !== null) ||
					/^"[^"]*"$|^'[^']*'$|^-?\d+(\.\d+)?$|^true$|^false$/.test(valueText);
				attrs.push({
					name: attrName,
					nameStart: attribute.start,
					attrEnd: attribute.end,
					valueText,
					quoted: false,
					literal,
				});
			}
		}
		out.push({
			start: element.start,
			openEnd: element.end,
			selfClosing: element.selfClosing === true,
			tag,
			attrs,
		});
	});
	return out;
};

/** Scan `<panda.tag …>` opening tags from the shared AST; spreads bail out. */
export function scanFactoryElements(
	source: string,
	isExcluded: (start: number) => boolean,
): Array<FactoryElement> {
	return scanJsxElements(source, isExcluded, (name) =>
		name.type === NodeKind.JSXMemberExpression && name.object?.name === "panda"
			? name.property?.name
			: undefined,
	);
}

/** Scan imported Panda JSX components without creating a wrapper module. */
const scanImportedJsxElements = (
	source: string,
	isExcluded: (start: number) => boolean,
	components: ReadonlySet<string>,
): Array<FactoryElement> =>
	scanJsxElements(source, isExcluded, (name) =>
		name.type === NodeKind.JSXIdentifier && name.name !== undefined && components.has(name.name)
			? name.name
			: undefined,
	);

function renderStyleValue(v: unknown): string {
	if (Array.isArray(v)) return `[${v.map(renderStyleValue).join(", ")}]`;
	if (typeof v === "object" && v !== null) {
		return `{ ${Object.entries(v)
			.map(([k, val]) => `${JSON.stringify(k)}: ${renderStyleValue(val)}`)
			.join(", ")} }`;
	}
	return JSON.stringify(v);
}

/** `{ … }` -> `…` when the text is one braced object; else null. */
function stripOuterBraces(text: string): string | null {
	const t = text.trim();
	if (!(t.startsWith("{") && t.endsWith("}"))) return null;
	let depth = 0;
	for (let k = 0; k < t.length; k++) {
		if (t[k] === "{") depth++;
		else if (t[k] === "}") {
			depth--;
			if (depth === 0 && k !== t.length - 1) return null;
		}
	}
	return depth === 0 ? t.slice(1, -1) : null;
}

/** Bare-expression scalars only (quotes already handled upstream). */
function styleScalarOf(raw: string): string | number | boolean | null {
	const t = raw.trim();
	if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
	if (t === "true" || t === "false") return t === "true";
	return null;
}

const openingAttributePrefix = (
	source: string,
	offset: number,
	removed: readonly { start: number; end: number }[] = [],
): string => {
	let cursor = offset - 1;
	let moved = true;
	while (moved) {
		moved = false;
		for (const range of removed) {
			if (cursor >= range.start && cursor < range.end) {
				cursor = range.start - 1;
				moved = true;
				break;
			}
		}
	}
	return /\s/u.test(source[cursor] ?? "") ? "" : " ";
};

/**
 * Replacement edits for one convertible factory element; null when any
 * style prop is non-literal (caller flags instead of half-converting).
 */
export function factoryEdits(
	el: FactoryElement,
	source: string,
	meta: PandwindMeta,
	theme: PandaTheme,
	tokenReferenceFormat?: TokenReferenceFormatValue,
	cssBinding = "css",
): Array<{ start: number; end: number; text: string }> | null {
	const kept: Array<string> = [];
	const styleEntries: Array<[string, unknown]> = [];
	let styleAttributeStart: number | undefined;
	let existingClassExpr: string | null = null;
	for (const attr of el.attrs) {
		if (attr.name === "className" && attr.valueText !== null) {
			existingClassExpr = attr.quoted ? JSON.stringify(attr.valueText) : attr.valueText;
			continue;
		}
		if (DOM_ATTR_RE.test(attr.name)) {
			kept.push(
				attr.valueText === null
					? attr.name
					: /^[\w$]+$/.test(attr.valueText)
						? `${attr.name}={${attr.valueText}}`
						: `${attr.name}=${JSON.stringify(attr.valueText)}`,
			);
			continue;
		}
		if (attr.valueText === null) {
			styleAttributeStart ??= attr.nameStart;
			styleEntries.push([attr.name, true]);
			continue;
		}
		if (attr.quoted) {
			styleAttributeStart ??= attr.nameStart;
			styleEntries.push([attr.name, attr.valueText]);
			continue;
		}
		const objText = stripOuterBraces(attr.valueText);
		const parsedObj = objText === null ? null : parseObjectLiteral(objText);
		if (objText !== null && parsedObj !== null) {
			styleAttributeStart ??= attr.nameStart;
			styleEntries.push([attr.name, literalToPlain(parsedObj)]);
			continue;
		}
		const v = styleScalarOf(attr.valueText);
		if (v === null) return null;
		styleAttributeStart ??= attr.nameStart;
		styleEntries.push([attr.name, v]);
	}
	if (!/^[A-Za-z][\w]*$/.test(el.tag)) return null;

	const styleObj: Record<string, unknown> = {};
	for (const [k, v] of styleEntries) styleObj[theme.utilityCatalog.resolveProperty(k) ?? k] = v;
	const ir = convertPandaStyle(styleObj, theme, tokenReferenceFormat);
	if (ir.residuals.length > 0) return null;
	const text = irToText(ir, meta, tokenReferenceFormat);
	if (text === "" && Object.keys(styleObj).length > 0) return null;

	const normalizedStyle = normalizePandaStyleObject(
		Object.fromEntries(styleEntries),
		theme.utilityCatalog,
	);
	const classCallArgs = [
		`{ ${Object.entries(normalizedStyle)
			.map(([k, v]) => `${JSON.stringify(k)}: ${renderStyleValue(v)}`)
			.join(", ")} }`,
	];
	const classExpr = existingClassExpr
		? `${cssBinding}.props(${cssBinding}.class(${classCallArgs}), ${existingClassExpr}).className`
		: Object.keys(styleObj).length === 0
			? (existingClassExpr ?? "")
			: `${cssBinding}.class(${classCallArgs})`;

	const edits: Array<{ start: number; end: number; text: string }> = [];
	// strip every non-DOM attribute span inside the opening tag
	for (const attr of el.attrs) {
		if (DOM_ATTR_RE.test(attr.name)) continue;
		let end = attr.attrEnd;
		while (/\s/.test(source[end] ?? "")) end++;
		edits.push({ start: attr.nameStart, end, text: "" });
	}
	// <panda.x -> <x
	edits.push({ start: el.start, end: el.start + "<panda.".length, text: "<" });
	// inject className just before `>` / `/>`
	if (classExpr !== "") {
		const injectAt = styleAttributeStart ?? (el.selfClosing ? el.openEnd - 2 : el.openEnd - 1);
		edits.push({
			start: injectAt,
			end: injectAt,
			text: `${openingAttributePrefix(source, injectAt, edits)}className={${classExpr}}`,
		});
	}
	void kept;
	return edits;
}

const NATIVE_JSX_COMPONENT_TAGS: Readonly<Record<string, string>> = {
	Box: "div",
	Container: "div",
	Flex: "div",
	Grid: "div",
	Center: "div",
	Circle: "div",
	Square: "div",
	Wrap: "div",
	Spacer: "div",
	Absolute: "div",
	Relative: "div",
	Text: "span",
	Heading: "h2",
	Button: "button",
	Link: "a",
	Image: "img",
};

const STACK_JSX_COMPONENTS: Readonly<Record<string, "row" | "column" | undefined>> = {
	Stack: undefined,
	HStack: "row",
	VStack: "column",
};

const NATIVE_JSX_COMPONENT_STYLES: Readonly<Record<string, Record<string, unknown>>> = {
	Flex: { display: "flex" },
	Grid: { display: "grid" },
	Center: { display: "flex", alignItems: "center", justifyContent: "center" },
	Circle: {
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		borderRadius: "9999px",
	},
	Square: { display: "flex", alignItems: "center", justifyContent: "center" },
	Wrap: { display: "flex", flexWrap: "wrap", alignItems: "center" },
	Spacer: { flex: "1 1 auto" },
	Absolute: { position: "absolute" },
	Relative: { position: "relative" },
};

const STACK_DIRECT_PROPS = new Set(["direction", "gap", "padding", "align", "justify"]);

interface ImportedJsxComponent {
	readonly imported: string;
	readonly local: string;
}

const importedJsxComponents = (source: string): readonly ImportedJsxComponent[] => {
	const components: ImportedJsxComponent[] = [];
	for (const match of source.matchAll(
		/import\s*\{([^}]*)\}\s*from\s*(["'])[^"']*styled-system\/jsx\2\s*;?/g,
	)) {
		for (const rawSpecifier of match[1]!.split(",")) {
			const specifier = rawSpecifier.trim();
			if (specifier === "" || specifier.startsWith("type ")) continue;
			const names = specifier.split(/\s+as\s+/u);
			const imported = names[0]?.trim();
			const local = names[1]?.trim() ?? imported;
			if (imported === undefined || local === undefined || local === "") continue;
			components.push({ imported, local });
		}
	}
	return components;
};

const closeTagEdits = (
	source: string,
	element: FactoryElement,
	from: string,
	to: string,
): Array<{ start: number; end: number; text: string }> => {
	if (from === to || element.selfClosing) return [];
	const closeRe = new RegExp(`</${from}>|<${from}[\\s/>]`, "g");
	closeRe.lastIndex = element.openEnd;
	let nesting = 0;
	for (const match of source.matchAll(closeRe)) {
		if (match[0]!.startsWith("</")) {
			if (nesting === 0) {
				const start = match.index ?? 0;
				return [{ start, end: start + match[0]!.length, text: `</${to}>` }];
			}
			nesting--;
			continue;
		}
		nesting++;
	}
	return [];
};

const stackDirectionAttribute = (
	component: string,
	attrs: readonly FactoryAttr[],
): string | undefined => {
	const direction = STACK_JSX_COMPONENTS[component];
	if (direction === undefined) return undefined;
	return attrs.some((attr) => attr.name === "direction") ? undefined : ` direction="${direction}"`;
};

const staticJsxComponentEdits = (
	element: FactoryElement,
	source: string,
	meta: PandwindMeta,
	theme: PandaTheme,
	tokenReferenceFormat: TokenReferenceFormatValue | undefined,
	component: string,
	localTag: string,
	cssBinding = "css",
): Array<{ start: number; end: number; text: string }> | null => {
	const isStack = STACK_JSX_COMPONENTS[component] !== undefined || component === "Stack";
	const targetTag = isStack ? localTag : NATIVE_JSX_COMPONENT_TAGS[component];
	if (targetTag === undefined) return null;
	let targetFromAs: string | undefined;
	const styleEntries: Array<[string, unknown]> = [];
	let styleAttributeStart: number | undefined;
	let existingClassExpr: string | null = null;
	const removedAttributes: Array<{ start: number; end: number; text: string }> = [];
	for (const attr of element.attrs) {
		if (attr.name === "className") {
			if (attr.valueText === null) return null;
			existingClassExpr = attr.quoted ? JSON.stringify(attr.valueText) : attr.valueText;
			continue;
		}
		if (attr.name === "as") {
			if (isStack) return null;
			if (!attr.quoted || !/^[a-z][\w.-]*$/u.test(attr.valueText ?? "")) return null;
			targetFromAs = attr.valueText ?? undefined;
			let end = attr.attrEnd;
			while (/\s/u.test(source[end] ?? "")) end++;
			removedAttributes.push({ start: attr.nameStart, end, text: "" });
			continue;
		}
		if (isStack && STACK_DIRECT_PROPS.has(attr.name)) continue;
		if (DOM_ATTR_RE.test(attr.name)) continue;
		if (!theme.jsxStyleProps.matches(attr.name) && attr.name !== "css") return null;
		styleAttributeStart ??= attr.nameStart;
		let end = attr.attrEnd;
		while (/\s/u.test(source[end] ?? "")) end++;
		removedAttributes.push({ start: attr.nameStart, end, text: "" });
		if (attr.valueText === null) return null;
		const objectText = stripOuterBraces(attr.valueText);
		const parsedObject = objectText === null ? null : parseObjectLiteral(objectText);
		if (attr.name === "css" && parsedObject !== null) {
			const cssStyle = literalToPlain(parsedObject);
			if (typeof cssStyle !== "object" || cssStyle === null || Array.isArray(cssStyle)) return null;
			for (const [key, value] of Object.entries(cssStyle)) styleEntries.push([key, value]);
			continue;
		}
		if (attr.quoted) {
			styleEntries.push([attr.name, attr.valueText]);
			continue;
		}
		if (parsedObject !== null) {
			styleEntries.push([attr.name, literalToPlain(parsedObject)]);
			continue;
		}
		const scalar = styleScalarOf(attr.valueText);
		if (scalar === null) return null;
		styleEntries.push([attr.name, scalar]);
	}

	const defaults = isStack ? {} : (NATIVE_JSX_COMPONENT_STYLES[component] ?? {});
	const styleObject: Record<string, unknown> = { ...defaults };
	for (const [key, value] of styleEntries) {
		styleObject[theme.utilityCatalog.resolveProperty(key) ?? key] = value;
	}
	const ir = convertPandaStyle(styleObject, theme, tokenReferenceFormat);
	if (ir.residuals.length > 0) return null;
	if (Object.keys(styleObject).length === 0) {
		if (
			targetFromAs === undefined &&
			removedAttributes.length === 0 &&
			stackDirectionAttribute(component, element.attrs) === undefined
		)
			return [];
	} else if (irToText(ir, meta, tokenReferenceFormat) === "") {
		return null;
	}

	const normalizedStyle = normalizePandaStyleObject(styleObject, theme.utilityCatalog);
	const edits = [...removedAttributes];
	if (targetFromAs !== undefined) {
		edits.push({
			start: element.start + 1,
			end: element.start + 1 + localTag.length,
			text: targetFromAs,
		});
		edits.push(...closeTagEdits(source, element, localTag, targetFromAs));
	}
	const injectedAttributes: string[] = [];
	if (Object.keys(normalizedStyle).length > 0) {
		const styleText = `{ ${Object.entries(normalizedStyle)
			.map(([key, value]) => `${JSON.stringify(key)}: ${renderStyleValue(value)}`)
			.join(", ")} }`;
		const classExpression = existingClassExpr
			? `${cssBinding}.props(${cssBinding}.class(${styleText}), ${existingClassExpr}).className`
			: `${cssBinding}.class(${styleText})`;
		injectedAttributes.push(`className={${classExpression}}`);
	}
	const direction = stackDirectionAttribute(component, element.attrs);
	if (direction !== undefined) injectedAttributes.push(direction.trimStart());
	if (!isStack && targetFromAs === undefined) {
		const nativeTag = NATIVE_JSX_COMPONENT_TAGS[component];
		if (nativeTag === undefined) return null;
		edits.push({
			start: element.start + 1,
			end: element.start + 1 + localTag.length,
			text: nativeTag,
		});
		edits.push(...closeTagEdits(source, element, localTag, nativeTag));
	}
	if (injectedAttributes.length > 0) {
		const injectAt =
			styleAttributeStart ?? (element.selfClosing ? element.openEnd - 2 : element.openEnd - 1);
		edits.push({
			start: injectAt,
			end: injectAt,
			text: `${openingAttributePrefix(source, injectAt, edits)}${injectedAttributes.join(" ")}`,
		});
	}
	return edits;
};

const rewritePandaJsxImports = (
	source: string,
	components: readonly ImportedJsxComponent[],
	unsupported: ReadonlySet<string>,
	stackImport: string,
): Array<{ start: number; end: number; text: string }> => {
	if (unsupported.size > 0) return [];
	const importedByLocal = new Map(
		components.map((component) => [component.local, component.imported]),
	);
	const edits: Array<{ start: number; end: number; text: string }> = [];
	for (const match of source.matchAll(
		/import\s*\{([^}]*)\}\s*from\s*(["'])[^"']*styled-system\/jsx\2\s*;?/g,
	)) {
		const start = match.index ?? 0;
		const stackSpecifiers: string[] = [];
		let canRemove = true;
		for (const rawSpecifier of match[1]!.split(",")) {
			const specifier = rawSpecifier.trim();
			if (specifier === "" || specifier.startsWith("type ")) continue;
			const names = specifier.split(/\s+as\s+/u);
			const imported = names[0]?.trim();
			const local = names[1]?.trim() ?? imported;
			if (imported === undefined || local === undefined || !importedByLocal.has(local)) {
				canRemove = false;
				break;
			}
			const direction = STACK_JSX_COMPONENTS[imported];
			if (imported === "Stack" || direction !== undefined) {
				stackSpecifiers.push(imported === "Stack" ? specifier : `Stack as ${local}`);
			} else if (NATIVE_JSX_COMPONENT_TAGS[imported] === undefined) {
				canRemove = false;
				break;
			}
		}
		if (!canRemove) continue;
		const replacement =
			stackSpecifiers.length === 0
				? ""
				: `import { ${stackSpecifiers.join(", ")} } from "${stackImport}";`;
		edits.push({ start, end: start + match[0]!.length, text: replacement });
	}
	return edits;
};

const rewritePandaPatternImports = (
	source: string,
	emittedPatterns: ReadonlySet<string>,
	replacement: string,
): Array<{ start: number; end: number; text: string }> => {
	const edits: Array<{ start: number; end: number; text: string }> = [];
	for (const match of source.matchAll(
		/import\s*\{([^}]*)\}\s*from\s*(["'])[^"']*styled-system\/patterns\2\s*;?/g,
	)) {
		const start = match.index ?? 0;
		const names = match[1]!
			.split(",")
			.map((specifier) => specifier.trim().split(/\s+as\s+/u)[0])
			.filter((name): name is string => name !== undefined && name !== "");
		if (names.length === 0 || names.some((name) => !emittedPatterns.has(name))) continue;
		edits.push({
			start,
			end: start + match[0]!.length,
			text: match[0]!.replace(/styled-system\/patterns/u, replacement),
		});
	}
	return edits;
};

/* ------------------------------------------------------------------ */
/* main orchestration                                                  */
/* ------------------------------------------------------------------ */

export async function runPandaMigration(options: PandaMigrateOptions): Promise<PandaMigrateReport> {
	const { projectRoot, meta, skipMarker } = options;
	const tokenReferenceFormat = options.tokenReferenceFormat ?? TokenReferenceFormat.Preserve;
	const outDirName = options.outDirName || "pandwind";
	const report: PandaMigrateReport = {
		filesScanned: 0,
		filesChanged: 0,
		cssCallsConverted: 0,
		cssCallsFlagged: 0,
		factoryElementsConverted: 0,
		factoryElementsFlagged: 0,
		emittedModules: [],
		tier0Folded: [],
		tier1Modules: [],
		anatomyResidualRecipes: [],
		patternModules: [],
		residualsByKind: {},
		notes: [],
	};

	const workspace = options.workspace ?? (await discoverPandaMigration(options));
	const sourceWorkspace = createSourceWorkspace();
	const fileSystem = options.fileSystem ?? createPandaProjectFileSystem();
	const files = workspace.files;
	report.filesScanned = files.length;
	if (files.length === 0) return report;

	const { aliasInfo, theme } = workspace;
	report.notes.push(...workspace.notes);

	const usage: ProjectUsage = workspace.usage;

	/* ---- variant definitions: recipe libs first, then inline cva/sva ---- */
	const libPaths = new Set(
		sourceWorkspace.files(["**/*.recipe.ts", "**/*.recipe.tsx"], projectRoot),
	);
	const seenDefs = new Set<string>();
	const libDefs: Array<RecipeDef> = [];
	const localDefs: Array<RecipeDef> = [];
	for (const file of files) {
		if (file.path.includes(`/${outDirName}/`)) continue;
		if (/\b(cva|defineRecipe|sva|defineSlotRecipe)\s*\(\s*\{/.test(file.source)) {
			for (const def of parseRecipeDefs(file)) {
				const key = `${file.path}#${def.start}`;
				if (seenDefs.has(key)) continue;
				seenDefs.add(key);
				if (libPaths.has(file.path)) libDefs.push(def);
				else localDefs.push(def);
			}
		}
	}

	/* ---- tier decisions ---- */
	// Put generated files under the alias target (e.g. @/* -> src/*), so
	// `@/pandwind/...` resolves to the files we actually emit.
	const outDir = workspace.outDir;
	const emitted: Array<{ path: string; content: string }> = [];
	const recipeExportNames = new Map<string, string>();
	const recipeModuleNames = new Map<string, string>();
	const emittedRecipeDefs: Array<RecipeDef> = [];
	const queueEmission = (path: string, content: string): void => {
		if (fileSystem.exists(path) && options.force !== true) {
			report.notes.push(
				`preserved existing generated module ${relative(projectRoot, path)} (use --force to regenerate)`,
			);
			return;
		}
		emitted.push({ path, content });
	};

	queueEmission(join(outDir, "preset.ts"), renderPandaPreset(theme, tokenReferenceFormat));
	queueEmission(join(outDir, "css.ts"), renderCssBootstrap());
	queueEmission(join(outDir, "virtual.d.ts"), renderVirtualCssDeclaration());
	const stackImport = aliasSpecifier(aliasInfo, outDirName, "stack");
	const hasStackUsage = [...usage.jsxComponents].some(
		(component) => component === "Stack" || component === "HStack" || component === "VStack",
	);
	if (hasStackUsage) queueEmission(join(outDir, "stack.tsx"), renderStackBootstrap());

	/** Extra per-file edits: declaration removals, folds, import insertion. */
	const fileExtras = new Map<string, Array<{ start: number; end: number; text: string }>>();
	const addExtra = (path: string, edit: { start: number; end: number; text: string }): void => {
		const list = fileExtras.get(path) ?? [];
		list.push(edit);
		fileExtras.set(path, list);
	};
	const preservePandaCssFiles = new Set<string>();
	const residualPandaRecipeNames = new Set<string>();
	let hasPandaSourceResidual = false;
	const markSourceResidual = (file: FileEntry, index: number, hint: string): void => {
		const edits = fileExtras.get(file.path) ?? [];
		applyMarker(edits, file.path, file.source, index, hint, skipMarker);
		fileExtras.set(file.path, edits);
	};
	const recipeResiduals = (recipe: NonNullable<ReturnType<typeof convertPandaRecipe>>) => {
		const nested = [
			...Object.values(recipe.base).flatMap((style) => style.residuals),
			...Object.values(recipe.variants).flatMap((values) =>
				Object.values(values).flatMap((slots) =>
					Object.values(slots).flatMap((style) => style.residuals),
				),
			),
			...recipe.compoundVariants.flatMap((compound) =>
				Object.values(compound.slots).flatMap((style) => style.residuals),
			),
		];
		return [
			...new Map(
				[...recipe.residuals, ...nested].map((residual) => [
					`${residual.kind}:${residual.text}:${residual.hint}`,
					residual,
				]),
			).values(),
		];
	};

	const parseDefIr = (
		def: RecipeDef,
	): NonNullable<ReturnType<typeof convertPandaRecipe>> | null => {
		let bodyText = def.body;
		const strippedBody = stripSpreadElements(bodyText);
		if (strippedBody !== null) {
			bodyText = strippedBody;
			report.notes.push(
				`definition '${def.name}': anatomy/spread elements dropped (parts() has no pandwind runtime meaning)`,
			);
		}
		const ir = convertPandaRecipe(bodyText, def.kind, theme, tokenReferenceFormat);
		if (ir === null) return null;
		for (const residual of recipeResiduals(ir)) countResidual(report, residual.kind);
		return ir;
	};

	const emitTier1 = (
		def: RecipeDef,
		ir: NonNullable<ReturnType<typeof parseDefIr>>,
		anatomyOnly = false,
		local = false,
	): void => {
		const exportName =
			ir.className !== null && /^[\w$]+$/.test(ir.className)
				? ir.className
				: def.name.replace(/Recipe$/, "");
		recipeExportNames.set(def.name, exportName);
		const moduleName = local
			? `${def.name}_${basename(def.file.path).replace(/\.[^.]+$/, "")}`
			: def.name;
		recipeModuleNames.set(`${def.file.path}#${def.start}`, moduleName);
		emittedRecipeDefs.push(def);
		const cssImport = `import { css } from "${cssImportFor(1)}";`;
		let content = renderRecipeModule(exportName, ir, meta, {
			cssImport,
			tokenReferenceFormat,
		});
		if (anatomyOnly) {
			content =
				`// ${skipMarker} (ark-ui anatomy/parts recipe — slot styling needs a manual pass)\n` +
				content;
		}
		if (exportName !== def.name) {
			content += `export { ${exportName} as ${def.name} };\n`;
		}
		queueEmission(join(outDir, "recipes", `${moduleName}.ts`), content);
		tier1Modules.push(def.name);
	};

	const tier1Modules: Array<string> = [];
	const tier0Folded: Array<string> = [];

	// Library recipes are shared by design -> always dedicated modules.
	for (const def of libDefs) {
		const ir = parseDefIr(def);
		if (ir === null) {
			report.notes.push(`definition '${def.name}' is non-literal — flagged at call sites`);
			residualPandaRecipeNames.add(def.name);
			countResidual(report, "dynamic");
			hasPandaSourceResidual = true;
			markSourceResidual(def.file, def.start, "non-literal Panda recipe definition");
			continue;
		}
		const residuals = recipeResiduals(ir);
		if (residuals.length > 0) {
			residualPandaRecipeNames.add(def.name);
			if (ir.className !== null) residualPandaRecipeNames.add(ir.className);
			hasPandaSourceResidual = true;
			report.notes.push(
				`definition '${def.name}' retained because its style semantics are unresolved`,
			);
			markSourceResidual(
				def.file,
				def.start,
				residuals[0]?.hint ?? "unresolved Panda recipe semantics",
			);
			continue;
		}
		const representable =
			Object.values(ir.base).some((v) => v.entries.length > 0) ||
			Object.keys(ir.variants).length > 0;
		emitTier1(def, ir, !representable);
		if (!representable) {
			report.anatomyResidualRecipes.push(def.name);
		}
	}

	// Local (inline) cva/sva definitions: fold single-use literals, else module.
	for (const def of localDefs) {
		const ir = parseDefIr(def);
		if (ir === null) {
			report.notes.push(`definition '${def.name}' is non-literal — flagged at call sites`);
			preservePandaCssFiles.add(def.file.path);
			countResidual(report, "dynamic");
			hasPandaSourceResidual = true;
			markSourceResidual(def.file, def.start, "non-literal Panda recipe definition");
			continue;
		}
		const residuals = recipeResiduals(ir);
		if (residuals.length > 0) {
			preservePandaCssFiles.add(def.file.path);
			hasPandaSourceResidual = true;
			report.notes.push(
				`definition '${def.name}' retained because its style semantics are unresolved`,
			);
			markSourceResidual(
				def.file,
				def.start,
				residuals[0]?.hint ?? "unresolved Panda recipe semantics",
			);
			continue;
		}
		// Inline declarations are file-local in Panda apps. Restrict lookup to
		// their defining file so unrelated `const styles = cva(...)` bindings
		// do not collide and accidentally become one shared module.
		const sites = findCallSites([def.file], def, recipeExportNames);
		const usedAsFactoryRecipe = new RegExp(`panda\\s*\\([^,]+,\\s*${def.name}\\b`).test(
			def.file.source,
		);
		if (sites.length === 0 && !usedAsFactoryRecipe) {
			// dead definition — drop it
			addExtra(def.file.path, { start: def.start, end: def.end, text: "" });
			report.notes.push(`definition '${def.name}' unused — removed`);
			continue;
		}
		if (ir.kind === PandaRecipeKindTag.Cva && sites.length === 1 && sites[0]!.argsLiteral) {
			const site = sites[0]!;
			const folded = foldRecipeCall(ir, site.props ?? {}, meta, tokenReferenceFormat);
			if (folded !== null) {
				addExtra(def.file.path, { start: def.start, end: def.end, text: "" });
				addExtra(site.file.path, {
					start: site.start,
					end: site.end,
					text: folded.text,
				});
				tier0Folded.push(def.name);
				continue;
			}
		}
		emitTier1(def, ir, false, true);
		// re-point the binding at the emitted module
		addExtra(def.file.path, { start: def.start, end: def.end, text: "" });
		const spec = aliasSpecifier(aliasInfo, outDirName, "recipes");
		const insertion = importInsertionOffset(def.file.source);
		addExtra(def.file.path, {
			start: insertion,
			end: insertion,
			text: `import { ${recipeExportNames.get(def.name)} as ${def.name} } from "${spec}/${recipeModuleNames.get(`${def.file.path}#${def.start}`) ?? def.name}";\n`,
		});
	}

	// Pattern modules for builtins and evaluated custom patterns in use.
	const usedBuiltinPatterns = [...usage.patterns].filter((p) => BUILTIN_PATTERNS.has(p)).toSorted();
	const emittedPatternNames = [...usedBuiltinPatterns];
	for (const name of usedBuiltinPatterns) {
		queueEmission(
			join(outDir, "patterns", `${name}.ts`),
			renderPatternModule(name, {
				cssImport: cssImportFor(1),
				propertyAliases: theme.utilityCatalog.propertyAliases,
			}),
		);
		report.patternModules.push(name);
	}
	for (const custom of [...usage.patterns].filter((p) => !BUILTIN_PATTERNS.has(p)).toSorted()) {
		report.notes.push(
			`custom pattern '${custom}' was left as a residual: generated runtime pattern modules are not type-safe`,
		);
	}

	// Barrels keep call-site import rewrites 1:1.
	const recipeBarrel = emittedRecipeDefs
		.filter((def) => libPaths.has(def.file.path))
		.toSorted((a, b) => a.name.localeCompare(b.name))
		.map((def) => {
			const n = def.name;
			const exportName = recipeExportNames.get(n) ?? n;
			const moduleName = recipeModuleNames.get(`${def.file.path}#${def.start}`) ?? n;
			// Keep the authored binding available when export-name normalization changes it.
			return exportName === n
				? `export { ${n} } from "./${moduleName}";`
				: `export { ${exportName}, ${exportName} as ${n} } from "./${moduleName}";`;
		})
		.join("\n");
	queueEmission(join(outDir, "recipes", "index.ts"), `${recipeBarrel}\n`);
	queueEmission(
		join(outDir, "patterns", "index.ts"),
		`${emittedPatternNames.map((n) => `export { ${n} } from "./${n}";`).join("\n")}\n`,
	);

	// token() bridge when the app uses styled-system/tokens.
	if (files.some((f) => /styled-system\/tokens/.test(f.source))) {
		const rows = [...theme.tokenVars.entries()]
			.toSorted(([a], [b]) => a.localeCompare(b))
			.flatMap(([path]) => [
				`\t${JSON.stringify(path)}: ${JSON.stringify(path)},`,
				`\t${JSON.stringify(`$${path.replaceAll(".", "-")}`)}: ${JSON.stringify(path)},`,
			])
			.join("\n");
		queueEmission(
			join(outDir, "token.ts"),
			[
				"/**",
				" * Generated by pandwind-codemod: Panda token() replacement.",
				" * Known paths resolve to Pandwind-owned token references.",
				" * Unknown paths fail closed instead of inventing a CSS variable.",
				" */",
				"const KNOWN: Record<string, string> = {",
				rows,
				"};",
				"",
				"export type Token = string;",
				"",
				"export function token(path: string): string {",
				"\tconst resolved = KNOWN[path];",
				"\tif (resolved === undefined)",
				'\t\tthrow new Error(`Unknown migrated Pandwind token path "${path}"`);',
				"\treturn resolved;",
				"}",
				"",
			].join("\n"),
		);
	}

	report.tier1Modules = [...new Set(tier1Modules)];
	report.tier0Folded = [...new Set(tier0Folded)];
	report.emittedModules = emitted.map((e) => relative(projectRoot, e.path));
	// Never write generated modules that are syntactically invalid. This keeps
	// a bad emitter from leaving a partially migrated project behind.
	for (const e of emitted) {
		try {
			const validation = validatePandaSource(e.path, e.content);
			if (!validation.valid) throw new Error(validation.message);
		} catch (error) {
			report.notes.push(
				`refusing invalid generated module ${relative(projectRoot, e.path)}: ${(error as Error).message}`,
			);
			return report;
		}
	}
	if (options.write) {
		for (const e of emitted) {
			fileSystem.write(e.path, e.content);
		}
	}

	/* ---- call-site rewrite pass ---- */
	const specifierRewrites: Array<[RegExp, string]> = [
		[/([\w@./-]*)styled-system\/recipes/g, aliasSpecifier(aliasInfo, outDirName, "recipes")],
		[/([\w@./-]*)styled-system\/css/g, aliasSpecifier(aliasInfo, outDirName, "css")],
		[/([\w@./-]*)styled-system\/tokens/g, aliasSpecifier(aliasInfo, outDirName, "token")],
	];

	for (const file of files) {
		// Generated modules are inputs to the emission pass, never call-site
		// sources. Skipping them keeps --force reruns from reprocessing our own
		// output and falsely reporting generated files as changed.
		if (file.path.includes(`/${outDirName}/`)) continue;
		const edits: Array<{ start: number; end: number; text: string }> = [
			...(fileExtras.get(file.path) ?? []),
		];
		const mask = SourcePass.computeExcludedRanges(file.source, file.path);
		const masked = (start: number): boolean => mask.isExcluded(start);
		const cssBindings = pandaCssBindingsFromSource(file.source, masked);
		const jsxImports = importedJsxComponents(file.source);
		const jsxComponentsByLocal = new Map(
			jsxImports.map((component) => [component.local, component.imported]),
		);
		const unsupportedJsxComponents = new Set<string>();
		const pandaCalls = parsePandaCalls(file.source, masked, {
			theme,
			tokenReferenceFormat,
			cssBindings,
		});
		const cssCalls = pandaCalls.filter(
			(call) => call.kind === PandaCallKindTag.Css && call.ir !== undefined,
		);
		const dynamicCssCallStarts = unparsedPandaCssCallStarts(
			file.source,
			cssBindings,
			masked,
			new Set(cssCalls.map((call) => call.start)),
		);
		const hasResidualCssCall =
			cssCalls.some((call) => call.ir!.residuals.length > 0) || dynamicCssCallStarts.length > 0;
		const preservePandaCss = preservePandaCssFiles.has(file.path) || hasResidualCssCall;
		if (hasResidualCssCall) preservePandaCssFiles.add(file.path);
		const cssBinding = preservePandaCss
			? uniquePandaCssBinding(file.source)
			: (cssBindings[0] ??
				(hasCssBinding(file.source, "css", masked) ? uniquePandaCssBinding(file.source) : "css"));
		if (preservePandaCss) hasPandaSourceResidual = true;

		// css({...}) -> css.class({...}) / marker
		for (const call of pandaCalls) {
			if (call.kind !== PandaCallKindTag.Css || call.ir === undefined) continue;
			for (const residual of call.ir.residuals) countResidual(report, residual.kind);
			if (call.ir.residuals.length > 0) {
				report.cssCallsFlagged++;
				hasPandaSourceResidual = true;
				applyMarker(
					edits,
					file.path,
					file.source,
					call.start,
					call.ir.residuals[0]!.hint ?? "unrepresentable css()",
					skipMarker,
				);
				continue;
			}
			const sourceBinding =
				cssBindings.find((binding) => file.source.startsWith(binding, call.start)) ?? "css";
			const targetBinding = preservePandaCss ? cssBinding : sourceBinding;
			const text = pandaCssCallText(irToText(call.ir, meta, tokenReferenceFormat), targetBinding);
			let end = call.end;
			const tail = /^\s*\)/.exec(file.source.slice(end));
			if (tail !== null) end += tail[0].length;
			edits.push({ start: call.start, end, text: text || '""' });
			report.cssCallsConverted++;
		}
		for (const start of dynamicCssCallStarts) {
			report.cssCallsFlagged++;
			countResidual(report, "dynamic");
			hasPandaSourceResidual = true;
			applyMarker(edits, file.path, file.source, start, "non-literal Panda css() call", skipMarker);
		}

		// <panda.x …>
		for (const el of scanFactoryElements(file.source, masked)) {
			const factoryIr = convertPandaStyle(
				Object.fromEntries(
					el.attrs
						.filter((attr) => !DOM_ATTR_RE.test(attr.name) && attr.valueText !== null)
						.map((attr) => [
							theme.utilityCatalog.resolveProperty(attr.name) ?? attr.name,
							attr.quoted ? attr.valueText : (styleScalarOf(attr.valueText!) ?? attr.valueText),
						]),
				),
				theme,
				tokenReferenceFormat,
			);
			const elEdits = factoryEdits(el, file.source, meta, theme, tokenReferenceFormat, cssBinding);
			if (elEdits === null) {
				report.factoryElementsFlagged++;
				if (factoryIr.residuals.length === 0) countResidual(report, "dynamic");
				for (const residual of factoryIr.residuals) countResidual(report, residual.kind);
				hasPandaSourceResidual = true;
				applyMarker(
					edits,
					file.path,
					file.source,
					el.start,
					factoryIr.residuals[0]?.hint ?? "non-literal factory props",
					skipMarker,
				);
				continue;
			}
			edits.push(...elEdits);
			report.factoryElementsConverted++;
			for (const residual of factoryIr.residuals) countResidual(report, residual.kind);
			// rename the matching </panda.x> closer too (nesting-aware)
			{
				const tag = el.tag;
				const closeRe = new RegExp(`</panda\\.${tag}>|<panda\\.${tag}[\\s>/]`, "g");
				closeRe.lastIndex = el.openEnd;
				let nest = 0;
				for (const cm of file.source.matchAll(closeRe)) {
					if (cm[0].startsWith("</")) {
						if (nest === 0) {
							edits.push({
								start: cm.index ?? 0,
								end: (cm.index ?? 0) + cm[0].length,
								text: `</${tag}>`,
							});
							break;
						}
						nest--;
					} else {
						nest++;
					}
				}
			}
		}

		for (const el of scanImportedJsxElements(
			file.source,
			masked,
			new Set(jsxComponentsByLocal.keys()),
		)) {
			const component = jsxComponentsByLocal.get(el.tag);
			if (component === undefined) continue;
			const componentEdits = staticJsxComponentEdits(
				el,
				file.source,
				meta,
				theme,
				tokenReferenceFormat,
				component,
				el.tag,
				cssBinding,
			);
			if (componentEdits === null) {
				unsupportedJsxComponents.add(el.tag);
				report.factoryElementsFlagged++;
				countResidual(report, "dynamic");
				hasPandaSourceResidual = true;
				applyMarker(
					edits,
					file.path,
					file.source,
					el.start,
					`non-static ${component} props`,
					skipMarker,
				);
				continue;
			}
			edits.push(...componentEdits);
			report.factoryElementsConverted++;
		}
		edits.push(
			...rewritePandaJsxImports(file.source, jsxImports, unsupportedJsxComponents, stackImport),
		);
		edits.push(
			...rewritePandaPatternImports(
				file.source,
				new Set(emittedPatternNames),
				aliasSpecifier(aliasInfo, outDirName, "patterns"),
			),
		);

		// Import specifiers.
		for (const [re, replacement] of specifierRewrites) {
			for (const m of file.source.matchAll(re)) {
				const startAt = m.index ?? 0;
				// Documentation/code samples inside strings are not imports in the
				// host program and must remain faithful to the original Panda API.
				if (masked(startAt) && !isActualImportSpecifier(file.source, startAt)) continue;
				if (preservePandaCss && m[0]!.endsWith("styled-system/css")) continue;
				if (
					m[0]!.endsWith("styled-system/recipes") &&
					importsResidualPandaRecipe(file.source, startAt, residualPandaRecipeNames)
				) {
					hasPandaSourceResidual = true;
					applyMarker(
						edits,
						file.path,
						file.source,
						startAt,
						"Panda recipe import includes a recipe with unresolved style semantics",
						skipMarker,
					);
					continue;
				}
				edits.push({ start: startAt, end: startAt + m[0].length, text: replacement });
			}
		}
		edits.push(...defineTextStylesEdits(file.source));

		if (edits.length === 0) continue;
		let next = rewritePandaSource(file.source, edits);
		const targetCssCall = new RegExp(`\\b${escapePandaBinding(cssBinding)}\\.class\\s*\\(`, "u");
		const nextMask = SourcePass.computeExcludedRanges(next, file.path);
		if (
			targetCssCall.test(next) &&
			!hasCssBinding(next, cssBinding, (start) => nextMask.isExcluded(start))
		) {
			const importedBinding = cssBinding === "css" ? "css" : `css as ${cssBinding}`;
			const importText = `import { ${importedBinding} } from "${aliasSpecifier(aliasInfo, outDirName, "css")}";\n`;
			const insertion = importInsertionOffset(next);
			next = next.slice(0, insertion) + importText + next.slice(insertion);
		}
		if (next === file.source) continue;
		// cva/sva definitions folded into generated output no longer need their
		// panda-only named imports; leaving them would create unresolved exports.
		next = removeUnusedVariantImports(next, aliasSpecifier(aliasInfo, outDirName, "css"));
		next = removeUnusedFactoryImports(next);
		next = simplifyPandwindStaticStyles(next, file.path, {
			hoistStaticStyles: options.hoistStaticStyles,
		}).code;
		const validation = validatePandaSource(file.path, next);
		if (!validation.valid) {
			report.notes.push(
				`refusing invalid rewrite ${relative(projectRoot, file.path)}: ${validation.message}`,
			);
			continue;
		}
		report.filesChanged++;
		if (options.diff) console.log(unifiedDiff(file.source, next, relative(projectRoot, file.path)));
		if (options.write) fileSystem.write(file.path, next);
	}

	// The generated preset is inert until the host bundler loads the virtual
	// stylesheet. Next/Webpack is common enough to wire automatically, while
	// keeping the integration local to projects that actually have Next config.
	integrateNextApp(projectRoot, outDir, options.write, report.notes, fileSystem);
	removePandaCodegenScripts(
		projectRoot,
		options.write,
		report.notes,
		fileSystem,
		hasPandaSourceResidual,
	);

	return report;
}

function isActualImportSpecifier(source: string, offset: number): boolean {
	const before = source.slice(Math.max(0, offset - 400), offset);
	if (!/\bimport\b[\s\S]*\bfrom\s*["']\s*$/.test(before)) return false;
	let inTemplate = false;
	for (let i = 0; i < offset; i++) {
		if (source[i] !== "`" || source[i - 1] === "\\") continue;
		inTemplate = !inTemplate;
	}
	return !inTemplate;
}

const importsResidualPandaRecipe = (
	source: string,
	offset: number,
	residualNames: ReadonlySet<string>,
): boolean => {
	if (residualNames.size === 0) return false;
	const importStart = source.lastIndexOf("import", offset);
	if (importStart < 0) return false;
	const prefix = source.slice(importStart, offset);
	const match = /^import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["']\s*$/su.exec(prefix);
	if (match === null) return false;
	if (match[0].includes("/*") || match[0].includes("//") || /\btype\b/u.test(match[1]!))
		return true;
	return match[1]!
		.split(",")
		.some((specifier) => residualNames.has(specifier.trim().split(/\s+as\s+/u)[0]!));
};

function hasCssBinding(
	source: string,
	binding = "css",
	excluded: (start: number) => boolean = () => false,
): boolean {
	const importedSpecifier =
		binding === "css"
			? "\\bcss(?:\\s+as\\s+css)?\\s*(?=,|\\})"
			: `\\bcss\\s+as\\s+${escapePandaBinding(binding)}\\s*(?=,|\\})`;
	const importPattern = new RegExp(
		`import\\s*\\{[^}]*${importedSpecifier}[^}]*\\}\\s*from\\s*["'][^"']+["']`,
		"gu",
	);
	if ([...source.matchAll(importPattern)].some((match) => !excluded(match.index ?? -1)))
		return true;
	if (binding !== "css") return false;
	const declarationPattern = /(?:const|let|var|function|class)\s+css\b/gu;
	return [...source.matchAll(declarationPattern)].some((match) => !excluded(match.index ?? -1));
}

function removeUnusedVariantImports(source: string, cssImportPath: string): string {
	const unsupported = new Set(["cva", "sva", "defineRecipe", "defineSlotRecipe"]);
	const excluded = SourcePass.computeExcludedRanges(source, "migration.tsx");
	const hasCall = (name: string): boolean => {
		const re = new RegExp(`\\b${name}\\s*\\(`, "g");
		return [...source.matchAll(re)].some((match) => !excluded.isExcluded(match.index ?? -1));
	};
	return source.replace(
		/import\s*\{([^}]+)\}\s*from\s*(["'])([^"']*\/pandwind\/css)\2[ \t]*;?/g,
		(_full, specifiers: string, quote: string, path: string, offset: number) => {
			if (excluded.isExcluded(offset) && !isActualImportSpecifier(source, offset)) return _full;
			const kept = specifiers
				.split(",")
				.map((specifier) => specifier.trim())
				.filter((specifier) => {
					const name = specifier.split(/\s+as\s+/)[0]!;
					return !unsupported.has(name) || hasCall(name);
				})
				.filter(Boolean);
			const hasResidualRecipe = [...unsupported].some((name) => hasCall(name));
			if (hasResidualRecipe)
				return `import { ${kept.join(", ")} } from ${quote}${cssImportPath}${quote};`;
			return kept.length === 0 ? "" : `import { ${kept.join(", ")} } from ${quote}${path}${quote};`;
		},
	);
}

function removeUnusedFactoryImports(source: string): string {
	const excluded = SourcePass.computeExcludedRanges(source, "migration.tsx");
	const hasFactoryUse = [...source.matchAll(/<panda\.|\bpanda\s*\(/g)].some(
		(match) => !excluded.isExcluded(match.index ?? -1),
	);
	return source.replace(
		/import\s*\{([^}]+)\}\s*from\s*(["'])([^"']*\/pandwind\/jsx)\2[ \t]*;?/g,
		(_full, specifiers: string, quote: string, path: string, offset: number) => {
			if (excluded.isExcluded(offset) && !isActualImportSpecifier(source, offset)) return _full;
			const kept = specifiers
				.split(",")
				.map((specifier) => specifier.trim())
				.filter((specifier) => {
					const name = specifier.split(/\s+as\s+/)[0]!;
					return name !== CodemodAdapterId.Panda || hasFactoryUse;
				})
				.filter(Boolean);
			return kept.length === 0 ? "" : `import { ${kept.join(", ")} } from ${quote}${path}${quote};`;
		},
	);
}

function applyMarker(
	edits: Array<{ start: number; end: number; text: string }>,
	file: string,
	source: string,
	index: number,
	reason: string,
	marker: string,
): void {
	const lineStart = source.lastIndexOf("\n", Math.max(0, index - 1)) + 1;
	const indentMatch = /^\s*/.exec(source.slice(lineStart));
	const indent = indentMatch ? indentMatch[0] : "";
	const markerText = SourcePass.markerText(source, file, index, `// ${marker} (${reason})`);
	if (source.slice(lineStart, index).includes(marker)) return;
	const previousLineStart = source.lastIndexOf("\n", Math.max(0, lineStart - 2)) + 1;
	const previousLine = source
		.slice(previousLineStart, Math.max(previousLineStart, lineStart - 1))
		.trim();
	if (previousLine.includes(marker)) return;
	edits.push({
		start: lineStart,
		end: lineStart,
		text: `${indent}${markerText}\n`,
	});
}
