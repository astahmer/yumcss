import { SourcePass } from "../source-pass-utils.ts";
import { StyleDynamicExpressionKind } from "./identifiers.ts";
import {
	StyleDynamicLoweringTag,
	StyleProgramResidualKindTag,
	StyleRuleKindTag,
	StyleValueKindTag,
} from "./semantic-ir.ts";
import type { AdapterParseContext } from "./adapter-contract.ts";
import {
	styleProgramFromRules,
	type StyleDeclaration,
	type StyleProgram,
	type StyleProgramResidual,
} from "./semantic-ir.ts";

export const camelPropertyName = (property: string): string =>
	property.trim().replace(/-([a-z])/g, (_match, character: string) => character.toUpperCase());

export function templateValueExpression(rawValue: string): string {
	const normalized = rawValue.trim();
	if (normalized.startsWith("${")) {
		const interpolation = SourcePass.matchBlock(normalized, 1);
		if (interpolation?.end === normalized.length) return interpolation.body.trim();
	}
	return `\`${rawValue.replaceAll("\\", "\\\\").replaceAll("`", "\\`")}\``;
}

/**
 * Function interpolations are first-class dynamics for adapters whose target
 * contract lowers `function-values`. Strip a TypeScript return annotation so
 * the arrow is valid at runtime; the value expression is the annotated body.
 */
function functionValueExpression(rawValue: string): string | undefined {
	const expression = templateValueExpression(rawValue);
	const annotated =
		// The annotation must be arrow-free (`[^=>]*`); a function-typed return
		// annotation needs a real type parser, so those stay residuals.
		/^\(([\s\S]*?)\)\s*:\s*[^=>]*?\s*=>\s*([\s\S]*)$/.exec(expression);
	if (annotated === null) return undefined;
	return `(${annotated[1]}) => ${annotated[2]!.trim()}`;
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
			const interpolation = SourcePass.matchBlock(source, index + 1);
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
	options: { readonly functionValues?: boolean } = {},
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
					kind: StyleProgramResidualKindTag.Parse,
					text: statement,
					hint: `${adapter} nested template CSS requires a rule parser`,
				});
				return;
			}
			const rawValue = trimmed.slice(colon + 1).trim();
			const hasInterpolation = rawValue.includes("${");
			let value: StyleDeclaration["value"];
			if (hasInterpolation) {
				const functionValue =
					options.functionValues === true && rawValue.includes("=>")
						? functionValueExpression(rawValue)
						: undefined;
				if (functionValue !== undefined) {
					value = {
						kind: StyleValueKindTag.Dynamic,
						expression: functionValue,
						expressionKind: StyleDynamicExpressionKind.Function,
						lowering: StyleDynamicLoweringTag.Residual,
					};
				} else {
					const expression = templateValueExpression(rawValue);
					value = {
						kind: StyleValueKindTag.Dynamic,
						expression,
						lowering: StyleDynamicLoweringTag.Residual,
					};
					residuals.push({
						kind: StyleProgramResidualKindTag.Dynamic,
						text: rawValue,
						hint: rawValue.includes("=>")
							? `${adapter} function interpolation requires a framework prop wrapper`
							: `${adapter} template interpolation requires a runtime-aware lowering`,
					});
				}
			} else {
				value = { kind: StyleValueKindTag.Literal, value: rawValue };
			}
			declarations.push({
				conditions: [],
				property: camelPropertyName(trimmed.slice(0, colon)),
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
					const interpolation = SourcePass.matchBlock(input, index + 1);
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
				const block = SourcePass.matchBlock(input, index);
				if (block === null || selector === "") {
					residuals.push({
						kind: StyleProgramResidualKindTag.Parse,
						text: input.slice(cursor),
						hint: "unbalanced template CSS",
					});
					break;
				}
				if (selector.includes("${"))
					residuals.push({
						kind: StyleProgramResidualKindTag.Dynamic,
						text: selector,
						hint: `${adapter} component selector interpolation requires a host rewrite`,
					});
				const nested = parseBlock(block.body);
				const normalizedSelector = selector.startsWith("&")
					? selector
					: selector.startsWith(":") || selector.startsWith("[")
						? `&${selector}`
						: `& ${selector}`;
				children.push({
					kind: StyleRuleKindTag.Style,
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
				kind: StyleRuleKindTag.Style,
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
