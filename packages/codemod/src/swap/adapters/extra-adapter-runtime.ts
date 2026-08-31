import type {
	AdapterDependencies,
	AdapterEmitContext,
	AdapterEmitResult,
	AdapterParseContext,
	AdapterParseResult,
	AdapterProjectConfig,
	AdapterMigrationHooks,
	AdapterTargetMigrationPolicy,
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
import { StyleNamedRuleStrategy } from "../identifiers.ts";
import { FunctionStyleCallParser } from "../function-style-parser.ts";

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
	/** Target imports required when this adapter is used as an emitter. */
	readonly targetImports?: readonly string[];
	readonly namedObjects?: boolean;
	readonly sourceObjectOptions?: Pick<
		StyleProgramOptions,
		"nestedObjectKind" | "namedRuleObjects" | "arrayRuleKinds" | "emissionHints"
	>;
	readonly migration?: AdapterMigrationHooks;
	/** Target-side host port for adapters whose style call returns a class string. */
	readonly targetPolicy?: AdapterTargetMigrationPolicy;
	/** Optional target-native emission for a host representation selected by the policy. */
	readonly targetEmit?: (
		program: StyleProgram,
		context: AdapterEmitContext | undefined,
		programObject: (program: StyleProgram) => string,
	) => AdapterEmitResult | undefined;
	/** How a target preserves named style maps when it has no native map API. */
	readonly namedRuleStrategy?: StyleNamedRuleStrategy;
}

const capabilities = (
	id: string,
	namedRules: boolean,
	strategy: StyleNamedRuleStrategy | undefined,
): AdapterCapabilities => ({
	schema: ADAPTER_CAPABILITIES_SCHEMA,
	adapter: id,
	version: "1",
	capabilities: {
		declarations: "exact",
		"rule-level": "partial",
		"named-conditions": "exact",
		...(namedRules ? { "named-rules": "exact" as const } : {}),
		...(strategy !== undefined && strategy !== StyleNamedRuleStrategy.Unsupported
			? { "named-rules": "exact" as const }
			: {}),
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
	const addRule = (node: ObjectNode, rule: StyleProgram["rules"][number]): void => {
		for (const declaration of rule.declarations) add(node, declaration, 0);
		for (const child of rule.children) {
			const key = child.name ?? child.selector ?? child.kind;
			const nested = node.children.get(key) ?? { values: [], children: new Map() };
			node.children.set(key, nested);
			addRule(nested, child);
		}
	};
	if (program.rules.some((rule) => rule.name !== undefined)) {
		for (const rule of program.rules) {
			if (rule.name === undefined) continue;
			const named = { values: [], children: new Map() };
			addRule(named, rule);
			root.children.set(rule.name, named);
		}
	} else {
		const declarations = program.rules[0]?.declarations ?? program.declarations;
		for (const declaration of declarations) add(root, declaration, 0);
	}
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

function parseFunctionCalls(
	id: string,
	source: string,
	context: AdapterParseContext,
	options: ExtraAdapterOptions,
): AdapterParseResult {
	const matches: Array<AdapterParseResult["matches"][number]> = [];
	const residuals: StyleProgramResidual[] = [];
	const functionCall = options.functionCall;
	if (functionCall === undefined) return { matches, residuals };
	for (const _match of source.matchAll(functionCall)) {
		const parsed = FunctionStyleCallParser.parse(source, context, {
			id,
			functionCall,
			namedObjects: options.namedObjects,
			sourceObjectOptions: options.sourceObjectOptions,
			subjectFromMatch: (value) =>
				value
					.match(/^styled(?:\.[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))/)?.[0]
					?.replace(/\s+/g, " ")
					.replace(/\.\s+/g, "."),
		});
		matches.push(...parsed.matches);
		residuals.push(...parsed.residuals);
		break;
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
		capabilities: capabilities(
			options.id,
			options.namedObjects === true,
			options.namedRuleStrategy,
		),
		dependencies: options.packages,
		migration:
			options.migration === undefined && options.targetPolicy === undefined
				? undefined
				: {
						...options.migration,
						targetPolicy: options.targetPolicy ?? options.migration?.targetPolicy,
					},
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
		emit: (program, context) => {
			const targetEmission = options.targetEmit?.(program, context, objectText);
			if (targetEmission !== undefined) return targetEmission;
			const namedRules = program.rules.filter(
				(rule) => rule.name !== undefined && rule.kind === "style",
			);
			if (namedRules.length > 0 && options.namedRuleStrategy === StyleNamedRuleStrategy.ClassMap) {
				const entries = namedRules.map((rule) => {
					const single = {
						...program,
						rules: [{ ...rule, name: undefined }],
						declarations: rule.declarations,
					};
					return `${JSON.stringify(rule.name)}: ${options.prefix}${objectText(single)}${options.suffix ?? ")"}`;
				});
				return {
					text: `{ ${entries.join(", ")} }`,
					...(options.targetImports === undefined ? {} : { imports: options.targetImports }),
					residuals: [...program.residuals],
					dependencies: options.packages,
				};
			}
			return {
				text: `${options.prefix}${objectText(program)}${options.suffix ?? ")"}`,
				...(options.targetImports === undefined ? {} : { imports: options.targetImports }),
				residuals: [...program.residuals],
				dependencies: options.packages,
			};
		},
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
