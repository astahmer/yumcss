import type { AdapterParseContext } from "./adapter-contract.ts";
import type { StyleProgramSource } from "./semantic-ir.ts";

export interface JsxStyleAttribute {
	readonly name: string;
	readonly raw: string;
	readonly value: string | true;
	readonly expression: boolean;
}

export interface JsxStyleHostMatch {
	readonly end: number;
	readonly openingTag: string;
	readonly attributes: readonly JsxStyleAttribute[];
	readonly styleAttributes: readonly JsxStyleAttribute[];
	readonly body: string;
	readonly source: StyleProgramSource;
}

export interface JsxStyleHostRenderResult {
	readonly text: string;
	readonly needsCx: boolean;
}

/** Shared host syntax port for adapters that express styles as JSX attributes. */
// oxlint-disable-next-line typescript/no-extraneous-class -- one scoped static host utility is the adapter port.
export class JsxStyleHost {
	static parse(
		source: string,
		start: number,
		_context: AdapterParseContext,
		styleProps: readonly string[],
		styleSource: StyleProgramSource,
	): JsxStyleHostMatch | undefined {
		const end = this.findEnd(source, start);
		if (end === undefined) return undefined;
		const openingTag = source.slice(start, end);
		const attributes = this.attributes(openingTag);
		const names = new Set(styleProps);
		const styleAttributes = attributes.filter((attribute) => names.has(attribute.name));
		if (styleAttributes.length === 0) return undefined;
		const parts: string[] = [];
		for (const attribute of styleAttributes) {
			if (attribute.value === true) {
				parts.push(`${attribute.name}: true`);
				continue;
			}
			if (!attribute.expression) {
				parts.push(`${attribute.name}: ${JSON.stringify(attribute.value)}`);
				continue;
			}
			const expression = attribute.value.trim();
			if (this.isObject(expression) && ["css", "sx", "style"].includes(attribute.name)) {
				parts.push(expression.slice(1, -1));
			} else {
				parts.push(`${attribute.name}: ${expression}`);
			}
		}
		return {
			end,
			openingTag,
			attributes,
			styleAttributes,
			body: parts.join(", "),
			source: {
				...styleSource,
				hostOpenTag: openingTag,
				hostStyleAttributes: styleAttributes.map((attribute) => attribute.raw),
				hostAttribute: "jsx-style-props",
			},
		};
	}

	static render(
		openingTag: string,
		styleAttributes: readonly string[],
		classExpression: string,
		framework: string | undefined,
	): JsxStyleHostRenderResult {
		let text = openingTag;
		for (const raw of styleAttributes) {
			const index = text.indexOf(raw);
			if (index !== -1) text = `${text.slice(0, index)}${text.slice(index + raw.length)}`;
		}
		const attribute = framework === "react" || framework === "preact" ? "className" : "class";
		let needsCx = false;
		const classPattern = new RegExp(
			`(\\s)${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{([\\s\\S]*?)\\})`,
		);
		const existing = classPattern.exec(text);
		if (existing !== null) {
			const value = existing[4] ?? JSON.stringify(existing[2] ?? existing[3] ?? "");
			text = `${text.slice(0, existing.index)}${existing[1]}${attribute}={cx(${classExpression}, ${value})}${text.slice(existing.index + existing[0].length)}`;
			needsCx = true;
		} else {
			const insertion = text.endsWith("/>") ? text.length - 2 : text.length - 1;
			text = `${text.slice(0, insertion)} ${attribute}={${classExpression}}${text.slice(insertion)}`;
		}
		return { text, needsCx };
	}

	private static isObject(expression: string): boolean {
		return expression.startsWith("{") && expression.endsWith("}");
	}

	private static findEnd(source: string, start: number): number | undefined {
		let quote: string | undefined;
		let braces = 0;
		for (let index = start; index < source.length; index++) {
			const character = source[index]!;
			if (quote !== undefined) {
				if (character === "\\") index++;
				else if (character === quote) quote = undefined;
				continue;
			}
			if (character === '"' || character === "'") {
				quote = character;
				continue;
			}
			if (character === "{") {
				braces++;
				continue;
			}
			if (character === "}" && braces > 0) {
				braces--;
				continue;
			}
			if (character === ">" && braces === 0) return index + 1;
		}
		return undefined;
	}

	private static attributes(openingTag: string): JsxStyleAttribute[] {
		const attributes: JsxStyleAttribute[] = [];
		let index = 1;
		while (index < openingTag.length && !/[\s/>]/.test(openingTag[index]!)) index++;
		while (index < openingTag.length) {
			while (index < openingTag.length && /\s/.test(openingTag[index]!)) index++;
			if (
				index >= openingTag.length ||
				openingTag[index] === ">" ||
				openingTag.slice(index, index + 2) === "/>"
			)
				break;
			if (openingTag[index] === "{") {
				const end = this.balanced(openingTag, index, "{", "}");
				index = end === undefined ? openingTag.length : end;
				continue;
			}
			const rawStart = index;
			while (index < openingTag.length && /[\w$:.-]/.test(openingTag[index]!)) index++;
			const name = openingTag.slice(rawStart, index);
			if (name === "") {
				index++;
				continue;
			}
			while (index < openingTag.length && /\s/.test(openingTag[index]!)) index++;
			let value: string | true = true;
			let expression = false;
			if (openingTag[index] === "=") {
				index++;
				while (index < openingTag.length && /\s/.test(openingTag[index]!)) index++;
				const marker = openingTag[index];
				if (marker === '"' || marker === "'") {
					const end = this.quoted(openingTag, index, marker);
					if (end === undefined) break;
					value = openingTag.slice(index + 1, end - 1);
					index = end;
				} else if (marker === "{") {
					const end = this.balanced(openingTag, index, "{", "}");
					if (end === undefined) break;
					value = openingTag.slice(index + 1, end - 1);
					expression = true;
					index = end;
				} else {
					const valueStart = index;
					while (index < openingTag.length && !/[\s/>]/.test(openingTag[index]!)) index++;
					value = openingTag.slice(valueStart, index);
				}
			}
			attributes.push({ name, raw: openingTag.slice(rawStart, index), value, expression });
		}
		return attributes;
	}

	private static quoted(source: string, start: number, quote: string): number | undefined {
		for (let index = start + 1; index < source.length; index++) {
			if (source[index] === "\\") index++;
			else if (source[index] === quote) return index + 1;
		}
		return undefined;
	}

	private static balanced(
		source: string,
		start: number,
		open: string,
		close: string,
	): number | undefined {
		let depth = 0;
		let quote: string | undefined;
		for (let index = start; index < source.length; index++) {
			const character = source[index]!;
			if (quote !== undefined) {
				if (character === "\\") index++;
				else if (character === quote) quote = undefined;
				continue;
			}
			if (character === '"' || character === "'" || character === "`") {
				quote = character;
				continue;
			}
			if (character === open) depth++;
			if (character === close && --depth === 0) return index + 1;
		}
		return undefined;
	}
}
