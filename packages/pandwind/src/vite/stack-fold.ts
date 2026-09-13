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
import { walk, type OxcNode } from "../tw/literal.ts";
import { stackClasses, stackStyle, type StackProps } from "../stack/index.ts";
import type { PandwindEngineContext } from "./engine-context.ts";

export interface StackFoldOptions {
	/** Shared engine used by `createStack(css)` and `pandwindCssVite`. */
	readonly engine?: PandwindEngineContext;
	/** JSX attribute spelling for the selected renderer. Defaults to `className`. */
	readonly classAttribute?: "className" | "class";
}

const STACK_PROPS = new Set(["direction", "gap", "padding", "align", "justify"]);

interface JsxAttr {
	name: string;
	/** Literal string/number value, or undefined when dynamic/spread. */
	value?: string | number;
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

function readAttributes(opening: Record<string, unknown>): { attrs: JsxAttr[] } {
	const attrs: JsxAttr[] = [];
	const pieces: string[] = [];
	for (const attr of (opening.attributes ?? []) as Array<Record<string, unknown>>) {
		if (attr["type"] === NodeKind.JSXAttribute) {
			const name = ((attr["name"] as { name?: string })?.name ?? "") as string;
			const valueNode = attr["value"] as Record<string, unknown> | undefined;
			let value: string | number | undefined;
			let dynamic = false;
			if (valueNode === undefined || valueNode === null) {
				// Boolean-presence attributes stay passthrough, while a known prop
				// correctly prevents folding instead of being silently discarded.
				const raw = String((attr["name"] as { raw?: string })?.raw ?? name);
				attrs.push({ name, value: undefined, dynamic: true, raw });
				pieces.push(raw);
				continue;
			}
			if (valueNode["type"] === NodeKind.Literal) {
				value = valueNode["value"] as string | number;
			} else if (valueNode["type"] === NodeKind.JSXExpressionContainer) {
				const inner = valueNode["expression"] as Record<string, unknown>;
				if (inner?.type === NodeKind.Literal) value = inner["value"] as string | number;
				else dynamic = true;
			} else {
				dynamic = true;
			}
			const raw = String((attr["name"] as { raw?: string })?.raw ?? name);
			attrs.push({ name, value, dynamic, raw });
			pieces.push(raw);
		} else {
			// spread or namespace attr — unknown shape; remember raw text
			pieces.push(String(attr));
			attrs.push({ name: "", value: undefined, dynamic: true, raw: String(attr) });
		}
	}
	return { attrs };
}

const sourceId = (id: string): string => id.split(/[?#]/u, 1)[0]!;

/** Fold all literal-prop Stack elements in one module. Returns edited code. */
export function foldStackElements(
	code: string,
	id: string,
	options: StackFoldOptions = {},
): { code: string; folded: number } {
	const source = sourceId(id);
	options.engine?.clearPreparedStyles(source);
	if (!code.includes("Stack")) return { code, folded: 0 };
	const parsed = SOURCE_SCANNER_SERVICE.parse({ file: id, source: code });

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
		// conservative: any dynamic/spread anywhere → leave the element alone
		if (
			known.some((a) => a.dynamic) ||
			attrs.some((a) => a.dynamic && (a.name === "" || a.name === classAttribute))
		)
			return;

		const props: StackProps = {};
		for (const a of known) {
			if (a.value === undefined) continue;
			(props as unknown as Record<string, string | number>)[a.name] = a.value;
		}
		const classes =
			options.engine === undefined
				? stackClasses(props)
				: options.engine.foldLiteralStyle(stackStyle(props), source);
		if (classes === null) return;
		const extraClass = attrs.find((attr) => attr.name === classAttribute)?.value;
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
	let cur = "";
	const parts: string[] = [];
	for (const ch of withoutTag) {
		if ("([{".includes(ch)) depth++;
		if (")]}".includes(ch)) depth--;
		if (depth === 0 && ch === " " && cur.trim() !== "") {
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
			if (!/\.[cm]?[jt]sx$/.test(sourceId(id))) return null;
			const result = foldStackElements(code, id, options);
			if (result.folded === 0) return null;
			return { code: result.code, map: null };
		},
		handleHotUpdate(context) {
			options.engine?.clearPreparedStyles(sourceId(context.file));
			return context.modules;
		},
	};
}
