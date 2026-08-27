import type {
	AdapterDependencies,
	AdapterParseContext,
	AdapterParseResult,
	AdapterProjectConfig,
	AdapterMigrationHooks,
	StyleAdapter,
} from "../adapter-contract.ts";
import { ADAPTER_CAPABILITIES_SCHEMA, type AdapterCapabilities } from "../capabilities.ts";
import { ADAPTER_CONTRACT_SCHEMA } from "../adapter-contract.ts";
import {
	styleProgramFromSourceObject,
	styleProgramToCanonicalCss,
	type StyleProgram,
	type StyleProgramResidual,
	type StyleProgramOptions,
} from "../semantic-ir.ts";
import { findTemplateLiteralEnd, parseAdapterTemplate } from "../adapter-template-parser.ts";

export interface ExtraAdapterOptions {
	readonly id: string;
	readonly modules: readonly string[];
	readonly packages: AdapterDependencies;
	readonly detect: readonly RegExp[];
	readonly call: RegExp;
	readonly form?: "object" | "template";
	/** Optional function-valued style call syntax, e.g. styled.div(props => ({})). */
	readonly functionCall?: RegExp;
	readonly prefix: string;
	readonly suffix?: string;
	readonly namedObjects?: boolean;
	readonly sourceObjectOptions?: Pick<StyleProgramOptions, "nestedObjectKind" | "arrayRuleKinds">;
	readonly migration?: AdapterMigrationHooks;
}

const capabilities = (id: string): AdapterCapabilities => ({
	schema: ADAPTER_CAPABILITIES_SCHEMA,
	adapter: id,
	version: "1",
	capabilities: {
		declarations: "exact",
		"rule-level": "partial",
		"named-conditions": "exact",
		"pseudo-conditions": "exact",
		"selector-conditions": "exact",
		"media-conditions": "exact",
		"supports-conditions": "exact",
		"dynamic-values": "partial",
		components: "partial",
	},
});

const config = (id: string, context: { root?: string; file: string }): AdapterProjectConfig => ({
	adapter: id,
	root: context.root,
	files: [context.file],
	values: {},
});

const valueText = (value: StyleProgram["declarations"][number]["value"]): string => {
	if (value.kind === "dynamic") return value.expression;
	if (value.kind === "token") return JSON.stringify(value.authored);
	return JSON.stringify(value.value);
};

type ObjectNode = { values: Array<[string, string]>; children: Map<string, ObjectNode> };

const renderObjectNode = (node: ObjectNode): string => {
	const values = node.values.map(([key, value]) => `${JSON.stringify(key)}: ${value}`);
	const children = [...node.children].map(
		([key, child]) => `${JSON.stringify(key)}: ${renderObjectNode(child)}`,
	);
	return `{ ${[...values, ...children].join(", ")} }`;
};

const objectText = (program: StyleProgram): string => {
	const root: ObjectNode = { values: [], children: new Map() };
	const add = (
		node: ObjectNode,
		declaration: StyleProgram["declarations"][number],
		index: number,
	): void => {
		const condition = declaration.conditions[index];
		if (condition === undefined) {
			node.values.push([declaration.property, valueText(declaration.value)]);
			return;
		}
		const key = condition.raw ?? condition.value ?? condition.name;
		const child = node.children.get(key) ?? { values: [], children: new Map() };
		node.children.set(key, child);
		add(child, declaration, index + 1);
	};
	const declarations = program.rules[0]?.declarations ?? program.declarations;
	for (const declaration of declarations) add(root, declaration, 0);
	return renderObjectNode(root);
};

function balanced(source: string, open: number): { end: number; body: string } | undefined {
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

function balancedPair(
	source: string,
	open: number,
	openChar: string,
	closeChar: string,
): { end: number; body: string } | undefined {
	let depth = 0;
	for (let index = open; index < source.length; index++) {
		if (source[index] === openChar) depth++;
		if (source[index] === closeChar) {
			depth--;
			if (depth === 0) return { end: index + 1, body: source.slice(open + 1, index) };
		}
	}
	return undefined;
}

function markFunctionValues(program: StyleProgram, parameter: string): StyleProgram {
	const declaration = (item: StyleProgram["declarations"][number]) => ({
		...item,
		value:
			item.value.kind === "dynamic"
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

function parseFunctionCalls(
	id: string,
	source: string,
	context: AdapterParseContext,
	options: ExtraAdapterOptions,
): AdapterParseResult {
	const matches: Array<AdapterParseResult["matches"][number]> = [];
	const residuals: StyleProgramResidual[] = [];
	const mask = context.document?.isExcluded ?? (() => false);
	const functionCall = options.functionCall;
	if (functionCall === undefined) return { matches, residuals };
	for (const match of source.matchAll(functionCall)) {
		const start = match.index ?? 0;
		if (mask(start)) continue;
		const open = start + match[0].lastIndexOf("(");
		const call = balancedPair(source, open, "(", ")");
		if (call === undefined) {
			residuals.push({
				kind: "parse",
				text: source.slice(start),
				hint: `${id} function style is unbalanced`,
			});
			continue;
		}
		const arrow = call.body.indexOf("=>");
		const objectOpen = arrow === -1 ? -1 : call.body.indexOf("{", arrow);
		const object = objectOpen === -1 ? undefined : balanced(source, open + 1 + objectOpen);
		if (arrow === -1 || object === undefined) {
			residuals.push({
				kind: "dynamic",
				text: source.slice(start, call.end),
				hint: `${id} function-valued styles require a framework prop wrapper`,
			});
			continue;
		}
		const parameter = call.body.slice(0, arrow).trim();
		const program = markFunctionValues(
			styleProgramFromSourceObject(object.body, {
				source: {
					file: context.file,
					start,
					end: call.end,
					adapter: id,
					...(context.semantic?.source?.framework
						? { framework: context.semantic.source.framework }
						: {}),
				},
				sourceOffset: open + 1 + objectOpen + 1,
			}),
			parameter,
		);
		const subject = match[0]
			.match(/^styled(?:\.[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))/)?.[0]
			?.replace(/\s+/g, " ")
			.replace(/\.\s+/g, ".");
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

function parseObjectCalls(
	id: string,
	source: string,
	context: AdapterParseContext,
	options: ExtraAdapterOptions,
): AdapterParseResult {
	const mask = context.document?.isExcluded ?? (() => false);
	const matches: Array<AdapterParseResult["matches"][number]> = [];
	const residuals: StyleProgramResidual[] = [];
	for (const match of source.matchAll(options.call)) {
		const start = match.index ?? 0;
		if (mask(start)) continue;
		const open = source.indexOf("{", start);
		const block = balanced(source, open);
		if (block === undefined) {
			residuals.push({
				kind: "parse",
				text: source.slice(start),
				hint: `${id} object is unbalanced`,
			});
			continue;
		}
		const program = styleProgramFromSourceObject(block.body, {
			source: { file: context.file, start, end: block.end, adapter: id },
			sourceOffset: open + 1,
			...(options.namedObjects ? { nestedObjectKind: "named" as const } : {}),
			...options.sourceObjectOptions,
		});
		let end = block.end;
		while (source[end] === ")") end++;
		matches.push({ start, end, program, sourceText: source.slice(start, end) });
	}
	return { matches, residuals };
}

function parseTemplateCalls(
	id: string,
	source: string,
	context: AdapterParseContext,
	options: ExtraAdapterOptions,
): AdapterParseResult {
	const mask = context.document?.isExcluded ?? (() => false);
	const matches: Array<AdapterParseResult["matches"][number]> = [];
	const residuals: StyleProgramResidual[] = [];
	for (const match of source.matchAll(options.call)) {
		const start = match.index ?? 0;
		if (mask(start)) continue;
		const firstTick = source.indexOf("`", start);
		const lastTick = findTemplateLiteralEnd(source, firstTick);
		if (firstTick === -1 || lastTick === undefined || lastTick <= firstTick) continue;
		if (source.slice(start, firstTick).includes("=>")) {
			if (options.functionCall !== undefined) continue;
			residuals.push({
				kind: "capability",
				text: source.slice(start, lastTick + 1),
				hint: `${id} function-valued styles require a host-specific lowering`,
			});
			continue;
		}
		const template = source.slice(start, lastTick + 1);
		let program = parseAdapterTemplate(source.slice(firstTick + 1, lastTick), context, id, start);
		const subject = source
			.slice(start, firstTick)
			.match(/^styled\s*(\.\s*[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))/)?.[1];
		if (subject !== undefined) {
			const normalized = `styled${subject.replace(/\s+/g, " ").replace(/\.\s+/g, ".")}`;
			program = {
				...program,
				source: {
					...program.source,
					subject: normalized,
					subjectKind: subject.trim().startsWith(".") ? "member" : "call",
					...(context.semantic?.source?.framework
						? { framework: context.semantic.source.framework }
						: {}),
				},
			};
		}
		matches.push({ start, end: start + template.length, program, sourceText: template });
	}
	return { matches, residuals };
}

export function makeExtraAdapter(options: ExtraAdapterOptions): StyleAdapter {
	return {
		schema: ADAPTER_CONTRACT_SCHEMA,
		id: options.id,
		version: "2",
		sourceModules: options.modules,
		capabilities: capabilities(options.id),
		dependencies: options.packages,
		migration: options.migration,
		detect: (context) => {
			const evidence = options.detect.flatMap((pattern) => {
				pattern.lastIndex = 0;
				const matched = pattern.test(context.source);
				pattern.lastIndex = 0;
				return matched ? [pattern.source] : [];
			});
			return { matched: evidence.length > 0, confidence: evidence.length ? 0.8 : 0, evidence };
		},
		loadConfig: (context) => config(options.id, context),
		parse: (source, context) => {
			const parsed =
				options.form === "template"
					? parseTemplateCalls(options.id, source, context, options)
					: parseObjectCalls(options.id, source, context, options);
			const functionParsed = parseFunctionCalls(options.id, source, context, options);
			return {
				matches: [...parsed.matches, ...functionParsed.matches].toSorted(
					(a, b) => a.start - b.start,
				),
				residuals: [...parsed.residuals, ...functionParsed.residuals],
			};
		},
		emit: (program) => ({
			text: `${options.prefix}${objectText(program)}${options.suffix ?? ""}`,
			residuals: [...program.residuals],
			dependencies: options.packages,
		}),
		validate: (source, target, residuals = []) => {
			const canonicalSource = styleProgramToCanonicalCss(source);
			const canonicalTarget = styleProgramToCanonicalCss(target);
			const differences = canonicalSource === canonicalTarget ? [] : ["canonical CSS differs"];
			if (residuals.length > 0) differences.push(`${residuals.length} residual conversion(s)`);
			return {
				valid: differences.length === 0,
				lossiness:
					differences.length === 0
						? "lossless"
						: canonicalSource === canonicalTarget
							? "lossy"
							: "unsupported",
				canonicalSource,
				canonicalTarget,
				differences,
				residuals,
			};
		},
	};
}
