/**
 * Small CSS tree for generated utility output.
 *
 * This parser intentionally covers the structural subset emitted by utility
 * engines: declarations, style rules, and nested at-rules. Keeping it local
 * avoids importing PostCSS (and its Node-oriented source-map/path graph) into
 * the browser migration entry point.
 */
export interface GeneratedCssDeclaration {
	readonly type: "decl";
	readonly prop: string;
	readonly value: string;
}

export interface GeneratedCssRule {
	readonly type: "rule";
	readonly selector: string;
	readonly nodes: readonly GeneratedCssNode[];
}

export interface GeneratedCssAtRule {
	readonly type: "atrule";
	readonly name: string;
	readonly params: string;
	readonly nodes: readonly GeneratedCssNode[];
}

export type GeneratedCssNode = GeneratedCssDeclaration | GeneratedCssRule | GeneratedCssAtRule;

function skipTrivia(css: string, start: number): number {
	let index = start;
	while (index < css.length) {
		if (/\s/u.test(css[index]!)) {
			index++;
			continue;
		}
		if (css.startsWith("/*", index)) {
			const end = css.indexOf("*/", index + 2);
			index = end === -1 ? css.length : end + 2;
			continue;
		}
		break;
	}
	return index;
}

function scanPrelude(css: string, start: number): { readonly text: string; readonly end: number } {
	let index = start;
	let quote: string | undefined;
	let parentheses = 0;
	let brackets = 0;
	while (index < css.length) {
		const character = css[index]!;
		if (quote !== undefined) {
			if (character === "\\") index += 2;
			else {
				if (character === quote) quote = undefined;
				index++;
			}
			continue;
		}
		if (character === '"' || character === "'") {
			quote = character;
			index++;
			continue;
		}
		if (character === "(") parentheses++;
		else if (character === ")" && parentheses > 0) parentheses--;
		else if (character === "[") brackets++;
		else if (character === "]" && brackets > 0) brackets--;
		else if (
			parentheses === 0 &&
			brackets === 0 &&
			(character === "{" || character === ";" || character === "}")
		)
			return { text: css.slice(start, index).trim(), end: index };
		index++;
	}
	return { text: css.slice(start).trim(), end: css.length };
}

function declaration(prelude: string): GeneratedCssDeclaration | undefined {
	const colon = prelude.indexOf(":");
	if (colon <= 0) return undefined;
	const prop = prelude.slice(0, colon).trim();
	const value = prelude.slice(colon + 1).trim();
	return prop === "" || value === "" ? undefined : { type: "decl", prop, value };
}

function atRule(
	prelude: string,
	nodes: readonly GeneratedCssNode[],
): GeneratedCssAtRule | undefined {
	const match = /^@([^\s]+)(?:\s+([\s\S]*))?$/u.exec(prelude);
	if (match === null || match[1] === undefined) return undefined;
	return { type: "atrule", name: match[1], params: match[2]?.trim() ?? "", nodes };
}

function parseNodes(
	css: string,
	start: number,
	stopAtClosingBrace: boolean,
): {
	readonly nodes: readonly GeneratedCssNode[];
	readonly end: number;
} {
	const nodes: GeneratedCssNode[] = [];
	let index = start;
	while (index < css.length) {
		index = skipTrivia(css, index);
		if (index >= css.length) break;
		if (css[index] === "}") {
			return { nodes, end: stopAtClosingBrace ? index + 1 : index };
		}
		const prelude = scanPrelude(css, index);
		if (prelude.text === "") {
			index = prelude.end + (css[prelude.end] === ";" ? 1 : 0);
			continue;
		}
		const delimiter = css[prelude.end];
		if (delimiter === ";") {
			const parsed = declaration(prelude.text);
			if (parsed !== undefined) nodes.push(parsed);
			index = prelude.end + 1;
			continue;
		}
		if (delimiter !== "{") {
			const parsed = declaration(prelude.text);
			if (parsed !== undefined) nodes.push(parsed);
			return {
				nodes,
				end: delimiter === "}" ? prelude.end + 1 : prelude.end,
			};
		}
		const children = parseNodes(css, prelude.end + 1, true);
		const parsed = prelude.text.startsWith("@")
			? atRule(prelude.text, children.nodes)
			: ({
					type: "rule",
					selector: prelude.text,
					nodes: children.nodes,
				} satisfies GeneratedCssRule);
		if (parsed !== undefined) nodes.push(parsed);
		index = children.end;
	}
	return { nodes, end: index };
}

export function parseGeneratedCss(css: string): readonly GeneratedCssNode[] {
	return parseNodes(css, 0, false).nodes;
}
