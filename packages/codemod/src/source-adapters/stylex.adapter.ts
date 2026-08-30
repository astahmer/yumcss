import type { PandwindMeta } from "../meta.ts";
import type { TransformResult } from "../migrate.ts";
import { ensureImport, hasCssBinding } from "../shared.ts";
import { CodemodAdapterId, type SourcePassId } from "../swap/identifiers.ts";
import type { SourcePassAdapter, SourcePassOptions } from "../source-pass-contract.ts";
import {
	computeExcludedRanges,
	insertSkipMarker,
	matchBlock,
	splitTopLevel,
} from "../source-pass-utils.ts";

const STYLEX_UNITLESS_PROPERTIES = new Set([
	"animationIterationCount",
	"aspectRatio",
	"borderImageOutset",
	"borderImageSlice",
	"borderImageWidth",
	"boxFlex",
	"boxFlexGroup",
	"boxOrdinalGroup",
	"columnCount",
	"columns",
	"flex",
	"flexGrow",
	"flexNegative",
	"flexOrder",
	"flexPositive",
	"flexShrink",
	"fontWeight",
	"gridArea",
	"gridColumn",
	"gridColumnEnd",
	"gridColumnSpan",
	"gridColumnStart",
	"gridRow",
	"gridRowEnd",
	"gridRowSpan",
	"gridRowStart",
	"lineClamp",
	"lineHeight",
	"opacity",
	"order",
	"orphans",
	"tabSize",
	"widows",
	"zIndex",
	"zoom",
	"fillOpacity",
	"floodOpacity",
	"stopOpacity",
	"strokeDasharray",
	"strokeDashoffset",
	"strokeMiterlimit",
	"strokeOpacity",
	"strokeWidth",
	"scale",
]);

function camelProperty(property: string): string {
	return property.replace(/-(\w|$)/g, (_match, character: string) => character.toUpperCase());
}

function matchParen(source: string, open: number): { body: string; end: number } | null {
	let depth = 0;
	for (let index = open; index < source.length; index++) {
		if (source[index] === "(") depth++;
		else if (source[index] === ")") {
			depth--;
			if (depth === 0) return { body: source.slice(open + 1, index), end: index + 1 };
		}
	}
	return null;
}

function parseStylexEntries(body: string): Array<[string, Array<[string, string]>]> | null {
	const entries: Array<[string, Array<[string, string]>]> = [];
	let index = 0;
	while (index < body.length) {
		while (index < body.length && /\s/.test(body[index]!)) index++;
		if (index >= body.length) break;
		let name: string;
		if (body[index] === '"' || body[index] === "'") {
			const quote = body[index]!;
			const end = body.indexOf(quote, index + 1);
			if (end === -1) return null;
			name = body.slice(index + 1, end);
			index = end + 1;
		} else {
			const identifier = /^[A-Za-z_$][\w$]*/.exec(body.slice(index));
			if (identifier === null) return null;
			name = identifier[0];
			index += identifier[0].length;
		}
		while (index < body.length && /\s/.test(body[index]!)) index++;
		if (body[index] !== ":") return null;
		index++;
		while (index < body.length && /\s/.test(body[index]!)) index++;
		if (body[index] !== "{") return null;
		const block = matchBlock(body, index);
		if (block === null) return null;
		const declarations: Array<[string, string]> = [];
		for (const statement of splitTopLevel(block.body, ",")) {
			const trimmed = statement.trim();
			if (trimmed === "" || trimmed.startsWith("//")) continue;
			const colon = trimmed.indexOf(":");
			if (colon === -1) return null;
			const property = trimmed.slice(0, colon).trim();
			const value = trimmed.slice(colon + 1).trim();
			if (property.startsWith(":") || property.startsWith("@") || !/^['"].*['"]$/.test(value))
				return null;
			declarations.push([property, value.slice(1, -1)]);
		}
		if (declarations.length === 0) return null;
		entries.push([name, declarations]);
		index = block.end;
		while (index < body.length && /[\s,]/.test(body[index]!)) index++;
	}
	return entries.length > 0 ? entries : null;
}

function transform(
	source: string,
	_meta: PandwindMeta,
	options: SourcePassOptions,
	result: TransformResult,
): string {
	if (!/["']@stylexjs\/stylex["']/.test(source)) return source;
	if (!hasCssBinding(source)) {
		const firstCreate = source.search(/\bstylex\.create\s*\(/);
		if (firstCreate === -1) return source;
		result.skippedByMarker++;
		return insertSkipMarker(
			source,
			firstCreate,
			"stylex->css conversion needs an existing pandwind css binding",
			options.marker,
		);
	}

	let working = source;
	const mask = computeExcludedRanges(source, options.file);
	const replacements: Array<{ start: number; end: number; replacement: string }> = [];
	for (const match of source.matchAll(/stylex\.create\s*\(/g)) {
		const start = match.index ?? 0;
		if (mask.isExcluded(start)) continue;
		const openParen = start + match[0].length - 1;
		const argument = matchParen(source, openParen);
		if (argument === null || !argument.body.trim().startsWith("{")) continue;
		const unwrapped = matchBlock(argument.body.trim(), 0);
		const parsed = unwrapped === null ? null : parseStylexEntries(unwrapped.body);
		if (parsed === null) {
			working = insertSkipMarker(
				working,
				start,
				"stylex.create with pseudo/media/non-literal styles is flagged, not converted",
				options.marker,
			);
			result.skippedByMarker++;
			continue;
		}
		const rendered = parsed
			.map(([name, declarations]) => {
				const body = declarations
					.map(([property, value]) => {
						const key = camelProperty(property);
						const normalized =
							/^-?\d+(?:\.\d+)?$/.test(value) && !STYLEX_UNITLESS_PROPERTIES.has(key)
								? `${value}px`
								: value;
						return `\t\t${JSON.stringify(key)}: ${JSON.stringify(normalized)},`;
					})
					.join("\n");
				return `\t${JSON.stringify(name)}: css.class({\n${body}\n\t}),`;
			})
			.join("\n");
		replacements.push({
			start,
			end: start + match[0].length - 1 + (argument.end - openParen),
			replacement: `{\n${rendered}\n}`,
		});
		result.converted++;
	}
	for (const replacement of [...replacements].toSorted((left, right) => right.start - left.start)) {
		working =
			working.slice(0, replacement.start) +
			replacement.replacement +
			working.slice(replacement.end);
	}
	working = working.replaceAll("stylex.props(", "cx(");
	working = working.replace(
		/\n?import\s*\*\s*as\s+\w+\s+from\s+["']@stylexjs\/stylex["'];?\n?/g,
		"\n",
	);
	working = working.replace(/\n?import\s*\{[^}]*\}\s+from\s+["']@stylexjs\/stylex["'];?\n?/g, "\n");
	if (/\bcx\(/.test(working)) {
		working = ensureImport(working, 'import { createCx } from "pandwind/cx";');
		working = ensureImport(working, "const cx = createCx();");
	}
	return working;
}

const stylexSourceAdapter: SourcePassAdapter = {
	id: CodemodAdapterId.StyleX as SourcePassId,
	transform,
};

export default stylexSourceAdapter;
