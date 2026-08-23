/**
 * Vite fold pass for `<Stack>` — rewrites literal-prop JSX into plain divs
 * with static class strings at build time (plans/016). Opt-in plugin.
 *
 * Conservative by contract: if ANY known prop carries a dynamic expression
 * or spread, the whole element stays runtime. Unknown attributes are copied
 * through verbatim (valid on any element). When the last `<Stack>` in a
 * file is erased, its `pandwind/stack` import is removed.
 */
import { parseSync } from "oxc-parser";
import { walk, type OxcNode } from "../tw/literal.ts";
import { stackClasses, type StackProps } from "../stack/index.ts";

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
		if (attr["type"] === "JSXAttribute") {
			const name = ((attr["name"] as { name?: string })?.name ?? "") as string;
			const valueNode = attr["value"] as Record<string, unknown> | undefined;
			let value: string | number | undefined;
			let dynamic = false;
			if (valueNode === undefined || valueNode === null) {
				// boolean-presence attribute — not a stack prop; copy through
				pieces.push(String((attr["name"] as { raw?: string })?.raw ?? name));
				continue;
			}
			if (valueNode["type"] === "Literal" || valueNode["type"] === "StringLiteral") {
				value = valueNode["value"] as string | number;
			} else if (valueNode["type"] === "JSXExpressionContainer") {
				const inner = valueNode["expression"] as Record<string, unknown>;
				if (inner?.type === "Literal") value = inner["value"] as string | number;
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

/** Fold all literal-prop Stack elements in one module. Returns edited code. */
export function foldStackElements(code: string, id: string): { code: string; folded: number } {
	if (!code.includes("Stack")) return { code, folded: 0 };
	const parsed = parseSync(id, code, {
		sourceType: "module",
		lang: id.endsWith(".tsx") ? "tsx" : "ts",
	});

	const targets: FoldTarget[] = [];
	walk(parsed.program as unknown as OxcNode, (node) => {
		if ((node as { type?: string }).type !== "JSXElement") return;
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
		if (known.some((a) => a.dynamic) || attrs.some((a) => a.dynamic && a.name === "")) return;

		const props: StackProps = {};
		for (const a of known) {
			if (a.value === undefined) continue;
			(props as unknown as Record<string, string | number>)[a.name] = a.value;
		}
		const classes = stackClasses(props);

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
			classes,
		});
	});

	if (targets.length === 0) return { code, folded: 0 };

	// Apply edits back-to-front so ranges stay valid.
	type Edit = { start: number; end: number; text: string };
	const edits: Edit[] = [];
	for (const t of targets) {
		const passthrough = passthroughAttrs(code.slice(t.openingStart, t.openingEnd));
		if (t.selfClosing) {
			const inner = passthrough === "" ? "" : ` ${passthrough}`;
			edits.push({
				start: t.start,
				end: t.end,
				text: `<div className="${t.classes}"${inner} />`,
			});
		} else {
			const inner = passthrough === "" ? "" : ` ${passthrough}`;
			edits.push({
				start: t.openingStart,
				end: t.openingEnd,
				text: `<div className="${t.classes}"${inner}>`,
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
function passthroughAttrs(openingText: string): string {
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
		if (STACK_PROPS.has(name)) continue;
		kept.push(part.replace(/=\{"([^"]*)"\}$/, '="$1"'));
	}
	return kept.join(" ");
}

/** Vite plugin: opt-in erasure of literal-prop Stack elements. */
export function stackFoldVite(): {
	name: string;
	transform: (code: string, id: string) => { code: string; map: null } | null;
} {
	return {
		name: "pandwind:stack-fold",
		transform(code: string, id: string) {
			if (!/\.[cm]?[jt]sx$/.test(id)) return null;
			const result = foldStackElements(code, id);
			if (result.folded === 0) return null;
			return { code: result.code, map: null };
		},
	};
}
