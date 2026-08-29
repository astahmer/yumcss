import type { PandwindMeta } from "../../../meta.ts";
import { parseObjectLiteral } from "../../parse.ts";
import { emitPandaStyle, convertPandaStyle } from "./migration-stages.ts";
import { PANDA_ALIASES, literalToPlain, normalizePandaStyleObject } from "./parse.ts";
import type { PandaTheme } from "./theme.ts";

/** A parsed Panda factory opening element and its source spans. */
export interface PandaFactoryElement {
	readonly start: number;
	readonly openEnd: number;
	readonly selfClosing: boolean;
	readonly tag: string;
	readonly attrs: readonly PandaFactoryAttribute[];
}

interface PandaFactoryAttribute {
	readonly name: string;
	readonly nameStart: number;
	readonly attrEnd: number;
	/** Raw value text; JSX braces are excluded. */
	readonly valueText: string | null;
	readonly quoted: boolean;
	readonly literal: boolean;
}

const DOM_ATTRIBUTE =
	/^(key|ref|children|as|href|src|alt|title|target|rel|role|type|id|lang|dir|hidden|tabIndex|download|loading|method|action|placeholder|for|aria-[\w-]+|data-[\w-]+|on[A-Z][\w]*)$/;

/**
 * Panda factory policy: scan JSX style props and lower only literal values.
 * The caller owns source masking and decides whether a non-literal is a
 * residual; this object only owns Panda's syntax and rewrite semantics.
 */
// oxlint-disable-next-line typescript/no-extraneous-class -- scoped Panda factory policy
export class PandaFactoryAdapter {
	static residuals(element: PandaFactoryElement, theme: PandaTheme) {
		const styleEntries: Array<[string, unknown]> = [];
		for (const attribute of element.attrs) {
			if (DOM_ATTRIBUTE.test(attribute.name) || attribute.name === "className") continue;
			if (attribute.valueText === null) {
				styleEntries.push([attribute.name, true]);
				continue;
			}
			if (attribute.quoted) {
				styleEntries.push([attribute.name, attribute.valueText]);
				continue;
			}
			const objectText = PandaFactoryAdapter.stripOuterBraces(attribute.valueText);
			const object = objectText === null ? null : parseObjectLiteral(objectText);
			if (objectText !== null && object !== null) {
				styleEntries.push([attribute.name, literalToPlain(object)]);
				continue;
			}
			const scalar = PandaFactoryAdapter.scalar(attribute.valueText);
			if (scalar !== null) styleEntries.push([attribute.name, scalar]);
		}
		const styleObject: Record<string, unknown> = {};
		for (const [key, value] of styleEntries) styleObject[PANDA_ALIASES.get(key) ?? key] = value;
		return convertPandaStyle(styleObject, theme).residuals;
	}

	static scan(source: string, isExcluded: (start: number) => boolean): PandaFactoryElement[] {
		const elements: PandaFactoryElement[] = [];
		for (const match of source.matchAll(/<panda\.([A-Za-z][\w]*)/g)) {
			const start = match.index ?? 0;
			if (isExcluded(start)) continue;
			let index = start + match[0].length;
			const attrs: PandaFactoryAttribute[] = [];
			let selfClosing = false;
			let valid = true;
			while (index < source.length) {
				while (/\s/.test(source[index] ?? "")) index++;
				const character = source[index];
				if (character === "/" && source[index + 1] === ">") {
					selfClosing = true;
					index += 2;
					break;
				}
				if (character === ">") {
					index++;
					break;
				}
				if (source.startsWith("{...", index)) {
					let depth = 0;
					let end = index;
					for (; end < source.length; end++) {
						if (source[end] === "{") depth++;
						else if (source[end] === "}") {
							depth--;
							if (depth === 0) break;
						}
					}
					if (depth !== 0) {
						valid = false;
						break;
					}
					attrs.push({
						name: "...spread",
						nameStart: index,
						attrEnd: end + 1,
						valueText: null,
						quoted: false,
						literal: false,
					});
					index = end + 1;
					continue;
				}
				const nameMatch = /^([\w$-]+)/.exec(source.slice(index));
				if (nameMatch === null) {
					valid = false;
					break;
				}
				const name = nameMatch[1]!;
				const nameStart = index;
				index += name.length;
				if (source[index] === "=" && source[index + 1] === "{") {
					index += 2;
					let depth = 1;
					let end = index;
					while (end < source.length && depth > 0) {
						if (source[end] === "{") depth++;
						else if (source[end] === "}") depth--;
						end++;
					}
					if (depth !== 0) {
						valid = false;
						break;
					}
					const valueText = source.slice(index, end - 1).trim();
					const objectText = PandaFactoryAdapter.stripOuterBraces(valueText);
					const literal =
						(objectText !== null && parseObjectLiteral(objectText) !== null) ||
						/^"[^"]*"$|'[^']*'$|^-?\d+(\.\d+)?$|^true$|^false$/.test(valueText);
					attrs.push({
						name,
						nameStart,
						attrEnd: end,
						valueText,
						quoted: false,
						literal,
					});
					index = end;
					continue;
				}
				if (source[index] === "=" && (source[index + 1] === '"' || source[index + 1] === "'")) {
					const quote = source[index + 1]!;
					const close = source.indexOf(quote, index + 2);
					if (close === -1) {
						valid = false;
						break;
					}
					attrs.push({
						name,
						nameStart,
						attrEnd: close + 1,
						valueText: source.slice(index + 2, close),
						quoted: true,
						literal: true,
					});
					index = close + 1;
					continue;
				}
				if (source[index] === "=") {
					valid = false;
					break;
				}
				attrs.push({
					name,
					nameStart,
					attrEnd: index,
					valueText: null,
					quoted: false,
					literal: true,
				});
			}
			if (valid && index <= source.length)
				elements.push({ start, openEnd: index, selfClosing, tag: match[1]!, attrs });
		}
		return elements;
	}

	static edits(
		element: PandaFactoryElement,
		source: string,
		meta: PandwindMeta,
		theme: PandaTheme,
	): Array<{ start: number; end: number; text: string }> | null {
		const styleEntries: Array<[string, unknown]> = [];
		let existingClass: string | null = null;
		for (const attribute of element.attrs) {
			if (attribute.name === "className" && attribute.valueText !== null) {
				existingClass = attribute.quoted
					? JSON.stringify(attribute.valueText)
					: attribute.valueText;
				continue;
			}
			if (DOM_ATTRIBUTE.test(attribute.name)) continue;
			if (attribute.valueText === null) {
				styleEntries.push([attribute.name, true]);
				continue;
			}
			if (attribute.quoted) {
				styleEntries.push([attribute.name, attribute.valueText]);
				continue;
			}
			const objectText = PandaFactoryAdapter.stripOuterBraces(attribute.valueText);
			const object = objectText === null ? null : parseObjectLiteral(objectText);
			if (objectText !== null && object !== null) {
				styleEntries.push([attribute.name, literalToPlain(object)]);
				continue;
			}
			const scalar = PandaFactoryAdapter.scalar(attribute.valueText);
			if (scalar === null) return null;
			styleEntries.push([attribute.name, scalar]);
		}
		if (!/^[A-Za-z][\w]*$/.test(element.tag)) return null;
		const styleObject: Record<string, unknown> = {};
		for (const [key, value] of styleEntries) styleObject[PANDA_ALIASES.get(key) ?? key] = value;
		const ir = convertPandaStyle(styleObject, theme);
		if (emitPandaStyle(ir, meta) === "") return null;
		const normalized = normalizePandaStyleObject(Object.fromEntries(styleEntries));
		const style = `{ ${Object.entries(normalized)
			.map(([key, value]) => `${JSON.stringify(key)}: ${PandaFactoryAdapter.renderValue(value)}`)
			.join(", ")} }`;
		const classExpression = existingClass
			? `cx(css.class(${style}), ${existingClass})`
			: `css.class(${style})`;
		const edits: Array<{ start: number; end: number; text: string }> = [];
		for (const attribute of element.attrs) {
			if (DOM_ATTRIBUTE.test(attribute.name)) continue;
			let end = attribute.attrEnd;
			while (/\s/.test(source[end] ?? "")) end++;
			edits.push({ start: attribute.nameStart, end, text: "" });
		}
		edits.push({ start: element.start, end: element.start + "<panda.".length, text: "<" });
		const injectAt = element.selfClosing ? element.openEnd - 2 : element.openEnd - 1;
		edits.push({ start: injectAt, end: injectAt, text: ` className={${classExpression}}` });
		return edits;
	}

	private static scalar(raw: string): string | number | boolean | null {
		const value = raw.trim();
		if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
		if (value === "true" || value === "false") return value === "true";
		return null;
	}

	private static stripOuterBraces(text: string): string | null {
		const value = text.trim();
		if (!(value.startsWith("{") && value.endsWith("}"))) return null;
		let depth = 0;
		for (let index = 0; index < value.length; index++) {
			if (value[index] === "{") depth++;
			else if (value[index] === "}") {
				depth--;
				if (depth === 0 && index !== value.length - 1) return null;
			}
		}
		return depth === 0 ? value.slice(1, -1) : null;
	}

	private static renderValue(value: unknown): string {
		if (Array.isArray(value))
			return `[${value.map((item) => PandaFactoryAdapter.renderValue(item)).join(", ")}]`;
		if (typeof value === "object" && value !== null)
			return `{ ${Object.entries(value)
				.map(([key, item]) => `${JSON.stringify(key)}: ${PandaFactoryAdapter.renderValue(item)}`)
				.join(", ")} }`;
		return JSON.stringify(value);
	}
}
