import { NodeKind } from "../ast-node-kind.ts";
/**
 * Vite fold pass for `<Stack>` — rewrites literal-prop JSX into plain divs
 * with static class strings at build time (plans/016). Opt-in plugin.
 *
 * Conservative by contract: if ANY known prop carries a dynamic expression
 * or spread, the whole element stays runtime. Unknown attributes are copied
 * through verbatim (valid on any element). With an engine, classes and
 * prepared stylesheet declarations come from the same configured CSS lane as
 * `createStack(css)`; without one, this pass is explicitly Tailwind-only.
 */
import { SOURCE_SCANNER_SERVICE } from "../source-scanner.ts";
import { evalLiteral, walk, type OxcNode } from "../tw/literal.ts";
import { stackClasses, stackStyle, type StackProps } from "../stack/index.ts";
import type { PandwindEngineContext } from "./engine-context.ts";

export interface StackFoldOptions {
	/** Shared engine used by `createStack(css)` and `pandwindCssVite`. */
	readonly engine?: PandwindEngineContext;
	/** Attribute spelling for the selected renderer. Defaults to `className`. */
	readonly classAttribute?: "className" | "class";
}

const STACK_PROPS = new Set(["direction", "gap", "padding", "align", "justify"]);

interface JsxAttr {
	name: string;
	/** Statically evaluated value, or undefined when dynamic/spread. */
	value?: unknown;
	dynamic: boolean;
	raw: string;
}

interface FoldTarget {
	start: number;
	end: number;
	openingStart: number;
	openingEnd: number;
	closingStart: number;
	closingEnd: number;
	selfClosing: boolean;
	attrsText: string;
	classes: string | null;
}

interface NativeFoldTarget {
	openingStart: number;
	openingEnd: number;
	closingStart: number;
	closingEnd: number;
	selfClosing: boolean;
	classes: string;
}

function readAttributes(opening: Record<string, unknown>): { attrs: JsxAttr[] } {
	const attrs: JsxAttr[] = [];
	for (const attr of (opening.attributes ?? []) as Array<Record<string, unknown>>) {
		if (attr["type"] === NodeKind.JSXAttribute) {
			const name = ((attr["name"] as { name?: string })?.name ?? "") as string;
			const valueNode = attr["value"] as Record<string, unknown> | undefined;
			let value: unknown;
			let dynamic = false;
			if (valueNode === undefined || valueNode === null) {
				// Boolean-presence attributes stay passthrough, while a known prop
				// correctly prevents folding instead of being silently discarded.
				const raw = String((attr["name"] as { raw?: string })?.raw ?? name);
				attrs.push({ name, value: undefined, dynamic: true, raw });
				continue;
			}
			if (valueNode["type"] === NodeKind.Literal) {
				value = valueNode["value"] as string | number;
			} else if (valueNode["type"] === NodeKind.JSXExpressionContainer) {
				const inner = valueNode["expression"] as Record<string, unknown>;
				const literal = evalLiteral(inner as never);
				if (literal !== undefined) value = literal;
				else dynamic = true;
			} else {
				dynamic = true;
			}
			const raw = String((attr["name"] as { raw?: string })?.raw ?? name);
			attrs.push({ name, value, dynamic, raw });
		} else {
			// spread or namespace attr — unknown shape; remember raw text
			attrs.push({ name: "", value: undefined, dynamic: true, raw: String(attr) });
		}
	}
	return { attrs };
}

const sourceId = (id: string): string => id.split(/[?#]/u, 1)[0]!;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const attributeName = (part: string): string => /^([A-Za-z_][\w:.-]*)/u.exec(part)?.[1] ?? "";

const splitTopLevelAttributes = (openingText: string): readonly string[] => {
	const withoutTag = openingText
		.replace(/^<Stack/u, "")
		.replace(/\s*\/?>(?:$)/u, "")
		.trim();
	let depth = 0;
	let quote: '"' | "'" | undefined;
	let current = "";
	const parts: string[] = [];
	for (const character of withoutTag) {
		if (quote !== undefined) {
			current += character;
			if (character === quote) quote = undefined;
			continue;
		}
		if (character === '"' || character === "'") {
			quote = character;
			current += character;
			continue;
		}
		if ("([{".includes(character)) depth++;
		if (character === ")" || character === "]" || character === "}") depth--;
		if (depth === 0 && /\s/u.test(character) && current.trim() !== "") {
			parts.push(current.trim());
			current = "";
			continue;
		}
		current += character;
	}
	if (current.trim() !== "") parts.push(current.trim());
	return parts;
};

const evaluateStaticExpression = (expression: string): unknown => {
	try {
		const parsed = SOURCE_SCANNER_SERVICE.parse({
			file: "/pandwind/stack-expression.tsx",
			source: `const value = ${expression};`,
		});
		const program = parsed.program as unknown as {
			body?: readonly {
				type?: string;
				declarations?: readonly { init?: OxcNode }[];
			}[];
		};
		const declaration = program.body?.[0];
		if (declaration?.type !== NodeKind.VariableDeclaration) return undefined;
		return evalLiteral(declaration.declarations?.[0]?.init as never);
	} catch {
		return undefined;
	}
};

const readNativeAttributes = (openingText: string): { attrs: JsxAttr[] } => {
	const attrs: JsxAttr[] = [];
	for (const part of splitTopLevelAttributes(openingText)) {
		const name = attributeName(part);
		if (name === "") {
			attrs.push({ name: "", value: undefined, dynamic: true, raw: part });
			continue;
		}
		const assignment = part.slice(name.length).trim();
		if (!assignment.startsWith("=")) {
			attrs.push({ name, value: undefined, dynamic: true, raw: part });
			continue;
		}
		const rawValue = assignment.slice(1).trim();
		if (
			(rawValue.startsWith('"') && rawValue.endsWith('"')) ||
			(rawValue.startsWith("'") && rawValue.endsWith("'"))
		) {
			attrs.push({ name, value: rawValue.slice(1, -1), dynamic: false, raw: part });
			continue;
		}
		if (rawValue.startsWith("{") && rawValue.endsWith("}")) {
			const value = evaluateStaticExpression(rawValue.slice(1, -1).trim());
			attrs.push({ name, value, dynamic: value === undefined, raw: part });
			continue;
		}
		attrs.push({ name, value: undefined, dynamic: true, raw: part });
	}
	return { attrs };
};

const STACK_DIRECTIONS = new Set(["row", "column", "row-reverse", "column-reverse"]);
const STACK_ALIGNS = new Set(["start", "center", "end", "stretch", "baseline"]);
const STACK_JUSTIFIES = new Set(["start", "center", "end", "between", "around", "evenly"]);

const isResponsiveValue = (value: unknown, leaf: (value: unknown) => boolean): boolean => {
	if (!isPlainObject(value)) return leaf(value);
	const entries = Object.entries(value);
	return (
		entries.length > 0 &&
		entries.every(([condition, nested]) => {
			return condition.length > 0 && isResponsiveValue(nested, leaf);
		})
	);
};

const isStackProps = (value: unknown): value is StackProps => {
	if (!isPlainObject(value)) return false;
	return Object.entries(value).every(([name, propValue]) => {
		switch (name) {
			case "direction":
				return isResponsiveValue(
					propValue,
					(leaf) => typeof leaf === "string" && STACK_DIRECTIONS.has(leaf),
				);
			case "gap":
			case "padding":
				return isResponsiveValue(
					propValue,
					(leaf) =>
						(typeof leaf === "string" || typeof leaf === "number") &&
						(typeof leaf !== "number" || Number.isFinite(leaf)),
				);
			case "align":
				return isResponsiveValue(
					propValue,
					(leaf) => typeof leaf === "string" && STACK_ALIGNS.has(leaf),
				);
			case "justify":
				return isResponsiveValue(
					propValue,
					(leaf) => typeof leaf === "string" && STACK_JUSTIFIES.has(leaf),
				);
			default:
				return false;
		}
	});
};

/** Fold all literal-prop Stack elements in one module. Returns edited code. */
export function foldStackElements(
	code: string,
	id: string,
	options: StackFoldOptions = {},
): { code: string; folded: number } {
	const source = sourceId(id);
	options.engine?.clearPreparedStyles(source);
	if (!code.includes("Stack")) return { code, folded: 0 };
	const parsed = SOURCE_SCANNER_SERVICE.parse({ file: source, source: code });

	const targets: FoldTarget[] = [];
	const classAttribute = options.classAttribute ?? "className";
	walk(parsed.program as unknown as OxcNode, (node) => {
		if ((node as { type?: string }).type !== NodeKind.JSXElement) return;
		const el = node as {
			openingElement?: Record<string, unknown>;
			closingElement?: Record<string, unknown>;
			start?: number;
			end?: number;
		};
		const opening = el.openingElement!;
		if (((opening.name as { name?: string })?.name ?? "") !== "Stack") return;

		const { attrs } = readAttributes(opening);
		const known = attrs.filter((a) => a.name !== "" && STACK_PROPS.has(a.name));
		const classAttr = attrs.find((attr) => attr.name === classAttribute);
		// conservative: any dynamic/spread anywhere → leave the element alone
		if (
			known.some((a) => a.dynamic) ||
			attrs.some((a) => a.dynamic && (a.name === "" || a.name === classAttribute)) ||
			(classAttr !== undefined &&
				classAttr.value !== undefined &&
				typeof classAttr.value !== "string" &&
				typeof classAttr.value !== "number")
		)
			return;

		const props: Record<string, unknown> = {};
		for (const a of known) {
			if (a.value === undefined) continue;
			props[a.name] = a.value;
		}
		if (!isStackProps(props)) return;
		const classes =
			options.engine === undefined
				? stackClasses(props)
				: options.engine.foldLiteralStyle(stackStyle(props), source);
		if (classes === null) return;
		const extraClass = classAttr?.value;
		const mergedClasses =
			typeof extraClass === "string" || typeof extraClass === "number"
				? `${classes}${String(extraClass) === "" ? "" : ` ${extraClass}`}`
				: classes;

		const selfClosing = Boolean(opening.selfClosing);
		targets.push({
			start: el.start!,
			end: el.end!,
			openingStart: opening.start as number,
			openingEnd: opening.end as number,
			closingStart: (el.closingElement?.start as number) ?? -1,
			closingEnd: (el.closingElement?.end as number) ?? -1,
			selfClosing,
			attrsText: "",
			classes: mergedClasses,
		});
	});

	if (targets.length === 0) return { code, folded: 0 };

	// Apply edits back-to-front so ranges stay valid.
	type Edit = { start: number; end: number; text: string };
	const edits: Edit[] = [];
	for (const t of targets) {
		const passthrough = passthroughAttrs(code.slice(t.openingStart, t.openingEnd), classAttribute);
		if (t.selfClosing) {
			const inner = passthrough === "" ? "" : ` ${passthrough}`;
			edits.push({
				start: t.start,
				end: t.end,
				text: `<div ${classAttribute}="${t.classes}"${inner} />`,
			});
		} else {
			const inner = passthrough === "" ? "" : ` ${passthrough}`;
			edits.push({
				start: t.openingStart,
				end: t.openingEnd,
				text: `<div ${classAttribute}="${t.classes}"${inner}>`,
			});
			edits.push({ start: t.closingStart, end: t.closingEnd, text: "</div>" });
		}
	}
	// import removal when no other Stack reference remains
	let out = code;
	for (const e of [...edits].toSorted((a, b) => b.start - a.start)) {
		out = out.slice(0, e.start) + e.text + out.slice(e.end);
	}
	if (!/(?<![A-Za-z0-9_])Stack(?![A-Za-z0-9_])/.test(stripImportLines(out))) {
		out = out.replace(
			/\n?import\s+\{[^}]*\bStack\b[^}]*\}\s+from\s+["'][^"']*pandwind\/stack[^"']*["'];?\n/g,
			"\n",
		);
	}
	return { code: out, folded: targets.length };
}

const NATIVE_STACK_TAG = /<\/?Stack(?=\s|\/?>)/gu;

const findNativeTagEnd = (code: string, start: number): number => {
	let depth = 0;
	let quote: '"' | "'" | undefined;
	for (let index = start; index < code.length; index++) {
		const character = code[index]!;
		if (quote !== undefined) {
			if (character === quote) quote = undefined;
			continue;
		}
		if (character === '"' || character === "'") {
			quote = character;
			continue;
		}
		if (character === "{") depth++;
		if (character === "}") depth--;
		if (character === ">" && depth === 0) return index + 1;
	}
	return -1;
};

const isInsideNativeCodeBlock = (code: string, index: number): boolean => {
	const scriptStart = code.lastIndexOf("<script", index);
	const scriptEnd = code.lastIndexOf("</script>", index);
	const styleStart = code.lastIndexOf("<style", index);
	const styleEnd = code.lastIndexOf("</style>", index);
	return scriptStart > scriptEnd || styleStart > styleEnd;
};

const findNativeClosingTag = (
	code: string,
	openingEnd: number,
): { start: number; end: number } | undefined => {
	let depth = 1;
	for (const match of code.matchAll(NATIVE_STACK_TAG)) {
		const start = match.index!;
		if (start < openingEnd) continue;
		if (code[start + 1] === "/") {
			depth--;
			if (depth === 0) {
				const end = code.indexOf(">", start);
				return end === -1 ? undefined : { start, end: end + 1 };
			}
			continue;
		}
		const end = findNativeTagEnd(code, start);
		if (end === -1) return undefined;
		if (!code.slice(start, end).trimEnd().endsWith("/>")) depth++;
	}
	return undefined;
};

const foldNativeStackElements = (
	code: string,
	id: string,
	options: StackFoldOptions = {},
): { code: string; folded: number } => {
	const source = sourceId(id);
	options.engine?.clearPreparedStyles(source);
	if (!code.includes("<Stack")) return { code, folded: 0 };

	const targets: NativeFoldTarget[] = [];
	for (const match of code.matchAll(NATIVE_STACK_TAG)) {
		const start = match.index!;
		if (code[start + 1] === "/" || isInsideNativeCodeBlock(code, start)) continue;
		const openingEnd = findNativeTagEnd(code, start);
		if (openingEnd === -1) continue;
		const openingText = code.slice(start, openingEnd);
		const { attrs } = readNativeAttributes(openingText);
		const known = attrs.filter((attribute) => STACK_PROPS.has(attribute.name));
		const classAttr = attrs.find((attribute) => attribute.name === "class");
		if (
			known.some((attribute) => attribute.dynamic) ||
			attrs.some(
				(attribute) => attribute.dynamic && (attribute.name === "" || attribute.name === "class"),
			) ||
			(classAttr !== undefined &&
				classAttr.value !== undefined &&
				typeof classAttr.value !== "string" &&
				typeof classAttr.value !== "number")
		)
			continue;

		const props: Record<string, unknown> = {};
		for (const attribute of known) {
			if (attribute.value === undefined) continue;
			props[attribute.name] = attribute.value;
		}
		if (!isStackProps(props)) continue;
		const classes =
			options.engine === undefined
				? stackClasses(props)
				: options.engine.foldLiteralStyle(stackStyle(props), source);
		if (classes === null) continue;
		const extraClass = classAttr?.value;
		const mergedClasses =
			typeof extraClass === "string" || typeof extraClass === "number"
				? `${classes}${String(extraClass) === "" ? "" : ` ${extraClass}`}`
				: classes;
		const selfClosing = openingText.trimEnd().endsWith("/>");
		let closingStart = -1;
		let closingEnd = -1;
		if (!selfClosing) {
			const closing = findNativeClosingTag(code, openingEnd);
			if (closing === undefined) continue;
			if (/<Stack(?=\s|\/?>)/u.test(code.slice(openingEnd, closing.start))) continue;
			closingStart = closing.start;
			closingEnd = closing.end;
		}
		targets.push({
			openingStart: start,
			openingEnd,
			closingStart,
			closingEnd,
			selfClosing,
			classes: mergedClasses,
		});
	}

	if (targets.length === 0) return { code, folded: 0 };

	type Edit = { start: number; end: number; text: string };
	const edits: Edit[] = [];
	for (const target of targets) {
		const passthrough = passthroughAttrs(
			code.slice(target.openingStart, target.openingEnd),
			"class",
		);
		const inner = passthrough === "" ? "" : ` ${passthrough}`;
		if (target.selfClosing) {
			edits.push({
				start: target.openingStart,
				end: target.openingEnd,
				text: `<div class="${target.classes}"${inner}></div>`,
			});
			continue;
		}
		edits.push({
			start: target.openingStart,
			end: target.openingEnd,
			text: `<div class="${target.classes}"${inner}>`,
		});
		edits.push({ start: target.closingStart, end: target.closingEnd, text: "</div>" });
	}

	let out = code;
	for (const edit of edits.toSorted((left, right) => right.start - left.start)) {
		out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
	}
	if (!/<Stack(?=\s|\/?>)/u.test(out)) {
		out = out.replace(
			/\n?import\s+Stack\s+from\s+["']pandwind\/stack\/(?:svelte|astro)["'];?\n/gu,
			"\n",
		);
	}
	return { code: out, folded: targets.length };
};

function stripImportLines(code: string): string {
	return code.replace(/^import[^\n]*\n/gm, "");
}

/** Attributes that are NOT stack props pass through to the div untouched. */
function passthroughAttrs(openingText: string, classAttribute: "className" | "class"): string {
	const withoutTag = openingText
		.replace(/^<Stack/, "")
		.replace(/\/?>$/, "")
		.trim();
	const kept: string[] = [];
	// crude but safe split on top-level spaces outside braces/brackets/quotes
	let depth = 0;
	let quote: '"' | "'" | undefined;
	let cur = "";
	const parts: string[] = [];
	for (const ch of withoutTag) {
		if (quote !== undefined) {
			cur += ch;
			if (ch === quote) quote = undefined;
			continue;
		}
		if (ch === '"' || ch === "'") {
			quote = ch;
			cur += ch;
			continue;
		}
		if ("([{".includes(ch)) depth++;
		if (")]}".includes(ch)) depth--;
		if (depth === 0 && /\s/u.test(ch) && cur.trim() !== "") {
			parts.push(cur.trim());
			cur = "";
			continue;
		}
		cur += ch;
	}
	if (cur.trim() !== "") parts.push(cur.trim());
	for (const part of parts) {
		const name = /^([A-Za-z_][\w-]*)/.exec(part)?.[1] ?? "";
		if (STACK_PROPS.has(name) || name === classAttribute) continue;
		kept.push(part.replace(/=\{"([^"]*)"\}$/, '="$1"'));
	}
	return kept.join(" ");
}

/** Vite plugin: opt-in erasure of literal-prop Stack elements. */
export function stackFoldVite(options: StackFoldOptions = {}): {
	name: string;
	enforce: "pre";
	transform: (code: string, id: string) => { code: string; map: null } | null;
	handleHotUpdate: (context: { file: string; modules?: unknown[] }) => unknown[] | undefined;
} {
	return {
		name: "pandwind:stack-fold",
		enforce: "pre",
		transform(code: string, id: string) {
			const source = sourceId(id);
			if (/[?#]/u.test(id)) return null;
			const result = /\.(?:svelte|astro)$/u.test(source)
				? foldNativeStackElements(code, id, options)
				: /\.[cm]?[jt]sx$/u.test(source)
					? foldStackElements(code, id, options)
					: null;
			if (result === null || result.folded === 0) return null;
			return { code: result.code, map: null };
		},
		handleHotUpdate(context) {
			options.engine?.clearPreparedStyles(sourceId(context.file));
			return context.modules;
		},
	};
}
