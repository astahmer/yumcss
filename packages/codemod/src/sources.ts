/**
 * Source-library detectors & migrations — styled-components, stylex,
 * panda-css patterns rewritten onto pandwind APIs.
 *
 * Enabled explicitly via `--from=styled-components,stylex,panda` (off by
 * default). Runs BEFORE the --to mode pass so its output composes: library
 * patterns become pandwind code, then the regular mode migrates whatever
 * raw tailwind remains.
 *
 * Safety model (same rails as every mode):
 * - interpolated template literals, pseudo/media nesting, non-literal
 *   values and shorthand/token keys are FLAGGED with an inserted
 *   `pandwind:migrate-skip (<reason>)` comment — never half-converted;
 * - conversions require an existing pandwind css() binding in the file
 *   (same rule as css mode);
 * - idempotent: converted output no longer matches any detector, flagged
 *   regions are skipped via the marker.
 */
import { parseSync } from "oxc-parser";
import { walk, type OxcNode } from "../../pandwind/src/tw/literal.ts";
import type { PandwindMeta } from "./meta.ts";
import { mapToken } from "./map.ts";
import type { MappedToken } from "./map.ts";
import type { TransformResult } from "./migrate.ts";
import { ensureImport, hasCssBinding } from "./shared.ts";

export type SourceId = "styled-components" | "stylex" | "panda";

export const SOURCE_IDS: SourceId[] = ["styled-components", "stylex", "panda"];

export function parseSourceList(value: string): SourceId[] {
	const ids: SourceId[] = [];
	for (const part of value.split(",")) {
		const id = part.trim();
		if (!SOURCE_IDS.includes(id as SourceId)) {
			throw new Error(
				`codemod: unknown --from source '${id}' (expected: ${SOURCE_IDS.join(", ")})`,
			);
		}
		if (!ids.includes(id as SourceId)) ids.push(id as SourceId);
	}
	return ids;
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

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

/** Insert a skip-marker comment line above the line containing `index`. */
export function insertSkipMarker(
	source: string,
	index: number,
	reason: string,
	marker: string,
): string {
	const lineStart = source.lastIndexOf("\n", Math.max(0, index - 1)) + 1;
	const indentMatch = /^\s*/.exec(source.slice(lineStart));
	const indent = indentMatch ? indentMatch[0] : "";
	return (
		source.slice(0, lineStart) + `${indent}// ${marker} (${reason})\n` + source.slice(lineStart)
	);
}

/** property+value -> utility class, built once per meta (WeakMap-cached). */
const pvIndexCache = new WeakMap<PandwindMeta, Map<string, string>>();
function propertyValueIndex(meta: PandwindMeta): Map<string, string> {
	let index = pvIndexCache.get(meta);
	if (index !== undefined) return index;
	index = new Map();
	for (const [utilityClass, { property, value }] of meta.bridgeInverse) {
		const key = `${property.toLowerCase()}|${value.toLowerCase()}`;
		if (!index.has(key)) index.set(key, utilityClass);
	}
	pvIndexCache.set(meta, index);
	return index;
}

/** All distinct CSS property names the generated metadata knows about —
 * union of the bridge's direct-property sections and every conflict-map
 * property list (the latter covers utilities the bridge scopes out, e.g.
 * `color` when values resolve through theme variables). */
/** kebab-case CSS property -> camelCase object key. */
export const camelProperty = (prop: string): string =>
	prop.replace(/-(\w|$)/g, (_m, char: string) => char.toUpperCase());

function knownProperties(meta: PandwindMeta): Set<string> {
	const names = new Set<string>();
	const add = (prop: string): void => {
		names.add(camelProperty(prop));
	};
	for (const { property } of meta.bridgeInverse.values()) add(property);
	for (const perValue of meta.conflicts.values()) {
		for (const props of Object.values(perValue)) {
			for (const prop of props) add(prop);
		}
	}
	return names;
}

/** Brace-matched extraction of the balanced block starting at `open`. */
export function matchBlock(source: string, open: number): { body: string; end: number } | null {
	let depth = 0;
	for (let i = open; i < source.length; i++) {
		if (source[i] === "{") depth++;
		else if (source[i] === "}") {
			depth--;
			if (depth === 0) return { body: source.slice(open + 1, i), end: i + 1 };
		}
	}
	return null;
}

interface Decl {
	/** camelCase object key for css() emission. */
	prop: string;
	/** Original kebab-case property, for bridge lookups. */
	dash: string;
	value: string;
}

/**
 * Parse flat `prop: value;` declarations out of a CSS-ish body.
 * Returns null when the body contains nesting, interpolation or anything
 * multi-line — those shapes are flagged, never guessed at.
 */
function parseFlatDeclarations(body: string): Decl[] | null {
	if (/[$}{]/.test(body)) return null;
	const decls: Array<Decl> = [];
	for (const statement of body.split(";")) {
		const trimmed = statement.trim();
		if (trimmed === "") continue;
		if (trimmed.includes("\n")) return null;
		const colon = trimmed.indexOf(":");
		if (colon === -1) return null;
		const prop = trimmed.slice(0, colon).trim();
		const value = trimmed.slice(colon + 1).trim();
		if (!/^[a-z-]+$/i.test(prop) || value === "") return null;
		decls.push({ prop: camelProperty(prop), dash: prop, value });
	}
	return decls.length > 0 ? decls : null;
}

const INTRINSIC_TAGS = new Set([
	"a",
	"article",
	"aside",
	"button",
	"div",
	"footer",
	"form",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"header",
	"input",
	"label",
	"li",
	"main",
	"nav",
	"ol",
	"p",
	"section",
	"span",
	"table",
	"tbody",
	"td",
	"textarea",
	"th",
	"thead",
	"tr",
	"ul",
]);

/** Declaration -> typed tw() entry when the bridge knows the exact shape. */
function typedEntryFor(prop: string, value: string, meta: PandwindMeta): MappedToken | null {
	const utilityClass = propertyValueIndex(meta).get(`${prop.toLowerCase()}|${value.toLowerCase()}`);
	if (utilityClass === undefined) return null;
	return mapToken(utilityClass, meta);
}

function renderCall(callee: string, entries: Array<[string, string]>): string {
	const inner = entries
		.map(([key, value]) => `\t${JSON.stringify(key)}: ${JSON.stringify(value)},`)
		.join("\n");
	return `${callee}({\n${inner}\n})`;
}

/* ------------------------------------------------------------------ */
/* styled-components                                                   */
/* ------------------------------------------------------------------ */

const STYLED_TEMPLATE_REGEX = /\bstyled\s*(?:\.\s*(\w+)|\(\s*(\w+)\s*\))\s*(`(?:[^`\\]|\\.)*`)/g;

/**
 * Source ranges that must NEVER be treated as code: comments and every
 * string literal / template literal that is not a styled tagged template.
 * The styled detectors are regexes over raw text, so without this mask a
 * comment mentioning `styled.div` or an example embedded in a string gets
 * converted/mangled.
 *
 * Returns a sorted list of [start, end) pairs plus an O(1)-ish membership
 * test. Parsed once per file with oxc — the same parser the vite passes
 * use, so ranges are exact.
 */
export function computeExcludedRanges(
	source: string,
	file: string,
): { excluded: Array<[number, number]>; isExcluded(start: number): boolean } {
	const parsed = parseSync(file, source, {
		sourceType: "module",
		lang: file.endsWith(".tsx") ? "tsx" : "ts",
	});
	const excluded: Array<[number, number]> = [];
	for (const comment of (
		parsed as unknown as { comments?: Array<{ start?: number; end?: number }> }
	).comments ?? []) {
		if (typeof comment.start === "number" && typeof comment.end === "number") {
			excluded.push([comment.start, comment.end]);
		}
	}
	// Tagged templates whose tag is `styled` (any member/call form) are CODE
	// the detector may act on — their quasi is exempted from the mask.
	const styledQuasis: Array<[number, number]> = [];
	walk(parsed.program as unknown as OxcNode, (node) => {
		const n = node as {
			type?: string;
			start?: number;
			end?: number;
			tag?: { start?: number; end?: number };
			quasi?: { start?: number; end?: number };
		};
		if (typeof n.start !== "number" || typeof n.end !== "number") return;
		if (n.type === "Comment") {
			excluded.push([n.start, n.end]);
			return;
		}
		if (n.type === "TaggedTemplateExpression" && n.tag !== undefined) {
			const tagText = source.slice(n.tag.start ?? 0, n.tag.end ?? 0);
			const quasi = n.quasi;
			if (
				/^\s*styled\b/.test(tagText) &&
				typeof quasi?.start === "number" &&
				typeof quasi.end === "number"
			) {
				styledQuasis.push([quasi.start, quasi.end]);
			}
			return;
		}
		if (n.type === "Literal" || n.type === "TemplateLiteral") {
			excluded.push([n.start, n.end]);
		}
	});
	// Drop exemptions from the mask.
	const filtered = excluded.filter(
		([start, end]) => !styledQuasis.some(([qs, qe]) => start >= qs && end <= qe),
	);
	filtered.sort((a, b) => a[0] - b[0]);
	return {
		excluded: filtered,
		isExcluded(start: number): boolean {
			let lo = 0;
			let hi = filtered.length - 1;
			while (lo <= hi) {
				const mid = (lo + hi) >> 1;
				const [s, e] = filtered[mid]!;
				if (start < s) hi = mid - 1;
				else if (start >= e) lo = mid + 1;
				else return true;
			}
			return false;
		},
	};
}

function transformStyledComponents(
	source: string,
	meta: PandwindMeta,
	options: { marker: string; file: string },
	result: TransformResult,
): string {
	const edits: Array<Edit> = [];
	const needsCx = { value: false };
	const mask = computeExcludedRanges(source, options.file);

	// Flags are EDITS (line insertions at the original offset), not immediate
	// mutations — otherwise a flag that follows a conversion in the same file
	// would be discarded when applyEdits rebuilds from the pristine source.
	const flag = (at: number, reason: string): void => {
		const lineStart = source.lastIndexOf("\n", Math.max(0, at - 1)) + 1;
		const indentMatch = /^\s*/.exec(source.slice(lineStart));
		const indent = indentMatch ? indentMatch[0] : "";
		edits.push({
			start: lineStart,
			end: lineStart,
			text: `${indent}// ${options.marker} (${reason})\n`,
		});
		result.skippedByMarker++;
	};

	for (const match of source.matchAll(STYLED_TEMPLATE_REGEX)) {
		const start = match.index ?? 0;
		if (mask.isExcluded(start)) continue; // inside a comment or string
		const end = start + match[0].length;
		const tag = match[1];
		const body = match[3]!.slice(1, -1);

		// The styled component's binding name lives to the LEFT of the tagged
		// template: `const Card = styled.div\`...\``.
		const lineStart = source.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
		const prefix = source.slice(lineStart, start);
		const name = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*$/.exec(prefix)?.[1] ?? "";

		if (source.slice(Math.max(0, start - 160), end).includes(options.marker)) {
			result.skippedByMarker++;
			continue;
		}
		if (tag === undefined || !INTRINSIC_TAGS.has(tag)) {
			flag(start, "styled(<Component>) wrappers stay as-is (component inheritance)");
			continue;
		}
		if (/\$\{/.test(body)) {
			flag(start, "interpolated styled`` styles are flagged, not converted");
			continue;
		}
		const decls = parseFlatDeclarations(body);
		if (decls === null) {
			flag(start, "nested selectors/media queries are flagged, not converted");
			continue;
		}
		if (!hasCssBinding(source)) {
			flag(start, "styled->css conversion needs an existing pandwind css binding");
			continue;
		}

		const typedEntries: Array<[string, string]> = [];
		const atomEntries: Array<[string, string]> = [];
		for (const { prop, dash, value } of decls) {
			const mapped = typedEntryFor(dash, value, meta);
			if (mapped !== null && typeof mapped.value === "string") {
				typedEntries.push([mapped.key, mapped.value]);
			} else {
				atomEntries.push([prop, value]);
			}
		}

		const callee = atomEntries.length === 0 ? "tw" : "css.class";
		const replacement = renderCall(callee, [...typedEntries, ...atomEntries]);
		result.converted++;
		edits.push({ start, end, text: replacement });

		if (name !== "") edits.push(...jsxUsageEdits(source, name, tag, needsCx, mask));
	}

	if (edits.length === 0) return source;
	// The hasCssBinding gate guarantees the file already binds a pandwind
	// css factory — no import is injected, only the styled-components one is
	// dropped.
	let code = applyEdits(source, edits);
	code = code.replace(/\n?import\s+\w+\s+from\s+["']styled-components["'];?\n/g, "\n");
	if (needsCx.value) code = ensureImport(code, 'import { cx } from "pandwind/cx";');
	return code;
}

/** Opening/closing tag rewrites for an intrinsic styled component usage. */
function jsxUsageEdits(
	source: string,
	name: string,
	tag: string,
	needsCxRef: { value: boolean },
	mask: { isExcluded(start: number): boolean },
): Array<Edit> {
	const edits: Array<Edit> = [];
	const tagRegex = new RegExp(`<(\\/?)\\s*${name}\\b([^>]*)>`, "g");
	for (const match of source.matchAll(tagRegex)) {
		const start = match.index ?? 0;
		if (mask.isExcluded(start)) continue; // JSX mention inside comment/string
		const end = start + match[0].length;
		const closing = match[1] === "/";
		const attrs = match[2] ?? "";
		if (closing) {
			edits.push({ start, end, text: `</${tag}>` });
			continue;
		}
		// Merge the styled const into an existing STATIC className; dynamic
		// ({...}) classNames are left completely alone.
		const staticClass = /className\s*=\s*"([^"]*)"/.exec(attrs);
		if (/className\s*=\s*\{/.test(attrs)) continue;

		const selfClosing = /\/\s*$/.test(attrs);
		let nextAttrs: string;
		if (staticClass === null) {
			const injected = ` className={${name}}`;
			nextAttrs =
				attrs.trimEnd() === ""
					? injected + (selfClosing ? " /" : "")
					: attrs.trimEnd() + injected + (selfClosing ? " /" : "");
		} else {
			needsCxRef.value = true;
			const existing = staticClass[1]!.trim();
			const merged = existing === "" ? name : `cx(${name}, ${JSON.stringify(existing)})`;
			nextAttrs = attrs.replace(staticClass[0], `className={${merged}}`);
		}
		edits.push({ start, end, text: `<${tag}${nextAttrs}>` });
	}
	return edits;
}

/* ------------------------------------------------------------------ */
/* stylex                                                              */
/* ------------------------------------------------------------------ */

function transformStylex(
	source: string,
	meta: PandwindMeta,
	options: { marker: string; file: string },
	result: TransformResult,
): string {
	let working = source;
	void meta;

	if (/["']@stylexjs\/stylex["']/.test(working) === false) return working;
	if (!hasCssBinding(working)) {
		const firstCreate = working.search(/\bstylex\.create\s*\(/);
		if (firstCreate !== -1) {
			working = insertSkipMarker(
				working,
				firstCreate,
				"stylex->css conversion needs an existing pandwind css binding",
				options.marker,
			);
			result.skippedByMarker++;
		}
		return working;
	}

	type Rep = { start: number; end: number; replacement: string };
	const replacements: Array<Rep> = [];
	for (const match of working.matchAll(/stylex\.create\s*\(/g)) {
		const openParen = (match.index ?? 0) + match[0].length - 1;
		const arg = matchParen(working, openParen);
		if (arg === null) continue;
		// The argument is the outer object literal — unwrap its braces so the
		// entry parser sees `name: { ... }` pairs directly.
		const trimmedArg = arg.body.trim();
		if (trimmedArg.startsWith("{") === false) continue;
		const unwrapped = matchBlock(trimmedArg, 0);
		if (unwrapped === null) continue;
		const parsed = parseStylexEntries(unwrapped.body);
		if (parsed === null) {
			working = insertSkipMarker(
				working,
				match.index ?? 0,
				"stylex.create with pseudo/media/non-literal styles is flagged, not converted",
				options.marker,
			);
			result.skippedByMarker++;
			continue;
		}
		const rendered = parsed
			.map(([name, decls]) => {
				const body = decls
					.map(
						([prop, value]) =>
							`\t\t${JSON.stringify(camelProperty(prop))}: ${JSON.stringify(value)},`,
					)
					.join("\n");
				return `\t${JSON.stringify(name)}: css.class({\n${body}\n\t}),`;
			})
			.join("\n");
		replacements.push({
			start: match.index ?? 0,
			end: arg.end,
			replacement: `{\n${rendered}\n}`,
		});
		result.converted++;
	}
	for (const rep of [...replacements].toSorted((a, b) => b.start - a.start)) {
		working = working.slice(0, rep.start) + rep.replacement + working.slice(rep.end);
	}

	// Values became plain class strings — stylex.props merges them like cx.
	working = working.replaceAll("stylex.props(", "cx(");
	working = working.replace(
		/\n?import\s*\*\s*as\s+\w+\s+from\s+["']@stylexjs\/stylex["'];?\n?/g,
		"\n",
	);
	working = working.replace(/\n?import\s*\{[^}]*\}\s*from\s+["']@stylexjs\/stylex["'];?\n?/g, "\n");
	// Values became plain class strings merged by cx — the css class values
	// themselves flow through the file's EXISTING pandwind css binding
	// (guaranteed by the hasCssBinding gate above), so no import is added.
	if (/\bcx\(/.test(working)) working = ensureImport(working, 'import { cx } from "pandwind/cx";');
	return working;
}

/** Match the parenthesized argument starting at `open`, returning inner body. */
function matchParen(source: string, open: number): { body: string; end: number } | null {
	let depth = 0;
	for (let i = open; i < source.length; i++) {
		if (source[i] === "(") depth++;
		else if (source[i] === ")") {
			depth--;
			if (depth === 0) return { body: source.slice(open + 1, i), end: i + 1 };
		}
	}
	return null;
}

/**
 * Parse `name: { prop: "value", ... }` entries. Returns null when any entry
 * uses pseudo/media keys, non-literal values or nested objects — flagged
 * upstream instead of partially converted.
 */
export function parseStylexEntries(body: string): Array<[string, Array<[string, string]>]> | null {
	const entries: Array<[string, Array<[string, string]>]> = [];
	let i = 0;
	while (i < body.length) {
		while (i < body.length && /\s/.test(body[i]!)) i++;
		if (i >= body.length) break;
		// Entry names may be quoted strings or bare identifiers.
		let name: string;
		if (body[i] === '"' || body[i] === "'") {
			const quote = body[i]!;
			const nameEnd = body.indexOf(quote, i + 1);
			if (nameEnd === -1) return null;
			name = body.slice(i + 1, nameEnd);
			i = nameEnd + 1;
		} else {
			// A bare `}` here closes the outer object — end of entries.
			if (body[i] === "}") break;
			const ident = /^[A-Za-z_$][\w$]*/.exec(body.slice(i));
			if (ident === null) return null;
			name = ident[0];
			i += ident[0].length;
		}
		while (i < body.length && /[\s]/.test(body[i]!)) i++;
		if (body[i] !== ":") return null;
		i++;
		while (i < body.length && /[\s]/.test(body[i]!)) i++;
		if (body[i] !== "{") return null;
		const block = matchBlock(body, i);
		if (block === null) return null;
		const decls: Array<[string, string]> = [];
		for (const statement of splitTopLevel(block.body, ",")) {
			const trimmed = statement.trim();
			if (trimmed === "" || trimmed.startsWith("//")) continue;
			const colon = trimmed.indexOf(":");
			if (colon === -1) return null;
			const prop = trimmed.slice(0, colon).trim();
			const value = trimmed.slice(colon + 1).trim();
			if (prop.startsWith(":") || prop.startsWith("@")) return null;
			if (!/^["'].*["']$/.test(value)) return null;
			decls.push([prop, value.slice(1, -1)]);
		}
		if (decls.length === 0) return null;
		entries.push([name, decls]);
		i = block.end;
		while (i < body.length && /[\s,]/.test(body[i]!)) i++;
	}
	return entries.length > 0 ? entries : null;
}

/** Split on `separator` ignoring separators nested inside braces/parens. */
function splitTopLevel(body: string, separator: string): Array<string> {
	const parts: Array<string> = [];
	let depth = 0;
	let current = "";
	for (const char of body) {
		if ("{([".includes(char)) depth++;
		else if ("})]".includes(char)) depth--;
		if (char === separator && depth === 0) {
			parts.push(current);
			current = "";
		} else {
			current += char;
		}
	}
	parts.push(current);
	return parts;
}

/* ------------------------------------------------------------------ */
/* panda-css                                                           */
/* ------------------------------------------------------------------ */

const PANDA_SHORTHANDS = new Set([
	"bg",
	"p",
	"px",
	"py",
	"pt",
	"pb",
	"pl",
	"pr",
	"m",
	"mx",
	"my",
	"mt",
	"mb",
	"ml",
	"mr",
	"w",
	"h",
	"minW",
	"minH",
	"maxW",
	"maxH",
	"inset",
	"borderX",
	"borderY",
]);

function transformPanda(
	source: string,
	meta: PandwindMeta,
	options: { marker: string; file: string },
	result: TransformResult,
): string {
	let working = source;
	if (/["'](?:styled-system\/(?:css|recipes)|@pandacss[^"']*)["']/.test(working) === false) {
		return working;
	}
	if (!hasCssBinding(working)) {
		const first = working.search(/\bcss\s*\(\s*\{/);
		if (first !== -1) {
			working = insertSkipMarker(
				working,
				first,
				"panda->css conversion needs an existing pandwind css binding",
				options.marker,
			);
			result.skippedByMarker++;
		}
		return working;
	}

	const properties = knownProperties(meta);

	// Literal css({...}) calls whose keys are all known CSS properties convert
	// to css.class({...}); shorthands/token refs/spreads get markers.
	type Rep = { start: number; end: number; replacement: string };
	const replacements: Array<Rep> = [];
	for (const match of working.matchAll(/(?<![\w.])css\s*\(\s*\{/g)) {
		const openBrace = (match.index ?? 0) + match[0].length - 1;
		const block = matchBlock(working, openBrace);
		if (block === null) continue;
		const entries = parseLiteralEntries(block.body);
		if (entries === null || entries.length === 0) {
			working = insertSkipMarker(
				working,
				match.index ?? 0,
				"panda css() with non-literal styles is flagged, not converted",
				options.marker,
			);
			result.skippedByMarker++;
			continue;
		}
		const tokenRef = entries.find(([, value]) => value.startsWith("tokens."));
		if (tokenRef !== undefined) {
			working = insertSkipMarker(
				working,
				match.index ?? 0,
				`panda token reference (${tokenRef[1]}) needs your pandwind preset — flagged, not converted`,
				options.marker,
			);
			result.skippedByMarker++;
			continue;
		}
		const unknown = entries.filter(([prop]) => !properties.has(prop) || PANDA_SHORTHANDS.has(prop));
		if (unknown.length > 0) {
			working = insertSkipMarker(
				working,
				match.index ?? 0,
				`panda shorthand/unknown keys left alone (${unknown.map(([k]) => k).join(", ")})`,
				options.marker,
			);
			result.skippedByMarker++;
			continue;
		}
		replacements.push({
			start: match.index ?? 0,
			end: block.end,
			replacement: renderCall("css.class", entries),
		});
		result.converted++;
	}
	for (const rep of [...replacements].toSorted((a, b) => b.start - a.start)) {
		working = working.slice(0, rep.start) + rep.replacement + working.slice(rep.end);
	}

	// cva(): convert base-only recipes; variants/compoundVariants get markers.
	for (const match of working.matchAll(/\bcva\s*\(\s*\{/g)) {
		const openBrace = (match.index ?? 0) + match[0].length - 1;
		const outer = matchBlock(working, openBrace);
		if (outer === null) continue;
		const baseOpen = working.indexOf("{", openBrace + 1);
		const base = baseOpen === -1 ? null : matchBlock(working, baseOpen);
		const baseOnly = base !== null && !/variants\s*:|compoundVariants\s*:/.test(outer.body);
		const entries = baseOnly && base !== null ? parseLiteralEntries(base.body) : null;
		if (base === null || entries === null || !baseOnly) {
			working = insertSkipMarker(
				working,
				match.index ?? 0,
				"cva with variants is flagged — model it as a tw()/css() factory instead",
				options.marker,
			);
			result.skippedByMarker++;
			continue;
		}
		working =
			working.slice(0, match.index ?? 0) +
			renderCall("css.class", entries) +
			working.slice(outer.end);
		result.converted++;
	}
	working = working.replace(
		/\n?import\s*\{[^}]*\}\s*from\s+["']styled-system\/(?:css|recipes)["'];?\n?/g,
		"\n",
	);
	return working;
}

/** Parse `key: literal` pairs at brace depth 0. Null on anything non-literal. */
function parseLiteralEntries(body: string): Array<[string, string]> | null {
	const entries: Array<[string, string]> = [];
	for (const statement of splitTopLevel(body, ",")) {
		const trimmed = statement.trim();
		if (trimmed === "" || trimmed.startsWith("//")) continue;
		const colon = trimmed.indexOf(":");
		if (colon === -1 || trimmed.includes("\n")) return null;
		const key = trimmed.slice(0, colon).trim();
		const value = trimmed.slice(colon + 1).trim();
		if (!/^[A-Za-z_$][\w$]*$/.test(key)) return null;
		if (!/^["'].*["']$/.test(value) && !/^-?\d+(\.\d+)?$/.test(value)) return null;
		entries.push([key, value.replace(/^["']|["']$/g, "")]);
	}
	return entries.length > 0 ? entries : [];
}

/* ------------------------------------------------------------------ */
/* Registry                                                            */
/* ------------------------------------------------------------------ */

export interface SourcePassOptions {
	marker: string;
	file: string;
}

export function runSourcePasses(
	source: string,
	meta: PandwindMeta,
	sources: ReadonlyArray<SourceId>,
	options: SourcePassOptions,
	result: TransformResult,
): string {
	let working = source;
	for (const id of sources) {
		if (id === "styled-components") {
			working = transformStyledComponents(working, meta, options, result);
		} else if (id === "stylex") {
			working = transformStylex(working, meta, options, result);
		} else if (id === "panda") {
			working = transformPanda(working, meta, options, result);
		}
	}
	return working;
}
