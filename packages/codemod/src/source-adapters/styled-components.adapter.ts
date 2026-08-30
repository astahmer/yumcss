import type { PandwindMeta } from "../meta.ts";
import { mapToken, type MappedToken } from "../map.ts";
import type { TransformResult } from "../migrate.ts";
import { ensureImport, hasCssBinding } from "../shared.ts";
import { CodemodAdapterId, type SourcePassId } from "../swap/identifiers.ts";
import type { SourcePassAdapter, SourcePassOptions } from "../source-pass-contract.ts";
import {
	applyEdits,
	computeExcludedRanges,
	camelProperty,
	type SourceEdit,
} from "../source-pass-utils.ts";

const STYLED_TEMPLATE_REGEX = /\bstyled\s*(?:\.\s*(\w+)|\(\s*(\w+)\s*\))\s*(`(?:[^`\\]|\\.)*`)/g;
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

type Declaration = { readonly prop: string; readonly dash: string; readonly value: string };

function propertyValueIndex(meta: PandwindMeta): Map<string, string> {
	const index = new Map<string, string>();
	for (const [utilityClass, { property, value }] of meta.bridgeInverse) {
		const key = `${property.toLowerCase()}|${value.toLowerCase()}`;
		if (!index.has(key)) index.set(key, utilityClass);
	}
	return index;
}

function typedEntryFor(
	property: string,
	value: string,
	meta: PandwindMeta,
	index: Map<string, string>,
): MappedToken | null {
	const utilityClass = index.get(`${property.toLowerCase()}|${value.toLowerCase()}`);
	return utilityClass === undefined ? null : mapToken(utilityClass, meta);
}

function parseFlatDeclarations(body: string): Declaration[] | null {
	if (/[$}{]/.test(body)) return null;
	const declarations: Declaration[] = [];
	for (const statement of body.split(";")) {
		const trimmed = statement.trim();
		if (trimmed === "") continue;
		if (trimmed.includes("\n")) return null;
		const colon = trimmed.indexOf(":");
		if (colon === -1) return null;
		const dash = trimmed.slice(0, colon).trim();
		const value = trimmed.slice(colon + 1).trim();
		if (!/^[a-z-]+$/i.test(dash) || value === "") return null;
		declarations.push({ prop: camelProperty(dash), dash, value });
	}
	return declarations.length > 0 ? declarations : null;
}

function renderCall(callee: string, entries: Array<[string, string]>): string {
	const body = entries
		.map(([key, value]) => `\t${JSON.stringify(key)}: ${JSON.stringify(value)},`)
		.join("\n");
	return `${callee}({\n${body}\n})`;
}

function jsxUsageEdits(
	source: string,
	name: string,
	tag: string,
	needsCx: { value: boolean },
	mask: { isExcluded(start: number): boolean },
): SourceEdit[] {
	const edits: SourceEdit[] = [];
	const tagRegex = new RegExp(`<(\\/?)\\s*${name}\\b([^>]*)>`, "g");
	for (const match of source.matchAll(tagRegex)) {
		const start = match.index ?? 0;
		if (mask.isExcluded(start)) continue;
		const end = start + match[0].length;
		const closing = match[1] === "/";
		const attrs = match[2] ?? "";
		if (closing) {
			edits.push({ start, end, text: `</${tag}>` });
			continue;
		}
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
			needsCx.value = true;
			const existing = staticClass[1]?.trim() ?? "";
			const merged = existing === "" ? name : `cx(${name}, ${JSON.stringify(existing)})`;
			nextAttrs = attrs.replace(staticClass[0], `className={${merged}}`);
		}
		edits.push({ start, end, text: `<${tag}${nextAttrs}>` });
	}
	return edits;
}

function transform(
	source: string,
	meta: PandwindMeta,
	options: SourcePassOptions,
	result: TransformResult,
): string {
	const edits: SourceEdit[] = [];
	const needsCx = { value: false };
	const mask = computeExcludedRanges(source, options.file);
	const bridgeIndex = propertyValueIndex(meta);
	const flag = (at: number, reason: string): void => {
		const lineStart = source.lastIndexOf("\n", Math.max(0, at - 1)) + 1;
		const indent = /^\s*/.exec(source.slice(lineStart))?.[0] ?? "";
		edits.push({
			start: lineStart,
			end: lineStart,
			text: `${indent}// ${options.marker} (${reason})\n`,
		});
		result.skippedByMarker++;
	};

	for (const match of source.matchAll(STYLED_TEMPLATE_REGEX)) {
		const start = match.index ?? 0;
		if (mask.isExcluded(start)) continue;
		const end = start + match[0].length;
		const tag = match[1];
		const body = match[3]?.slice(1, -1) ?? "";
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
		const declarations = parseFlatDeclarations(body);
		if (declarations === null) {
			flag(start, "nested selectors/media queries are flagged, not converted");
			continue;
		}
		if (!hasCssBinding(source)) {
			flag(start, "styled->css conversion needs an existing pandwind css binding");
			continue;
		}
		const typed: Array<[string, string]> = [];
		const atoms: Array<[string, string]> = [];
		for (const declaration of declarations) {
			const mapped = typedEntryFor(declaration.dash, declaration.value, meta, bridgeIndex);
			if (mapped !== null && typeof mapped.value === "string")
				typed.push([mapped.key, mapped.value]);
			else atoms.push([declaration.prop, declaration.value]);
		}
		edits.push({
			start,
			end,
			text: renderCall(atoms.length === 0 ? "tw" : "css.class", [...typed, ...atoms]),
		});
		result.converted++;
		if (name !== "") edits.push(...jsxUsageEdits(source, name, tag, needsCx, mask));
	}

	if (edits.length === 0) return source;
	let code = applyEdits(source, edits);
	code = code.replace(/\n?import\s+\w+\s+from\s+["']styled-components["'];?\n/g, "\n");
	if (needsCx.value) {
		code = ensureImport(code, 'import { createCx } from "pandwind/cx";');
		code = ensureImport(code, "const cx = createCx();");
	}
	return code;
}

const styledComponentsSourceAdapter: SourcePassAdapter = {
	id: CodemodAdapterId.StyledComponents as SourcePassId,
	transform,
};

export default styledComponentsSourceAdapter;
