import {
	SemanticConditionKindTag,
	StyleRuleKindTag,
	StyleProgramResidualKindTag,
	StyleValueKindTag,
	styleProgramFromRules,
	styleProgramFromSourceObject,
	styleProgramToCanonicalCss,
	type StyleProgram,
	type StyleProgramOptions,
	type StyleProgramResidual,
} from "../semantic-ir.ts";
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
import { AdapterDependencyKindTag } from "../adapter-contract.ts";
import {
	ADAPTER_CAPABILITIES_SCHEMA,
	type AdapterCapability,
	type AdapterCapabilities,
	type AdapterCapabilityLevel,
} from "../capabilities.ts";
import { ADAPTER_CONTRACT_SCHEMA } from "../adapter-contract.ts";
import {
	AdapterOfficialApiStatusTag,
	CodemodCallPatternFormTag,
	StyleRepresentationKind,
} from "../identifiers.ts";
import type { StyleLowering } from "../lowering.ts";
import { findTemplateLiteralEnd, parseAdapterTemplate } from "../adapter-template-parser.ts";
import { JsxStyleHost, type JsxStyleHostMatch } from "../jsx-style-host.ts";
import { StyleNamedRuleStrategy } from "../identifiers.ts";
import { FunctionStyleCallParser } from "../function-style-parser.ts";
import {
	projectDynamicClassMigration,
	projectPortableDynamicMigration,
	projectStaticSubjectMigration,
} from "../adapter-projections.ts";
import { PortableStyleArtifact } from "../portable-artifact.ts";
import { AdapterEvidence } from "../adapter-evidence.ts";
import { AdapterRenderersImplementation } from "../adapter-renderers.ts";
import { styledSubjectFromFunctionMatch } from "../host-component-rewriter.ts";

export interface ExtraAdapterOptions {
	readonly id: string;
	readonly modules: readonly string[];
	readonly packages: AdapterDependencies;
	readonly detect: readonly RegExp[];
	readonly call: RegExp;
	readonly form?: `${CodemodCallPatternFormTag}`;
	/** Multiple static carriers may share one public function, e.g. Goober's css. */
	readonly forms?: readonly `${CodemodCallPatternFormTag}`[];
	/** Optional JSX host carrier for adapters with inline style attributes. */
	readonly jsxStyle?: {
		readonly regex: RegExp;
		readonly props: readonly string[];
		readonly shouldParse?: (match: JsxStyleHostMatch) => boolean;
	};
	/** Optional JSX host carrier whose object is emitted as global rules. */
	readonly jsxGlobalStyle?: { readonly regex: RegExp; readonly props: readonly string[] };
	/** Optional function-valued style call syntax, e.g. styled.div(props => ({})). */
	readonly functionCall?: RegExp;
	readonly prefix: string;
	readonly suffix?: string;
	/** Target imports required when this adapter is used as an emitter. */
	readonly targetImports?: readonly string[];
	readonly namedObjects?: boolean;
	/** Public source forms that the adapter recognizes but cannot safely lower. */
	readonly residualPatterns?: readonly ExtraAdapterResidualPattern[];
	/**
	 * The adapter's template interpolations may pass function-valued props
	 * through: arrow interpolations become first-class function dynamics
	 * instead of parse residuals (targets consume them via function-values).
	 */
	readonly functionValues?: boolean;
	readonly sourceObjectOptions?: Pick<
		StyleProgramOptions,
		"nestedObjectKind" | "namedRuleObjects" | "arrayRuleKinds" | "emissionHints"
	>;
	readonly migration?: AdapterMigrationHooks;
	/** Adapter-owned semantic strategies composed by the route lowering registry. */
	readonly lowerings?: readonly StyleLowering[];
	/** Target-side host port for adapters whose style call returns a class string. */
	readonly targetPolicy?: AdapterTargetMigrationPolicy;
	/** Adapter-owned exceptions to the conservative generic capability baseline. */
	readonly capabilityOverrides?: Partial<Record<AdapterCapability, AdapterCapabilityLevel>>;
	/** Optional target-native emission for a host representation selected by the policy. */
	readonly targetEmit?: (
		program: StyleProgram,
		context: AdapterEmitContext | undefined,
		programObject: (program: StyleProgram) => string,
		templateCss: (program: StyleProgram) => string,
	) => AdapterEmitResult | undefined;
	/** How a target preserves named style maps when it has no native map API. */
	readonly namedRuleStrategy?: StyleNamedRuleStrategy;
	/** Documentation-driven public API surface. */
	readonly officialApi?: import("../adapter-evidence.ts").AdapterOfficialApiManifestOptions;
}

interface ExtraAdapterResidualPattern {
	readonly name: string;
	readonly regex: RegExp;
	readonly kind: StyleProgramResidual["kind"];
	readonly hint: string;
}

const capabilities = (
	id: string,
	namedRules: boolean,
	strategy: StyleNamedRuleStrategy | undefined,
	overrides: ExtraAdapterOptions["capabilityOverrides"],
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
		...overrides,
	},
});

const config = (id: string, context: { root?: string; file: string }): AdapterProjectConfig => ({
	adapter: id,
	root: context.root,
	files: [context.file],
	values: {},
});

const valueText = (value: StyleProgram["declarations"][number]["value"]): string => {
	if (value.kind === StyleValueKindTag.Dynamic) return value.expression;
	if (value.kind === StyleValueKindTag.Token) return JSON.stringify(value.authored);
	return JSON.stringify(value.value);
};

const objectConditionKey = (
	condition: StyleProgram["declarations"][number]["conditions"][number],
): string => {
	const value = condition.raw ?? condition.value ?? condition.name;
	const atRule =
		condition.kind === SemanticConditionKindTag.Media
			? "@media"
			: condition.kind === SemanticConditionKindTag.Supports
				? "@supports"
				: condition.kind === SemanticConditionKindTag.Container
					? "@container"
					: undefined;
	if (atRule === undefined || value === atRule || value.startsWith(`${atRule} `)) return value;
	return `${atRule} ${value}`;
};

type ObjectNode = { values: Array<[string, string]>; children: Map<string, ObjectNode> };

const renderObjectNode = (node: ObjectNode): string => {
	type Frame = {
		readonly node: ObjectNode;
		readonly edge?: string;
		readonly children: readonly [string, ObjectNode][];
		readonly parts: string[];
		index: number;
	};
	const frames: Frame[] = [
		{
			node,
			children: [...node.children],
			parts: node.values.map(([key, value]) => `${JSON.stringify(key)}: ${value}`),
			index: 0,
		},
	];
	let result = "";
	while (frames.length > 0) {
		const frame = frames.at(-1)!;
		const child = frame.children[frame.index++];
		if (child !== undefined) {
			frames.push({
				node: child[1],
				edge: child[0],
				children: [...child[1].children],
				parts: child[1].values.map(([key, value]) => `${JSON.stringify(key)}: ${value}`),
				index: 0,
			});
			continue;
		}
		frames.pop();
		const serialized = `{ ${frame.parts.join(", ")} }`;
		const parent = frames.at(-1);
		if (parent === undefined) result = serialized;
		else parent.parts.push(`${JSON.stringify(frame.edge)}: ${serialized}`);
	}
	return result;
};

const objectText = (program: StyleProgram): string => {
	const root: ObjectNode = { values: [], children: new Map() };
	const add = (
		node: ObjectNode,
		declaration: StyleProgram["declarations"][number],
		index: number,
	): void => {
		const work: Array<{ node: ObjectNode; index: number }> = [{ node, index }];
		while (work.length > 0) {
			const current = work.pop()!;
			const condition = declaration.conditions[current.index];
			if (condition === undefined) {
				current.node.values.push([declaration.property, valueText(declaration.value)]);
				continue;
			}
			const key = objectConditionKey(condition);
			const child = current.node.children.get(key) ?? { values: [], children: new Map() };
			current.node.children.set(key, child);
			work.push({ node: child, index: current.index + 1 });
		}
	};
	const addRule = (node: ObjectNode, rule: StyleProgram["rules"][number]): void => {
		const work: Array<{ node: ObjectNode; rule: StyleProgram["rules"][number] }> = [{ node, rule }];
		while (work.length > 0) {
			const current = work.pop()!;
			for (const declaration of current.rule.declarations)
				add(
					current.node,
					current.rule.conditions.length === 0
						? declaration
						: {
								...declaration,
								conditions: [...current.rule.conditions, ...declaration.conditions],
							},
					0,
				);
			for (const child of current.rule.children.toReversed()) {
				const key = child.name ?? child.selector ?? child.kind;
				const nested = current.node.children.get(key) ?? { values: [], children: new Map() };
				current.node.children.set(key, nested);
				work.push({ node: nested, rule: child });
			}
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
			subjectFromMatch: (value) => styledSubjectFromFunctionMatch(value),
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
		// The template-form variant of the shared call regex also lands here;
		// an object call owns an opening brace before the call head ends (;
		// backtick). Reaching across one would wrap a template literal into a
		// bogus empty object program.
		if (open === -1 || callHeadEnd(source, start, open, "`") !== undefined) continue;
		const block = balanced(source, open);
		if (block === undefined) {
			residuals.push({
				kind: StyleProgramResidualKindTag.Parse,
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

/** A call head is the callee text between the match start and the style
 * payload (object brace or template backtick). Shared call regexes match
 * both forms, so each parser must reject a match whose head ends first:
 * a `;`, the opposite form's opener, or an unbalanced `(` (a plain value
 * expression, not a style call). Strings, comments, and balanced segments
 * of parens or angle brackets (TS generics such as `styled("div")<{...}>`)
 * belong to the head and are skipped, not treated as terminators. */
function callHeadEnd(
	source: string,
	start: number,
	limit: number,
	opposite: "{" | "`",
): number | undefined {
	let parens = 0;
	let angles = 0;
	for (let index = start; index < limit && index < source.length; index++) {
		const character = source[index];
		if (character === '"' || character === "'" || character === "`") {
			const closing = source.indexOf(character, index + 1);
			if (closing === -1) return index;
			index = closing;
			continue;
		}
		if (character === "/" && source[index + 1] === "/") {
			const newline = source.indexOf("\n", index);
			if (newline === -1) return index;
			index = newline;
			continue;
		}
		if (character === "/" && source[index + 1] === "*") {
			const closing = source.indexOf("*/", index + 2);
			if (closing === -1) return index;
			index = closing + 1;
			continue;
		}
		if (character === "(") parens++;
		if (character === ")") {
			parens--;
			if (parens < 0) return index;
		}
		if (opposite === "{" && character === "<") angles++;
		if (opposite === "{" && character === ">" && angles > 0) angles--;
		if (character === ";" && angles === 0) return index;
		if (character === opposite && parens === 0 && angles === 0) return index;
	}
	return undefined;
}

function parseResidualPatterns(
	source: string,
	context: AdapterParseContext,
	patterns: readonly ExtraAdapterResidualPattern[] | undefined,
): AdapterParseResult {
	if (patterns === undefined || patterns.length === 0) return { matches: [], residuals: [] };
	const excluded = context.document?.isExcluded ?? (() => false);
	const matches: Array<AdapterParseResult["matches"][number]> = [];
	for (const pattern of patterns) {
		for (const match of source.matchAll(pattern.regex)) {
			const start = match.index ?? 0;
			if (excluded(start)) continue;
			const text = match[0];
			matches.push({
				start,
				end: start + text.length,
				sourceText: text,
				program: {
					...styleProgramFromSourceObject("", {
						source: {
							file: context.file,
							start,
							end: start + text.length,
							adapter: context.config.adapter,
						},
					}),
					residuals: [{ kind: pattern.kind, text, hint: pattern.hint }],
				},
			});
		}
	}
	return { matches, residuals: [] };
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
		// The object-form variant of the shared call regex also lands here; a
		// template call owns a backtick before the call head ends ({ or ;).
		// Reaching across one would swallow unrelated template literals later
		// in the document.
		if (firstTick === -1 || callHeadEnd(source, start, firstTick, "{") !== undefined) continue;
		const lastTick = findTemplateLiteralEnd(source, firstTick);
		if (lastTick === undefined || lastTick <= firstTick) continue;
		if (source.slice(start, firstTick).includes("=>")) {
			if (options.functionCall !== undefined) continue;
			residuals.push({
				kind: StyleProgramResidualKindTag.Capability,
				text: source.slice(start, lastTick + 1),
				hint: `${id} function-valued styles require a host-specific lowering`,
			});
			continue;
		}
		const template = source.slice(start, lastTick + 1);
		let program = parseAdapterTemplate(source.slice(firstTick + 1, lastTick), context, id, start, {
			functionValues: options.functionValues === true,
		});
		const normalized = styledSubjectFromFunctionMatch(`${source.slice(start, firstTick)}(`);
		if (normalized !== undefined) {
			program = {
				...program,
				source: {
					...program.source,
					subject: normalized,
					subjectKind: normalized.startsWith("styled.") ? "member" : "call",
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

function parseJsxStyles(
	id: string,
	source: string,
	context: AdapterParseContext,
	options: ExtraAdapterOptions,
): AdapterParseResult {
	const definition = options.jsxStyle;
	if (definition === undefined) return { matches: [], residuals: [] };
	const matches: Array<AdapterParseResult["matches"][number]> = [];
	const mask = context.document?.isExcluded ?? (() => false);
	definition.regex.lastIndex = 0;
	for (const match of source.matchAll(definition.regex)) {
		const start = match.index ?? 0;
		if (mask(start)) continue;
		const tag = JsxStyleHost.parse(source, start, context, definition.props, {
			file: context.file,
			start,
			end: start,
			adapter: id,
		});
		if (tag === undefined) continue;
		if (definition.shouldParse !== undefined && !definition.shouldParse(tag)) continue;
		const program = styleProgramFromSourceObject(tag.body, {
			source: tag.source,
			sourceOffset: start,
			...options.sourceObjectOptions,
		});
		matches.push({
			start,
			end: tag.end,
			program: { ...program, source: { ...program.source, ...tag.source } },
			sourceText: tag.openingTag,
		});
	}
	return { matches, residuals: [] };
}

function parseJsxGlobalStyles(
	id: string,
	source: string,
	context: AdapterParseContext,
	options: ExtraAdapterOptions,
): AdapterParseResult {
	const definition = options.jsxGlobalStyle;
	if (definition === undefined) return { matches: [], residuals: [] };
	const matches: Array<AdapterParseResult["matches"][number]> = [];
	const mask = context.document?.isExcluded ?? (() => false);
	definition.regex.lastIndex = 0;
	for (const match of source.matchAll(definition.regex)) {
		const start = match.index ?? 0;
		if (mask(start)) continue;
		const tag = JsxStyleHost.parse(source, start, context, definition.props, {
			file: context.file,
			start,
			end: start,
			adapter: id,
		});
		if (tag === undefined) continue;
		const program = styleProgramFromSourceObject(tag.body, {
			source: tag.source,
			sourceOffset: start,
			nestedObjectKind: "selector",
		});
		const globalProgram = styleProgramFromRules(
			program.rules.map((rule) => ({ ...rule, kind: StyleRuleKindTag.Global })),
			{ source: program.source, residuals: program.residuals },
		);
		matches.push({
			start,
			end: tag.end,
			program: globalProgram,
			sourceText: tag.openingTag,
		});
	}
	return { matches, residuals: [] };
}

/**
 * Class-valued targets can preserve a styled subject by lowering the
 * declaration to their normal class carrier and rewriting the host use to the
 * intrinsic subject. Keep this projection in the generic target factory so a
 * new class adapter gets the safe component path by implementing its normal
 * emitter, without adding another runner branch.
 */
export function makeExtraAdapter(options: ExtraAdapterOptions): StyleAdapter {
	const targetPolicy = options.targetPolicy ?? options.migration?.targetPolicy;
	const defaultOfficialApi = AdapterEvidence.manifest({
		apis: [
			{
				name: options.id,
				status: AdapterOfficialApiStatusTag.Supported,
				forms: [options.form ?? "style"],
			},
		],
		compilerIntegrations: options.modules,
	});
	return {
		schema: ADAPTER_CONTRACT_SCHEMA,
		id: options.id,
		version: "2",
		officialApi: AdapterEvidence.manifest({
			...defaultOfficialApi,
			...options.officialApi,
			apis: options.officialApi?.apis ?? defaultOfficialApi.apis,
		}),
		sourceModules: options.modules,
		capabilities: capabilities(
			options.id,
			options.namedObjects === true,
			options.namedRuleStrategy,
			{
				...options.capabilityOverrides,
				...(targetPolicy?.dynamicClassCarrier === true
					? { "custom-properties": "exact" as const }
					: {}),
			},
		),
		dependencies: options.packages,
		...(options.lowerings === undefined ? {} : { lowerings: options.lowerings }),
		migration: projectPortableDynamicMigration(
			projectDynamicClassMigration(
				options.id,
				projectStaticSubjectMigration(
					targetPolicy === undefined ? options.migration : { ...options.migration, targetPolicy },
				),
			),
			capabilities(
				options.id,
				options.namedObjects === true,
				options.namedRuleStrategy,
				options.capabilityOverrides,
			),
		),
		detect: (context) => {
			const evidence = options.detect.flatMap((pattern) => {
				pattern.lastIndex = 0;
				const matched = pattern.test(context.source);
				pattern.lastIndex = 0;
				return matched ? [pattern.source] : [];
			});
			return { matched: evidence.length > 0, confidence: evidence.length ? 0.8 : 0, evidence };
		},
		loadConfig: (context) => AdapterEvidence.normalizeConfig(config(options.id, context)),
		parse: (source, context) => {
			const forms = options.forms ?? [options.form ?? CodemodCallPatternFormTag.Object];
			const parsed = forms.reduce<AdapterParseResult>(
				(result, form) => {
					const parsedForm =
						form === CodemodCallPatternFormTag.Template
							? parseTemplateCalls(options.id, source, context, options)
							: parseObjectCalls(options.id, source, context, options);
					return {
						matches: [...result.matches, ...parsedForm.matches],
						residuals: [...result.residuals, ...parsedForm.residuals],
					};
				},
				{ matches: [], residuals: [] },
			);
			const functionParsed = parseFunctionCalls(options.id, source, context, options);
			const jsxParsed = parseJsxStyles(options.id, source, context, options);
			const jsxGlobalParsed = parseJsxGlobalStyles(options.id, source, context, options);
			const jsxRanges = [...jsxParsed.matches, ...jsxGlobalParsed.matches].map(
				({ start, end }) => ({
					start,
					end,
				}),
			);
			const parsedOutsideJsx = parsed.matches.filter(
				(match) => !jsxRanges.some((range) => match.start > range.start && match.start < range.end),
			);
			const residualParsed = parseResidualPatterns(source, context, options.residualPatterns);
			return {
				matches: [
					...parsedOutsideJsx,
					...functionParsed.matches,
					...jsxParsed.matches,
					...jsxGlobalParsed.matches,
					...residualParsed.matches,
				].toSorted((a, b) => a.start - b.start),
				residuals: [
					...parsed.residuals,
					...functionParsed.residuals,
					...jsxParsed.residuals,
					...jsxGlobalParsed.residuals,
					...residualParsed.residuals,
				],
			};
		},
		emit: (program, context) => {
			if (
				context?.host?.representationKind === StyleRepresentationKind.PortableArtifact &&
				!program.rules.some((rule) => rule.name !== undefined)
			) {
				const portableProgram = PortableStyleArtifact.restoreDynamicValues(
					program,
					context.loweringResiduals ?? [],
				);
				const emission = PortableStyleArtifact.emission(portableProgram, objectText);
				return {
					...emission,
					semantic: portableProgram,
					residuals: [],
					dependencies: {
						packages: [{ name: "pandwind", kind: AdapterDependencyKindTag.Runtime }],
					},
				};
			}
			const targetEmission = options.targetEmit?.(
				program,
				context,
				objectText,
				AdapterRenderersImplementation.templateCss,
			);
			if (targetEmission !== undefined) return targetEmission;
			const namedRules = program.rules.filter(
				(rule) => rule.name !== undefined && rule.kind === StyleRuleKindTag.Style,
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
