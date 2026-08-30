import { matchBlock } from "../sources.ts";
import type { AdapterParseContext } from "./adapter-contract.ts";
import {
	styleProgramFromRules,
	type StyleDeclaration,
	type StyleProgram,
	type StyleProgramResidual,
} from "./semantic-ir.ts";

const camelProperty = (property: string): string =>
	property.trim().replace(/-([a-z])/g, (_match, character: string) => character.toUpperCase());

function templateDynamicExpression(rawValue: string): string {
	const interpolation = /^\$\{([\s\S]+)\}$/.exec(rawValue.trim());
	if (interpolation?.[1] !== undefined) return interpolation[1].trim();
	return `\`${rawValue.replaceAll("\\", "\\\\").replaceAll("`", "\\`")}\``;
}

/** Find a template's closing backtick without mistaking nested expression templates for it. */
export function findTemplateLiteralEnd(source: string, openTick: number): number | undefined {
	for (let index = openTick + 1; index < source.length; index++) {
		const character = source[index];
		if (character === "\\") {
			index++;
			continue;
		}
		if (character === "$" && source[index + 1] === "{") {
			const interpolation = matchBlock(source, index + 1);
			if (interpolation !== null) {
				index = interpolation.end - 1;
				continue;
			}
		}
		if (character === "`") return index;
	}
	return undefined;
}

/** Parse the static and dynamic subset shared by tagged-template adapters. */
export function parseAdapterTemplate(
	body: string,
	context: AdapterParseContext,
	adapter: string,
	start: number,
): StyleProgram {
	const parseBlock = (
		input: string,
	): {
		declarations: StyleDeclaration[];
		children: StyleProgram["rules"][number][];
		residuals: StyleProgramResidual[];
	} => {
		const declarations: StyleDeclaration[] = [];
		const children: StyleProgram["rules"][number][] = [];
		const residuals: StyleProgramResidual[] = [];
		let cursor = 0;
		let order = 0;
		const addDeclaration = (statement: string): void => {
			const trimmed = statement.replace(/\/\*.*?\*\//gs, "").trim();
			if (trimmed === "") return;
			const colon = trimmed.indexOf(":");
			if (colon <= 0) {
				residuals.push({
					kind: "parse",
					text: statement,
					hint: `${adapter} nested template CSS requires a rule parser`,
				});
				return;
			}
			const rawValue = trimmed.slice(colon + 1).trim();
			const interpolation = /\$\{([\s\S]+)\}/.exec(rawValue);
			let value: StyleDeclaration["value"];
			if (interpolation?.[1] !== undefined) {
				const expression = templateDynamicExpression(rawValue);
				value = { kind: "dynamic", expression, lowering: "residual" };
				residuals.push({
					kind: "dynamic",
					text: rawValue,
					hint: interpolation[1]?.includes("=>")
						? `${adapter} function interpolation requires a framework prop wrapper`
						: `${adapter} template interpolation requires a runtime-aware lowering`,
				});
			} else {
				value = { kind: "literal", value: rawValue };
			}
			declarations.push({
				conditions: [],
				property: camelProperty(trimmed.slice(0, colon)),
				value,
			});
		};
		while (cursor < input.length) {
			while (/\s/.test(input[cursor] ?? "")) cursor++;
			if (cursor >= input.length) break;
			let index = cursor;
			let parens = 0;
			let quote: string | undefined;
			let delimiter: ";" | "{" | undefined;
			for (; index < input.length; index++) {
				const character = input[index]!;
				if (quote !== undefined) {
					if (character === quote && input[index - 1] !== "\\") quote = undefined;
					continue;
				}
				if (character === "'" || character === '"') {
					quote = character;
					continue;
				}
				if (character === "(") parens++;
				if (character === ")") parens--;
				if (character === "$" && input[index + 1] === "{") {
					const interpolation = matchBlock(input, index + 1);
					if (interpolation !== null) {
						index = interpolation.end - 1;
						continue;
					}
				}
				if (parens === 0 && (character === ";" || character === "{")) {
					delimiter = character;
					break;
				}
			}
			if (delimiter === "{") {
				const selector = input.slice(cursor, index).trim();
				const block = matchBlock(input, index);
				if (block === null || selector === "") {
					residuals.push({
						kind: "parse",
						text: input.slice(cursor),
						hint: "unbalanced template CSS",
					});
					break;
				}
				const nested = parseBlock(block.body);
				const normalizedSelector =
					selector.startsWith("&") || selector.startsWith(":") || selector.startsWith("[")
						? selector
						: `& ${selector}`;
				children.push({
					kind: "style",
					selector: normalizedSelector,
					conditions: [],
					declarations: nested.declarations,
					children: nested.children,
					order: order++,
				});
				residuals.push(...nested.residuals);
				cursor = block.end;
				continue;
			}
			if (delimiter === ";") {
				addDeclaration(input.slice(cursor, index));
				cursor = index + 1;
				continue;
			}
			addDeclaration(input.slice(cursor));
			break;
		}
		return { declarations, children, residuals };
	};
	const parsed = parseBlock(body);
	return styleProgramFromRules(
		[
			{
				kind: "style",
				conditions: [],
				declarations: parsed.declarations,
				children: parsed.children,
				order: 0,
			},
		],
		{
			source: {
				file: context.file,
				start,
				adapter,
				...(context.document?.framework ? { framework: context.document.framework } : {}),
			},
			residuals: parsed.residuals,
		},
	);
}
