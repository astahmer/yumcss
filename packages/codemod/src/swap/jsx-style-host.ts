import type { AdapterParseContext } from "./adapter-contract.ts";
import { getHostFrameworkAdapter } from "./host-adapters.ts";
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
	/** Tagged-template style values can be extracted without treating the tag as a dynamic property. */
	readonly template?: string;
	readonly source: StyleProgramSource;
}

export interface JsxStyleHostRenderResult {
	readonly text: string;
	readonly needsCx: boolean;
}

export type JsxStylePropSelector =
	| readonly string[]
	| ((name: string, openingTag?: string) => boolean);

const isPandwindCarrier = (expression: string): boolean =>
	/^css\.(?:class|vars)\(/u.test(expression.trim());

const classNameExpression = (expression: string): string => {
	const match = /^([A-Za-z_$][\w$]*)\.className$/u.exec(expression.trim());
	return match === null ? expression : `${match[1]}?.className`;
};

const hostClassExpression = (binding: string, attribute: "className" | "class"): string =>
	attribute === "className"
		? classNameExpression(`${binding}.${attribute}`)
		: `${binding}?.${attribute}`;

const canCarryClassName = (binding: string): boolean =>
	/^(?:props|rest|attrs|[A-Za-z_$][\w$]*(?:Props|Attributes|attrs))$/u.test(binding);

const mergeClassExpression = (
	generated: string,
	existing: string,
): { readonly expression: string; readonly needsCx: boolean } =>
	isPandwindCarrier(generated)
		? { expression: `css.props(${generated}, ${existing}).className`, needsCx: false }
		: { expression: `cx(${generated}, ${existing})`, needsCx: true };

/** Shared host syntax port for adapters that express styles as JSX attributes. */
export class JsxStyleHost {
	static parse(
		source: string,
		start: number,
		_context: AdapterParseContext,
		styleProps: JsxStylePropSelector,
		styleSource: StyleProgramSource,
		matchWithoutStyleProps = false,
	): JsxStyleHostMatch | undefined {
		const end = this.findEnd(source, start);
		if (end === undefined) return undefined;
		const openingTag = source.slice(start, end);
		const attributes = this.attributes(openingTag);
		const matches =
			typeof styleProps === "function"
				? styleProps
				: (name: string) => new Set(styleProps).has(name);
		const styleAttributes = attributes.filter((attribute) => matches(attribute.name, openingTag));
		if (styleAttributes.length === 0 && !matchWithoutStyleProps) return undefined;
		const parts: string[] = [];
		let template: string | undefined;
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
			const taggedTemplate = expression.match(/^(?:css|style)\s*`([\s\S]*)`$/u);
			if (taggedTemplate !== null && attribute.name === "css") {
				template = taggedTemplate[1] ?? "";
				continue;
			}
			const objectCall = /^(?:css|style)\s*\(([\s\S]*)\)$/u.exec(expression);
			if (objectCall?.[1] !== undefined && this.isObject(objectCall[1].trim())) {
				parts.push(objectCall[1].trim().slice(1, -1).replace(/,\s*$/, ""));
				continue;
			}
			if (this.isObject(expression) && ["css", "sx", "style", "styles"].includes(attribute.name)) {
				parts.push(expression.slice(1, -1).replace(/,\s*$/, ""));
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
			...(template === undefined ? {} : { template }),
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
		styleExpression?: string,
		hostTag?: string,
		varsExpression?: string,
	): JsxStyleHostRenderResult {
		let text =
			hostTag === undefined
				? openingTag
				: openingTag.replace(/^<\s*[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?/u, `<${hostTag}`);
		for (const raw of styleAttributes) {
			const index = text.indexOf(raw);
			if (index !== -1) {
				const whitespace = index > 0 && /[ \t]/.test(text[index - 1]!) ? 1 : 0;
				text = `${text.slice(0, index - whitespace)}${text.slice(index + raw.length)}`;
			}
		}
		const host = framework === undefined ? undefined : getHostFrameworkAdapter(framework);
		const attribute = host?.classAttribute ?? "class";
		let needsCx = false;
		const classPattern = new RegExp(
			`(\\s)${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{([\\s\\S]*?)\\})`,
		);
		const insertAttribute = (value: string): void => {
			const insertion = text.endsWith("/>") ? text.length - 2 : text.length - 1;
			const renderedValue = hostTag === undefined && !value.startsWith(" ") ? ` ${value}` : value;
			text =
				hostTag === undefined
					? `${text.slice(0, insertion)}${renderedValue}${text.slice(insertion)}`
					: `${text.slice(0, insertion).trimEnd()} ${value.trimStart()}${text.slice(insertion)}`;
		};
		const existing = classPattern.exec(text);
		const spread = [...text.matchAll(/\{\s*\.\.\.([A-Za-z_$][\w$]*)\s*\}/g)].at(-1);
		const spreadExpression =
			varsExpression === undefined
				? undefined
				: attribute === "className"
					? `css.props(${varsExpression})`
					: varsExpression;
		const canSpreadProps =
			spreadExpression !== undefined &&
			existing === null &&
			spread === undefined &&
			this.attributes(text).every((candidate) => candidate.name !== "style") &&
			(host === undefined || host.syntax === "jsx");
		const insertSpread = (expression: string): void => {
			const selfClosing = text.endsWith("/>");
			const insertion = selfClosing ? text.length - 2 : text.length - 1;
			const prefix = text.slice(0, insertion).trimEnd();
			text = `${prefix} {...${expression}}${selfClosing ? " />" : ">"}`;
		};
		if (spreadExpression !== undefined && canSpreadProps) {
			insertSpread(spreadExpression);
			text = text.replace(/^([\s\S]*?<\s*[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)\s{2,}/u, "$1 ");
			if (hostTag !== undefined) text = text.replace(/\s*\/>$/u, " />");
			return { text, needsCx };
		}
		const styleAttribute = this.attributes(text).find((candidate) => candidate.name === "style");
		const styleValue =
			styleAttribute?.expression === true && typeof styleAttribute.value === "string"
				? styleAttribute.value.trim()
				: undefined;
		const classInputs = [
			...(existing === null
				? []
				: [
						{
							index: existing.index,
							value: existing[4]?.trim() ?? JSON.stringify(existing[2] ?? existing[3] ?? ""),
						},
					]),
			...(spread !== undefined && canCarryClassName(spread[1]!)
				? [
						{
							index: spread.index,
							value: hostClassExpression(spread[1]!, attribute),
						},
					]
				: []),
		]
			.toSorted((left, right) => left.index - right.index)
			.map((entry) => entry.value);
		const styleInputs = [
			...(styleAttribute === undefined || styleValue === undefined
				? []
				: [
						{
							index: text.indexOf(styleAttribute.raw),
							value: styleValue,
						},
					]),
			...(spread !== undefined && canCarryClassName(spread[1]!)
				? [
						{
							index: spread.index,
							value: `${spread[1]}?.style`,
						},
					]
				: []),
		]
			.toSorted((left, right) => left.index - right.index)
			.map((entry) => entry.value);
		const canReuseVars =
			varsExpression !== undefined &&
			(host === undefined || host.syntax === "jsx") &&
			(styleAttribute === undefined || styleValue !== undefined) &&
			(spread === undefined || canCarryClassName(spread[1]!));
		if (canReuseVars) {
			const variable = "__pandwindVars";
			const styleObject =
				styleInputs.length === 0
					? undefined
					: `{ ${styleInputs.map((value) => `...(${value} ?? {})`).join(", ")}, ...${variable}.style }`;
			const carrier =
				attribute === "className"
					? `css.props(${variable}${classInputs.length > 0 ? `, ${classInputs.join(", ")}` : ""})`
					: classInputs.length === 0
						? variable
						: `{ ...${variable}, class: [${variable}.class, ${classInputs.join(", ")}].filter(Boolean).join(" ") }`;
			const returnExpression =
				styleObject === undefined ? carrier : `{ ...${carrier}, style: ${styleObject} }`;
			const localCarrier = `(() => { const ${variable} = ${varsExpression}; return ${returnExpression}; })()`;
			const removals = [
				...(existing === null ? [] : [{ index: existing.index, length: existing[0].length }]),
				...(styleAttribute === undefined
					? []
					: [{ index: text.indexOf(styleAttribute.raw), length: styleAttribute.raw.length }]),
			].toSorted((left, right) => right.index - left.index);
			for (const removal of removals) {
				const start =
					removal.index > 0 && /\s/.test(text[removal.index - 1]!)
						? removal.index - 1
						: removal.index;
				text = `${text.slice(0, start)}${text.slice(removal.index + removal.length)}`;
			}
			insertSpread(localCarrier);
			text = text.replace(/^([\s\S]*?<\s*[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)\s{2,}/u, "$1 ");
			if (hostTag !== undefined) text = text.replace(/\s*\/>$/u, " />");
			return { text, needsCx };
		}
		if (existing !== null) {
			const value = existing[4] ?? JSON.stringify(existing[2] ?? existing[3] ?? "");
			const spreadClass =
				spread !== undefined && spread.index > existing.index && canCarryClassName(spread[1]!)
					? `, ${hostClassExpression(spread[1]!, attribute)}`
					: "";
			const merged = mergeClassExpression(
				classExpression,
				classNameExpression(`${value}${spreadClass}`),
			);
			const replacement = `${existing[1]}${attribute}={${merged.expression}}`;
			text = `${text.slice(0, existing.index)}${replacement}${text.slice(existing.index + existing[0].length)}`;
			if (spread !== undefined && spread.index > existing.index) {
				const renderedIndex = text.indexOf(replacement);
				if (renderedIndex !== -1) {
					text = `${text.slice(0, renderedIndex)}${text.slice(renderedIndex + replacement.length)}`;
					insertAttribute(hostTag === undefined ? replacement : replacement.trimStart());
				}
			}
			needsCx ||= merged.needsCx;
		} else if (spread !== undefined && canCarryClassName(spread[1]!)) {
			const merged = mergeClassExpression(
				classExpression,
				hostClassExpression(spread[1]!, attribute),
			);
			const rendered = ` ${attribute}={${merged.expression}}`;
			insertAttribute(hostTag === undefined ? rendered : rendered.trimStart());
			needsCx ||= merged.needsCx;
		} else {
			insertAttribute(`${attribute}={${classExpression}}`);
		}
		if (styleExpression !== undefined && !/\bstyle\s*=/.test(text)) {
			insertAttribute(`style={${styleExpression}}`);
		}
		text = text.replace(/^([\s\S]*?<\s*[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)\s{2,}/u, "$1 ");
		if (hostTag !== undefined)
			// Factory tags are newly projected to intrinsic hosts. Normalize the
			// closing fragment while the shared pass above removes whitespace left
			// by any host style attribute.
			text = text.replace(/\s*\/>$/u, " />");
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
			const nameEnd = index;
			while (index < openingTag.length && /\s/.test(openingTag[index]!)) index++;
			let rawEnd = nameEnd;
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
				rawEnd = index;
			}
			attributes.push({ name, raw: openingTag.slice(rawStart, rawEnd), value, expression });
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
