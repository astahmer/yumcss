import { StyleValueKindTag } from "./semantic-ir.ts";
import type { AdapterParseContext, AdapterParseResult } from "./adapter-contract.ts";
import {
	styleProgramFromSourceObject,
	type StyleProgram,
	type StyleProgramOptions,
	type StyleProgramResidual,
} from "./semantic-ir.ts";

export interface FunctionStyleCallParserOptions {
	readonly id: string;
	readonly pattern?: string;
	readonly functionCall: RegExp;
	readonly namedObjects?: boolean;
	readonly sourceObjectOptions?: Pick<
		StyleProgramOptions,
		"nestedObjectKind" | "namedRuleObjects" | "arrayRuleKinds" | "emissionHints"
	>;
	readonly subjectFromMatch?: (match: string) => string | undefined;
}

interface BalancedPair {
	readonly end: number;
	readonly body: string;
}

function balanced(source: string, open: number): BalancedPair | undefined {
	let depth = 0;
	for (let index = open; index < source.length; index++) {
		if (source[index] === "{") depth++;
		if (source[index] === "}") {
			depth--;
			if (depth === 0) return { end: index + 1, body: source.slice(open + 1, index) };
		}
	}
	return undefined;
}

function balancedCall(source: string, open: number): BalancedPair | undefined {
	let depth = 0;
	for (let index = open; index < source.length; index++) {
		if (source[index] === "(") depth++;
		if (source[index] === ")") {
			depth--;
			if (depth === 0) return { end: index + 1, body: source.slice(open + 1, index) };
		}
	}
	return undefined;
}

function functionCallOpen(source: string, start: number, matchEnd: number): number {
	for (let index = start; index < matchEnd; index++) {
		if (source[index] !== "(") continue;
		const call = balancedCall(source, index);
		if (call?.body.includes("=>") === true) return index;
	}
	return source.indexOf("(", start);
}

function markFunctionValues(program: StyleProgram, parameter: string): StyleProgram {
	const declaration = (item: StyleProgram["declarations"][number]) => ({
		...item,
		value:
			item.value.kind === StyleValueKindTag.Dynamic
				? { ...item.value, expression: `(${parameter}) => ${item.value.expression}` }
				: item.value,
	});
	const rule = (item: StyleProgram["rules"][number]): StyleProgram["rules"][number] => ({
		...item,
		declarations: item.declarations.map(declaration),
		children: item.children.map(rule),
	});
	return {
		...program,
		declarations: program.declarations.map(declaration),
		rules: program.rules.map(rule),
	};
}

/** Parses function-valued style calls without coupling the scanner to a CSS-in-JS dialect. */
export class FunctionStyleCallParser {
	static parse(
		source: string,
		context: AdapterParseContext,
		options: FunctionStyleCallParserOptions,
	): AdapterParseResult {
		const matches: Array<AdapterParseResult["matches"][number]> = [];
		const residuals: StyleProgramResidual[] = [];
		const isExcluded = context.document?.isExcluded ?? (() => false);
		const functionCall = options.functionCall;
		functionCall.lastIndex = 0;
		for (const match of source.matchAll(functionCall)) {
			const start = match.index ?? 0;
			if (isExcluded(start)) continue;
			const open = functionCallOpen(source, start, start + match[0].length);
			const call = balancedCall(source, open);
			if (call === undefined) {
				residuals.push({
					kind: "parse",
					text: source.slice(start),
					hint: `${options.id} function style is unbalanced`,
				});
				continue;
			}
			const sourceOptions: StyleProgramOptions = {
				source: {
					file: context.file,
					start,
					end: call.end,
					adapter: options.id,
					...(options.pattern === undefined ? {} : { pattern: options.pattern }),
					...(context.document?.framework ? { framework: context.document.framework } : {}),
					...context.semantic?.source,
				},
				...(context.semantic?.themes ? { themes: context.semantic.themes } : {}),
				...(context.semantic?.compositions ? { compositions: context.semantic.compositions } : {}),
				...(context.semantic?.runtime ? { runtime: context.semantic.runtime } : {}),
				...(context.semantic?.plugins ? { plugins: context.semantic.plugins } : {}),
				...(options.namedObjects ? { nestedObjectKind: "named" as const } : {}),
				...options.sourceObjectOptions,
			};
			const subject = options.subjectFromMatch?.(match[0]);
			const body = call.body.trim();
			if (body.startsWith("{")) {
				const objectOpen = source.indexOf("{", open);
				const object = balanced(source, objectOpen);
				if (object !== undefined) {
					const program = styleProgramFromSourceObject(object.body, {
						...sourceOptions,
						sourceOffset: objectOpen + 1,
					});
					matches.push({
						start,
						end: call.end,
						program:
							subject === undefined
								? program
								: { ...program, source: { ...program.source, subject } },
						sourceText: source.slice(start, call.end),
					});
					continue;
				}
			}
			const arrow = body.indexOf("=>");
			const objectOpen = arrow === -1 ? -1 : body.indexOf("{", arrow);
			const object = objectOpen === -1 ? undefined : balanced(source, open + 1 + objectOpen);
			if (arrow === -1 || object === undefined) {
				residuals.push({
					kind: "dynamic",
					text: source.slice(start, call.end),
					hint: `${options.id} function-valued styles require a framework prop wrapper`,
				});
				continue;
			}
			const parameter = body
				.slice(0, arrow)
				.trim()
				.replace(/^\((.*)\)$/s, "$1")
				.trim();
			const program = markFunctionValues(
				styleProgramFromSourceObject(object.body, {
					...sourceOptions,
					sourceOffset: open + 1 + objectOpen + 1,
				}),
				parameter,
			);
			matches.push({
				start,
				end: call.end,
				program:
					subject === undefined ? program : { ...program, source: { ...program.source, subject } },
				sourceText: source.slice(start, call.end),
			});
		}
		return { matches, residuals };
	}
}
