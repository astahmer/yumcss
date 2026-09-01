/**
 * Panda project migration orchestrator (plan 024 steps 3-6).
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
import { computeExcludedRanges, matchBlock } from "../../../sources.ts";
import { ensureImport } from "../../../shared.ts";
import { CodemodAdapterId } from "../../identifiers.ts";
import {
	foldRecipeCall,
	renderCssBootstrap,
	renderCustomPatternModule,
	renderInternalHelpers,
	renderJsxIndex,
	renderPandaPreset,
	renderPatternModule,
	renderRecipeModule,
	renderVirtualCssDeclaration,
} from "./modules.ts";
import { BUILTIN_PATTERNS } from "./patterns.ts";
import { aliasSpecifier, type ProjectUsage } from "./project.ts";
import { parseObjectLiteral } from "../../parse.ts";
import { discoverPandaMigration, type PandaMigrationFile } from "./migration-discovery.ts";
import type { PandaMigrationWorkspace } from "./migration-discovery.ts";
import { createSourceWorkspace } from "pandwind/source/workspace";
import { createPandaProjectFileSystem, type PandaProjectFileSystem } from "./panda-file-system.ts";
import {
	convertPandaRecipe,
	convertPandaStyle,
	emitPandaStyle,
	rewritePandaSource,
	validatePandaSource,
} from "./migration-stages.ts";
import type { PandaTheme } from "./theme.ts";
import {
	literalToPlain,
	PANDA_ALIASES,
	normalizePandaStyleObject,
	parsePandaCalls,
} from "./parse.ts";

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

function irToText(ir: SwapIrLike, meta: PandwindMeta): string {
	return emitPandaStyle(ir, meta);
}

const cssImportFor = (depth: number): string =>
	depth <= 0 ? "./css" : `${"../".repeat(depth)}css`;

/** Register the generated extractor in host frameworks that need a plugin. */
function integrateNextApp(
	projectRoot: string,
	outDir: string,
	write: boolean,
	notes: string[],
	fileSystem: PandaProjectFileSystem,
): void {
	const configPath = ["next.config.mjs", "next.config.js", "next.config.ts"]
		.map((name) => join(projectRoot, name))
		.find((path) => fileSystem.exists(path));
	if (configPath === undefined) return;

	const config = fileSystem.read(configPath);
	if (config === undefined) return;
	const presetPath = `./${relative(dirname(configPath), join(outDir, "preset.ts")).replaceAll("\\", "/")}`;
	const pluginImport = `import { pandwindWebpackCss } from "pandwind/unplugin";`;
	const presetImport = `import { preset } from "${presetPath}";`;
	let nextConfig = config;
	if (!nextConfig.includes("pandwindWebpackCss")) {
		nextConfig = ensureImport(nextConfig, pluginImport);
		nextConfig = ensureImport(nextConfig, presetImport);
		const plugin = `\t\tconfig.plugins.push(pandwindWebpackCss({ preset, root: process.cwd(), virtualId: "pandwind-css.css" }));`;
		const webpackBody = `\twebpack(config) {\n${plugin}\n\t\treturn config;\n\t},\n`;
		const existingWebpack = /webpack\s*\([^)]*\)\s*\{/;
		if (existingWebpack.test(nextConfig)) {
			const returnAt = nextConfig.indexOf("return config", nextConfig.search(existingWebpack));
			if (returnAt !== -1) {
				nextConfig = `${nextConfig.slice(0, returnAt)}${plugin}\n${nextConfig.slice(returnAt)}`;
			}
		} else {
			// Find the config object's balanced closing brace, not the last nested
			// object (for example `images: { ... }`). Add the missing property
			// comma when the existing final property does not have one.
			const configOpen = nextConfig.search(/(?:const|let|var)\s+config\s*=\s*\{/);
			const configBlock =
				configOpen === -1 ? null : matchBlock(nextConfig, nextConfig.indexOf("{", configOpen));
			if (configBlock !== null) {
				const close = configBlock.end - 1;
				const prefix = nextConfig.slice(0, close).replace(/\s+$/, "");
				const separator = prefix.endsWith(",") ? "\n" : ",\n";
				nextConfig = `${prefix}${separator}${webpackBody}${nextConfig.slice(close)}`;
			}
		}
	}
	// Older codemod runs registered the same plugin with the bare `pandwind-css`
	// id. Normalize that registration so reruns converge on the CSS virtual
	// module that Next/Webpack can resolve.
	if (nextConfig.includes("pandwindWebpackCss")) {
		nextConfig = ensureImport(nextConfig, pluginImport);
		nextConfig = ensureImport(nextConfig, presetImport);
		nextConfig = nextConfig.replaceAll(
			'virtualId: "pandwind-css"',
			'virtualId: "pandwind-css.css"',
		);
	}
	if (nextConfig !== config) {
		notes.push(`registered pandwindWebpackCss in ${relative(projectRoot, configPath)}`);
		if (write) fileSystem.write(configPath, nextConfig);
	}

	const layouts = [
		join(projectRoot, "app", "layout.tsx"),
		join(projectRoot, "app", "layout.ts"),
		join(projectRoot, "src", "app", "layout.tsx"),
		join(projectRoot, "src", "app", "layout.ts"),
	].filter((path) => fileSystem.exists(path));
	for (const layoutPath of layouts) {
		const layout = fileSystem.read(layoutPath);
		if (layout === undefined) continue;
		// Webpack treats `scheme:` imports as URI schemes before resolver
		// plugins run. A bare virtual id reaches unplugin on both Next and Vite.
		const virtualImport = 'import "pandwind-css.css";';
		const nextLayout = ensureImport(
			layout.replaceAll('import "pandwind-css";\n', "").replaceAll('import "pandwind-css";', ""),
			virtualImport,
		);
		if (nextLayout === layout) continue;
		notes.push(`imported pandwind-css in ${relative(projectRoot, layoutPath)}`);
		if (write) fileSystem.write(layoutPath, nextLayout);
	}
}

/** Stop package lifecycle scripts from recreating Panda's obsolete output. */
function removePandaCodegenScripts(
	projectRoot: string,
	write: boolean,
	notes: string[],
	fileSystem: PandaProjectFileSystem,
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
		const block = matchBlock(source, open);
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
	const excluded = computeExcludedRanges(file.source, file.path);
	const defs: Array<RecipeDef> = [];
	for (const m of file.source.matchAll(
		/(?:const|let|var)\s+([\w$]+)\s*=\s*(?:(cva|defineRecipe)|(sva|defineSlotRecipe))\s*\(\s*\{/g,
	)) {
		if (excluded.isExcluded(m.index ?? -1)) continue;
		const open = (m.index ?? 0) + m[0].length - 1;
		const block = matchBlock(file.source, open);
		if (block === null) continue;
		let end = block.end;
		while (/\s/.test(file.source[end] ?? "")) end++;
		if (file.source[end] === ")") {
			end++;
			if (file.source[end] === ";") end++;
		}
		defs.push({
			name: m[1]!,
			kind: (m[3] !== undefined ? "sva" : "cva") as "cva" | "sva",
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
							: (literalToPlain(parsedArgs) as Record<string, string>),
				});
			}
		}
	}
	return sites;
}

/* ------------------------------------------------------------------ */
/* <panda.x> JSX scanning + rewriting                                  */
/* ------------------------------------------------------------------ */

/** Props that stay DOM attributes (never become declarations). */
const DOM_ATTR_RE =
	/^(key|ref|children|as|href|src|alt|title|target|rel|role|type|id|lang|dir|hidden|tabIndex|download|loading|method|action|placeholder|for|aria-[\w-]+|data-[\w-]+|on[A-Z][\w]*)$/;

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

/** Scan `<panda.tag …>` opening tags (oxc-masked; spread props bail out). */
export function scanFactoryElements(
	source: string,
	isExcluded: (start: number) => boolean,
): Array<FactoryElement> {
	const out: Array<FactoryElement> = [];
	for (const m of source.matchAll(/<panda\.([A-Za-z][\w]*)/g)) {
		const start = m.index ?? 0;
		if (isExcluded(start)) continue;
		let i = start + m[0].length;
		const attrs: Array<FactoryAttr> = [];
		let selfClosing = false;
		let ok = true;
		const limit = source.length;
		while (i < limit) {
			while (i < limit && /\s/.test(source[i] ?? "")) i++;
			const ch = source[i];
			if (ch === "/" && source[i + 1] === ">") {
				selfClosing = true;
				i += 2;
				break;
			}
			if (ch === ">") {
				i += 1;
				break;
			}
			if (source.startsWith("{...", i)) {
				// spread props — record as non-literal so the element gets flagged,
				// never silently dropped
				let depth = 0;
				let j = i;
				for (; j < limit; j++) {
					if (source[j] === "{") depth++;
					else if (source[j] === "}") {
						depth--;
						if (depth === 0) break;
					}
				}
				if (depth !== 0) {
					ok = false;
					break;
				}
				attrs.push({
					name: "...spread",
					nameStart: i,
					attrEnd: j + 1,
					valueText: null,
					quoted: false,
					literal: false,
				});
				i = j + 1;
				continue;
			}
			const nameMatch = /^([\w$-]+)/.exec(source.slice(i));
			if (nameMatch === null) {
				ok = false;
				break;
			}
			const attrName = nameMatch[1]!;
			const nameStart = i;
			i += attrName.length;
			if (source[i] === "=" && source[i + 1] === "{") {
				i += 2;
				let depth = 1;
				let j = i;
				while (j < limit && depth > 0) {
					const c = source[j];
					if (c === "{") depth++;
					else if (c === "}") depth--;
					j++;
				}
				if (depth !== 0) {
					ok = false;
					break;
				}
				const inner = source.slice(i, j - 1);
				const objBody = stripOuterBraces(inner.trim());
				const lit =
					(objBody !== null && parseObjectLiteral(objBody) !== null) ||
					/^"[^"]*"$|^'[^']*'$|^-?\d+(\.\d+)?$|^true$|^false$/.test(inner.trim());
				attrs.push({
					name: attrName,
					nameStart,
					attrEnd: j,
					valueText: inner.trim(),
					quoted: false,
					literal: lit,
				});
				i = j;
				continue;
			}
			if (source[i] === "=" && (source[i + 1] === '"' || source[i + 1] === "'")) {
				const quote = source[i + 1]!;
				const close = source.indexOf(quote, i + 2);
				if (close === -1) {
					ok = false;
					break;
				}
				attrs.push({
					name: attrName,
					nameStart,
					attrEnd: close + 1,
					valueText: source.slice(i + 2, close),
					quoted: true,
					literal: true,
				});
				i = close + 1;
				continue;
			}
			if (source[i] === "=") {
				ok = false; // identifier/binding value
				break;
			}
			// bare boolean prop
			attrs.push({
				name: attrName,
				nameStart,
				attrEnd: i,
				valueText: null,
				quoted: false,
				literal: true,
			});
		}
		if (!ok || i > limit) continue;
		out.push({ start, openEnd: i, selfClosing, tag: m[1]!, attrs });
	}
	return out;
}

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

/**
 * Replacement edits for one convertible factory element; null when any
 * style prop is non-literal (caller flags instead of half-converting).
 */
export function factoryEdits(
	el: FactoryElement,
	source: string,
	meta: PandwindMeta,
	theme: PandaTheme,
): Array<{ start: number; end: number; text: string }> | null {
	const kept: Array<string> = [];
	const styleEntries: Array<[string, unknown]> = [];
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
			styleEntries.push([attr.name, true]);
			continue;
		}
		if (attr.quoted) {
			styleEntries.push([attr.name, attr.valueText]);
			continue;
		}
		const objText = stripOuterBraces(attr.valueText);
		const parsedObj = objText === null ? null : parseObjectLiteral(objText);
		if (objText !== null && parsedObj !== null) {
			styleEntries.push([attr.name, literalToPlain(parsedObj)]);
			continue;
		}
		const v = styleScalarOf(attr.valueText);
		if (v === null) return null;
		styleEntries.push([attr.name, v]);
	}
	if (!/^[A-Za-z][\w]*$/.test(el.tag)) return null;

	const styleObj: Record<string, unknown> = {};
	for (const [k, v] of styleEntries) styleObj[PANDA_ALIASES.get(k) ?? k] = v;
	const ir = convertPandaStyle(styleObj, theme);
	const text = irToText(ir, meta);
	if (text === "") return null;

	const normalizedStyle = normalizePandaStyleObject(Object.fromEntries(styleEntries));
	const classCallArgs = [
		`{ ${Object.entries(normalizedStyle)
			.map(([k, v]) => `${JSON.stringify(k)}: ${renderStyleValue(v)}`)
			.join(", ")} }`,
	];
	const classExpr = existingClassExpr
		? `cx(css.class(${classCallArgs}), ${existingClassExpr})`
		: `css.class(${classCallArgs})`;

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
	const injectAt = el.selfClosing ? el.openEnd - 2 : el.openEnd - 1;
	edits.push({ start: injectAt, end: injectAt, text: ` className={${classExpr}}` });
	void kept;
	return edits;
}

/* ------------------------------------------------------------------ */
/* main orchestration                                                  */
/* ------------------------------------------------------------------ */

export async function runPandaMigration(options: PandaMigrateOptions): Promise<PandaMigrateReport> {
	const { projectRoot, meta, skipMarker } = options;
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

	queueEmission(join(outDir, "preset.ts"), renderPandaPreset(theme));
	queueEmission(join(outDir, "css.ts"), renderCssBootstrap(true));
	queueEmission(join(outDir, "virtual.d.ts"), renderVirtualCssDeclaration());
	queueEmission(join(outDir, "internal.ts"), renderInternalHelpers(theme));

	/** Extra per-file edits: declaration removals, folds, import insertion. */
	const fileExtras = new Map<string, Array<{ start: number; end: number; text: string }>>();
	const addExtra = (path: string, edit: { start: number; end: number; text: string }): void => {
		const list = fileExtras.get(path) ?? [];
		list.push(edit);
		fileExtras.set(path, list);
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
		const ir = convertPandaRecipe(bodyText, def.kind, theme);
		if (ir === null) return null;
		for (const residual of ir.residuals) countResidual(report, residual.kind);
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
		const cssImport = `import { css, cx } from "${cssImportFor(1)}";`;
		let content = renderRecipeModule(exportName, ir, meta, { cssImport });
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
		if (ir.kind === "cva" && sites.length === 1 && sites[0]!.argsLiteral) {
			const site = sites[0]!;
			const folded = foldRecipeCall(ir, site.props ?? {}, meta);
			if (folded !== null) {
				addExtra(def.file.path, { start: def.start, end: def.end, text: "" });
				addExtra(site.file.path, {
					start: site.start,
					end: site.end,
					text: folded.text.replace("css.class(", `cx(css.class(`).replace(/\)$/, "))"),
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

	// JSX layout components also consume pattern modules. Add their backing
	// patterns before determining the usage-driven emission set.
	const jsxPatternNames: Record<string, string> = {
		Stack: "stack",
		HStack: "hstack",
		VStack: "vstack",
		Flex: "flex",
		Grid: "grid",
		Center: "center",
		Circle: "circle",
		Square: "square",
		Wrap: "wrap",
	};
	for (const component of usage.jsxComponents) {
		const pattern = jsxPatternNames[component];
		if (pattern !== undefined) usage.patterns.add(pattern);
	}

	// Pattern modules for builtins and evaluated custom patterns in use.
	const usedBuiltinPatterns = [...usage.patterns].filter((p) => BUILTIN_PATTERNS.has(p)).toSorted();
	const emittedPatternNames = [...usedBuiltinPatterns];
	for (const name of usedBuiltinPatterns) {
		queueEmission(
			join(outDir, "patterns", `${name}.ts`),
			renderPatternModule(name, { cssImport: cssImportFor(1) }),
		);
		report.patternModules.push(name);
	}
	for (const custom of [...usage.patterns].filter((p) => !BUILTIN_PATTERNS.has(p)).toSorted()) {
		const definition = theme.customPatterns.get(custom);
		if (definition?.transform === undefined) {
			report.notes.push(
				`custom pattern '${custom}' has no statically serializable transform — flagged at call sites`,
			);
			continue;
		}
		queueEmission(
			join(outDir, "patterns", `${custom}.ts`),
			renderCustomPatternModule(custom, definition.transform.toString(), {
				cssImport: cssImportFor(1),
			}),
		);
		emittedPatternNames.push(custom);
		report.patternModules.push(custom);
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

	// token() shim when the app uses styled-system/tokens.
	if (files.some((f) => /styled-system\/tokens/.test(f.source))) {
		const rows = [...theme.tokenVars.entries()]
			.toSorted(([a], [b]) => a.localeCompare(b))
			.map(([path, varName]) => `\t${JSON.stringify(path)}: ${JSON.stringify(`var(${varName})`)},`)
			.join("\n");
		queueEmission(
			join(outDir, "token.ts"),
			[
				"/**",
				" * Generated by pandwind-codemod (plan 024): panda's token() replacement.",
				" * Known semantic paths resolve to their CSS custom property; unknown",
				" * paths fall back to the panda naming convention.",
				" */",
				"const KNOWN: Record<string, string> = {",
				rows,
				"};",
				"",
				"export type Token = string;",
				"",
				'const COLOR_HEADS = new Set(["fg", "bg", "accent", "primary", "secondary", "neutral", "gray", "red", "blue"]);',
				"function fallbackVar(path: string): string {",
				'\tconst parts = path.split(".");',
				'\tconst group = COLOR_HEADS.has(parts[0] ?? "") ? "colors" : (parts[0] ?? "tokens");',
				'\treturn `var(--${group}-${parts.join("-")})`;',
				"}",
				"",
				"export function token(path: string): string {",
				"\treturn (KNOWN[path] ??= fallbackVar(path));",
				"}",
				"",
			].join("\n"),
		);
	}

	// Layout component wrappers (Stack/HStack/Box/…) keep JSX working.
	const layoutComps = new Set([...usage.jsxComponents].filter((c) => LAYOUT_COMPONENTS.has(c)));
	queueEmission(
		join(outDir, "jsx", "index.tsx"),
		renderJsxIndex(layoutComps, {
			cssImport: cssImportFor(1),
			aliasSpecifierFor: (subpath: string) => aliasSpecifier(aliasInfo, outDirName, subpath),
		}),
	);

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
		[/([\w@./-]*)styled-system\/patterns/g, aliasSpecifier(aliasInfo, outDirName, "patterns")],
		[/([\w@./-]*)styled-system\/jsx/g, aliasSpecifier(aliasInfo, outDirName, "jsx")],
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
		const mask = computeExcludedRanges(file.source, file.path);
		const masked = (start: number): boolean => mask.isExcluded(start);

		// css({...}) -> css.class({...}) / marker
		for (const call of parsePandaCalls(file.source, masked, { theme })) {
			if (call.kind !== "css" || call.ir === undefined) continue;
			const text = irToText(call.ir, meta);
			for (const residual of call.ir.residuals) countResidual(report, residual.kind);
			const hasUnrepresentable = call.ir.residuals.some(
				(residual) => residual.kind === "unrepresentable",
			);
			if (hasUnrepresentable) {
				// Never emit a partial style object: dropping a nested selector or
				// spread silently changes the page. The migrated css callable still
				// returns a class, so preserving this call is the lossless fallback.
				report.cssCallsFlagged++;
				applyMarker(
					edits,
					file.source,
					call.start,
					call.ir.residuals[0]!.hint ?? "unrepresentable css()",
					skipMarker,
				);
				continue;
			}
			if (text !== "") {
				if (call.ir.residuals.length > 0) {
					applyMarker(
						edits,
						file.source,
						call.start,
						call.ir.residuals[0]!.hint ?? call.ir.residuals[0]!.kind,
						skipMarker,
					);
				}
				let end = call.end;
				const tail = /^\s*\)/.exec(file.source.slice(end));
				if (tail !== null) end += tail[0].length;
				edits.push({ start: call.start, end, text });
				report.cssCallsConverted++;
			} else {
				const residual = call.ir.residuals[0];
				report.cssCallsFlagged++;
				if (residual !== undefined) countResidual(report, residual.kind);
				edits.push({
					start: 0,
					end: 0,
					text: "",
				});
				applyMarker(
					edits,
					file.source,
					call.start,
					residual?.hint ?? "non-literal css()",
					skipMarker,
				);
			}
		}

		// <panda.x …>
		for (const el of scanFactoryElements(file.source, masked)) {
			const elEdits = factoryEdits(el, file.source, meta, theme);
			if (elEdits === null) {
				report.factoryElementsFlagged++;
				countResidual(report, "dynamic");
				applyMarker(edits, file.source, el.start, "non-literal factory props", skipMarker);
				continue;
			}
			edits.push(...elEdits);
			report.factoryElementsConverted++;
			const factoryIr = convertPandaStyle(
				Object.fromEntries(
					el.attrs
						.filter((attr) => !DOM_ATTR_RE.test(attr.name) && attr.valueText !== null)
						.map((attr) => [
							PANDA_ALIASES.get(attr.name) ?? attr.name,
							attr.quoted ? attr.valueText : (styleScalarOf(attr.valueText!) ?? attr.valueText),
						]),
				),
				theme,
			);
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

		// Import specifiers.
		for (const [re, replacement] of specifierRewrites) {
			for (const m of file.source.matchAll(re)) {
				const startAt = m.index ?? 0;
				// Documentation/code samples inside strings are not imports in the
				// host program and must remain faithful to the original Panda API.
				if (masked(startAt) && !isActualImportSpecifier(file.source, startAt)) continue;
				edits.push({ start: startAt, end: startAt + m[0].length, text: replacement });
			}
		}
		edits.push(...defineTextStylesEdits(file.source));

		if (edits.length === 0) continue;
		let next = rewritePandaSource(file.source, edits);
		// Files may use the global panda `css()` binding without importing it
		// directly (for example via the JSX factory). Ensure every converted
		// call has a real migrated binding.
		if (/\bcss\.class\s*\(/.test(next) && !hasCssBinding(next)) {
			const importText = `import { css } from "${aliasSpecifier(aliasInfo, outDirName, "css")}";\n`;
			const insertion = importInsertionOffset(next);
			next = next.slice(0, insertion) + importText + next.slice(insertion);
		}
		if (next === file.source) continue;
		// cva/sva definitions folded into generated output no longer need their
		// panda-only named imports; leaving them would create unresolved exports.
		next = removeUnusedVariantImports(next, aliasSpecifier(aliasInfo, outDirName, "css"));
		next = removeUnusedFactoryImports(next);
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
	removePandaCodegenScripts(projectRoot, options.write, report.notes, fileSystem);

	return report;
}

const LAYOUT_COMPONENTS = new Set([
	"Stack",
	"HStack",
	"VStack",
	"Flex",
	"Grid",
	"Box",
	"Container",
	"Center",
	"Circle",
	"Square",
	"Wrap",
	"Spacer",
	"Absolute",
	"Relative",
]);

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

function hasCssBinding(source: string): boolean {
	return (
		/import\s*\{[^}]*\bcss(?:\s+as\s+\w+)?\b[^}]*\}\s*from\s*["'][^"']+["']/.test(source) ||
		/(?:const|let|var|function)\s+css\b/.test(source)
	);
}

function removeUnusedVariantImports(source: string, cssImportPath: string): string {
	const unsupported = new Set(["cva", "sva", "defineRecipe", "defineSlotRecipe"]);
	const excluded = computeExcludedRanges(source, "migration.tsx");
	const hasCall = (name: string): boolean => {
		const re = new RegExp(`\\b${name}\\s*\\(`, "g");
		return [...source.matchAll(re)].some((match) => !excluded.isExcluded(match.index ?? -1));
	};
	return source.replace(
		/import\s*\{([^}]+)\}\s*from\s*(["'])([^"']*\/pandwind\/css)\2\s*;?/g,
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
	const excluded = computeExcludedRanges(source, "migration.tsx");
	const hasFactoryUse = [...source.matchAll(/<panda\.|\bpanda\s*\(/g)].some(
		(match) => !excluded.isExcluded(match.index ?? -1),
	);
	return source.replace(
		/import\s*\{([^}]+)\}\s*from\s*(["'])([^"']*\/pandwind\/jsx)\2\s*;?/g,
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
	source: string,
	index: number,
	reason: string,
	marker: string,
): void {
	const lineStart = source.lastIndexOf("\n", Math.max(0, index - 1)) + 1;
	const indentMatch = /^\s*/.exec(source.slice(lineStart));
	const indent = indentMatch ? indentMatch[0] : "";
	if (source.slice(lineStart, index).includes(`// ${marker} (`)) return;
	const previousLineStart = source.lastIndexOf("\n", Math.max(0, lineStart - 2)) + 1;
	const previousLine = source
		.slice(previousLineStart, Math.max(previousLineStart, lineStart - 1))
		.trim();
	if (previousLine.includes(`// ${marker} (`)) return;
	edits.push({
		start: lineStart,
		end: lineStart,
		text: `${indent}// ${marker} (${reason})\n`,
	});
}
