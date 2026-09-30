import {
	SemanticConditionKindTag,
	StyleRuleKindTag,
	StyleDynamicLoweringTag,
	StyleProgramResidualKindTag,
	StyleValueKindTag,
	inferSemanticConditionKind,
	styleProgramFromRules,
	styleProgramFromSourceObject,
	type StyleDeclaration,
	type StyleProgram,
	type StyleProgramResidual,
	type StyleProgramSource,
} from "./semantic-ir.ts";
import { SourcePass } from "../source-pass-utils.ts";
import { SourceBindingKind, type SourceBinding, type SourceCallSite } from "pandwind/source";
import type { AdapterMatch, AdapterParseContext, AdapterParseResult } from "./adapter-contract.ts";
import {
	findTemplateLiteralEnd,
	camelPropertyName as camelProperty,
	templateValueExpression as templateDynamicExpression,
} from "./adapter-template-parser.ts";
import { JsxStyleHost, type JsxStylePropSelector } from "./jsx-style-host.ts";
import { CodemodCallPatternFormTag, CodemodCallPatternKindTag } from "./identifiers.ts";
import { styledSubjectFromFunctionMatch } from "./host-component-rewriter.ts";
import { FunctionStyleCallParser } from "./function-style-parser.ts";
import type {
	AdapterSourceObjectOptions,
	AdapterSourceObjectOptionsProvider,
	CallPattern,
} from "./external-adapters.ts";

function resolveStyleProps(
	pattern: CallPattern,
	context: AdapterParseContext,
): JsxStylePropSelector {
	const styleProps = pattern.styleProps;
	return typeof styleProps === "function" ? styleProps(context) : (styleProps ?? []);
}

function excludeStyleProps(
	styleProps: JsxStylePropSelector,
	excluded: ReadonlySet<string>,
): JsxStylePropSelector {
	if (excluded.size === 0) return styleProps;
	if (typeof styleProps === "function")
		return (name, openingTag) => !excluded.has(name) && styleProps(name, openingTag);
	return styleProps.filter((name) => !excluded.has(name));
}

function sourceName(source: string, start: number, fallback: string): string {
	const prefix = source.slice(Math.max(0, start - 160), start);
	return prefix.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*$/)?.[1] ?? fallback;
}

function adapterSource(
	context: AdapterParseContext,
	start: number,
	extra: Partial<StyleProgramSource> = {},
): StyleProgramSource {
	return {
		file: context.file,
		start,
		adapter: context.config.adapter,
		...(context.document?.framework ? { framework: context.document.framework } : {}),
		...extra,
	};
}

function styledSubject(source: string, start: number): Partial<StyleProgramSource> {
	const subject = styledSubjectFromFunctionMatch(source.slice(start));
	if (subject === undefined) return {};
	const base = /^styled(?:\.|\s*\.)/.test(subject) ? "member" : "call";
	return { subject, subjectKind: base };
}

function parseKeyframeProgram(
	body: string,
	context: AdapterParseContext,
	start: number,
	name: string,
	sourceObjectOptions: AdapterSourceObjectOptions = {},
): StyleProgram {
	const base = styleProgramFromSourceObject(body, {
		...sourceObjectOptions,
		nestedObjectKind: "selector",
		source: adapterSource(context, start),
		conditionKinds: { from: "selector", to: "selector" },
		sourceOffset: start + 1,
	});
	const groups = new Map<string, StyleDeclaration[]>();
	for (const declaration of base.declarations) {
		const selector = declaration.conditions[0]?.name ?? "from";
		const list = groups.get(selector) ?? [];
		list.push({ ...declaration, conditions: [] });
		groups.set(selector, list);
	}
	return styleProgramFromRules(
		[
			{
				kind: CodemodCallPatternKindTag.Keyframes,
				name,
				conditions: [],
				declarations: [],
				children: [...groups].map(([selector, declarations], order) => ({
					kind: CodemodCallPatternKindTag.Style,
					selector,
					conditions: [],
					declarations,
					children: [],
					order,
				})),
				order: 0,
			},
		],
		{
			source: adapterSource(context, start),
			residuals: base.residuals,
			emissionHints: sourceObjectOptions.emissionHints,
		},
	);
}

function parseGlobalProgram(
	body: string,
	context: AdapterParseContext,
	start: number,
	selector?: string,
): StyleProgram {
	const base = styleProgramFromSourceObject(body, {
		source: adapterSource(context, start),
		nestedObjectKind: "selector",
		sourceOffset: start + 1,
	});
	if (selector !== undefined)
		return styleProgramFromRules(
			[
				{
					kind: CodemodCallPatternKindTag.Global,
					selector,
					conditions: [],
					declarations: base.declarations,
					children: [],
					order: 0,
				},
			],
			{ source: adapterSource(context, start), residuals: base.residuals },
		);
	const groups = new Map<string, StyleDeclaration[]>();
	for (const declaration of base.declarations) {
		const selector = declaration.conditions[0]?.name ?? "*";
		const list = groups.get(selector) ?? [];
		list.push({ ...declaration, conditions: declaration.conditions.slice(1) });
		groups.set(selector, list);
	}
	return styleProgramFromRules(
		[...groups].map(([selector, declarations], order) => ({
			kind: CodemodCallPatternKindTag.Global,
			selector,
			conditions: [],
			declarations,
			children: [],
			order,
		})),
		{
			source: adapterSource(context, start),
			residuals: base.residuals,
		},
	);
}

/**
 * Documented CSS functional notation permitted inside declaration values
 * (fixed language contract of CSS syntax). A value that starts with a JS
 * identifier call outside this set is source code, not CSS: stringifying it
 * into a literal declaration would emit invented CSS, so the declaration
 * must fail closed as a capability residual instead.
 */
const CssFunctionalNotationNames: ReadonlySet<string> = new Set([
	"rgb",
	"rgba",
	"hsl",
	"hsla",
	"hwb",
	"lab",
	"lch",
	"oklab",
	"oklch",
	"color",
	"color-mix",
	"device-cmyk",
	"var",
	"env",
	"calc",
	"min",
	"max",
	"clamp",
	"round",
	"mod",
	"rem",
	"attr",
	"url",
	"counter",
	"counters",
	"linear-gradient",
	"radial-gradient",
	"conic-gradient",
	"repeating-linear-gradient",
	"repeating-radial-gradient",
	"repeating-conic-gradient",
	"image-set",
	"cross-fade",
	"element",
	"paint",
	"cubic-bezier",
	"steps",
	"blur",
	"brightness",
	"contrast",
	"drop-shadow",
	"grayscale",
	"hue-rotate",
	"invert",
	"opacity",
	"saturate",
	"sepia",
	"matrix",
	"matrix3d",
	"perspective",
	"rotate",
	"rotate3d",
	"rotateX",
	"rotateY",
	"rotateZ",
	"scale",
	"scale3d",
	"scaleX",
	"scaleY",
	"scaleZ",
	"skew",
	"skewX",
	"skewY",
	"translate",
	"translate3d",
	"translateX",
	"translateY",
	"translateZ",
	"fit-content",
	"minmax",
	"repeat",
	"path",
	"rect",
	"xywh",
	"inset",
	"polygon",
	"circle",
	"ellipse",
	"ray",
	"toggle",
	"symbols",
]);

/** True when a raw template value is a JS call expression, not CSS notation. */
function isUnboundedJsCallValue(rawValue: string): boolean {
	const match = /^[A-Za-z_$][\w$]*\s*\(/.exec(rawValue.trim());
	if (match === null) return false;
	return !CssFunctionalNotationNames.has(match[0].replace(/\s*\($/, ""));
}
function parseTemplateProgram(
	body: string,
	context: AdapterParseContext,
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
		const addTemplateDeclaration = (statement: string): void => {
			const trimmed = statement.replace(/\/\*.*?\*\//gs, "").trim();
			if (trimmed === "") return;
			const colon = trimmed.indexOf(":");
			if (colon <= 0) {
				residuals.push({
					kind: StyleProgramResidualKindTag.Parse,
					text: statement,
					hint: "nested template CSS requires a rule parser",
				});
				return;
			}
			const rawValue = trimmed.slice(colon + 1).trim();
			if (isUnboundedJsCallValue(rawValue)) {
				residuals.push({
					kind: StyleProgramResidualKindTag.Capability,
					text: statement,
					hint: "call-expression values require a runtime value carrier, not a static literal",
				});
				return;
			}
			const hasInterpolation = rawValue.includes("${");
			let value: StyleDeclaration["value"];
			if (hasInterpolation) {
				const expression = templateDynamicExpression(rawValue);
				value = {
					kind: StyleValueKindTag.Dynamic,
					expression,
					lowering: StyleDynamicLoweringTag.Residual,
				};
				residuals.push({
					kind: StyleProgramResidualKindTag.Dynamic,
					text: rawValue,
					hint: rawValue.includes("=>")
						? "function interpolation requires a framework prop wrapper"
						: "template interpolation requires a runtime-aware lowering",
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
					if (character === quote && input[index - 1] !== "\\\\") quote = undefined;
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
						hint: "component selector interpolation requires a host rewrite",
					});
				const nested = parseBlock(block.body);
				const conditionKind = inferSemanticConditionKind(selector);
				const conditionValue = selector.replace(/^@(media|container|supports)\s+/, "");
				const atRuleCondition =
					conditionKind === SemanticConditionKindTag.Media ||
					conditionKind === SemanticConditionKindTag.Container ||
					conditionKind === SemanticConditionKindTag.Supports
						? { kind: conditionKind, name: selector, value: conditionValue }
						: undefined;
				children.push({
					kind: CodemodCallPatternKindTag.Style,
					...(atRuleCondition === undefined
						? {
								selector: selector.startsWith("&")
									? selector
									: selector.startsWith(":") || selector.startsWith("[")
										? `&${selector}`
										: `& ${selector}`,
							}
						: { conditions: [atRuleCondition] }),
					conditions: atRuleCondition === undefined ? [] : [atRuleCondition],
					declarations: nested.declarations,
					children: nested.children,
					order: order++,
				});
				residuals.push(...nested.residuals);
				cursor = block.end;
				continue;
			}
			if (delimiter === ";") {
				addTemplateDeclaration(input.slice(cursor, index));
				cursor = index + 1;
				continue;
			}
			addTemplateDeclaration(input.slice(cursor));
			break;
		}
		return { declarations, children, residuals };
	};
	const parsed = parseBlock(body);
	return styleProgramFromRules(
		[
			{
				kind: CodemodCallPatternKindTag.Style,
				conditions: [],
				declarations: parsed.declarations,
				children: parsed.children,
				order: 0,
			},
		],
		{
			source: adapterSource(context, start),
			residuals: parsed.residuals,
		},
	);
}

function parseGlobalTemplateProgram(
	body: string,
	context: AdapterParseContext,
	start: number,
): StyleProgram {
	const base = parseTemplateProgram(body, context, start);
	const globalize = (rule: StyleProgram["rules"][number]): StyleProgram["rules"][number] => {
		const globalRule =
			rule.kind === StyleRuleKindTag.Style
				? {
						...rule,
						kind: StyleRuleKindTag.Global,
						...(rule.selector === undefined
							? {}
							: { selector: rule.selector.replace(/^&\s*/u, "") }),
					}
				: rule;
		return { ...globalRule, children: rule.children.map(globalize) };
	};
	const root = base.rules[0];
	const rules = [
		...(root === undefined || root.declarations.length === 0
			? []
			: [
					{
						kind: StyleRuleKindTag.Global,
						selector: "*",
						conditions: [],
						declarations: root.declarations,
						children: [],
						order: 0,
					},
				]),
		...(root?.children.map(globalize) ?? []),
	];
	return styleProgramFromRules(rules, {
		source: base.source,
		residuals: base.residuals,
	});
}

function parseKeyframeTemplateProgram(
	body: string,
	context: AdapterParseContext,
	start: number,
	name: string,
): StyleProgram {
	const base = parseTemplateProgram(body, context, start);
	const root = base.rules[0];
	return styleProgramFromRules(
		[
			{
				kind: CodemodCallPatternKindTag.Keyframes,
				name,
				conditions: [],
				declarations: [],
				children: (root?.children ?? []).map((child) => ({
					...child,
					selector: child.selector?.replace(/^&\s+/u, ""),
				})),
				order: 0,
			},
		],
		{ source: base.source, residuals: base.residuals },
	);
}

function parseCalls(
	source: string,
	context: AdapterParseContext,
	patterns: readonly CallPattern[],
	sourceObjectOptions: AdapterSourceObjectOptionsProvider | undefined = {},
): AdapterParseResult {
	const matches: AdapterMatch[] = [];
	const residuals: StyleProgramResidual[] = [];
	const resolvedObjectOptions =
		typeof sourceObjectOptions === "function"
			? sourceObjectOptions(context.source, context)
			: sourceObjectOptions;
	interface RegexCandidate {
		readonly regex: RegExp;
		readonly binding?: SourceBinding;
		readonly callSite?: SourceCallSite;
	}
	const regexesFor = (pattern: CallPattern): readonly RegexCandidate[] => {
		if (pattern.semanticBindings === undefined || context.bindings === undefined)
			return [{ regex: pattern.regex }];
		const sites = context.bindings.callSites.filter((site) => {
			const binding = site.binding;
			if (binding === undefined) return false;
			const resolved = context.resolveBinding?.(binding.localName) ?? binding;
			return pattern.semanticBindings?.some(
				(candidate) =>
					(candidate.source === resolved.source ||
						pattern.semanticBindingSourceMatcher?.(resolved.source, candidate.source) === true ||
						context.sourceModuleSemanticMatchers?.some((matcher) =>
							matcher(resolved.source, candidate.source),
						)) &&
					(candidate.imported === resolved.importedName ||
						(binding.kind === SourceBindingKind.Namespace && site.property === candidate.imported)),
			);
		});
		const astCandidates = sites.flatMap((callSite) => {
			const binding = context.resolveBinding?.(callSite.binding!.localName) ?? callSite.binding;
			if (binding === undefined) return [];
			const regex = pattern.regexForBinding?.(binding) ?? pattern.regex;
			regex.lastIndex = 0;
			const localSource = context.source.slice(callSite.start, callSite.end);
			if (regex.test(localSource) === false) return [];
			return [{ regex, binding, callSite }];
		});
		if (astCandidates.length > 0) return astCandidates;

		// Embedded documents (for example a Vue script block passed through a
		// generic reverse route) can be intentionally unparsable as the selected
		// file language. Recover only explicit named or namespace imports here;
		// an unbound identifier must never become an adapter match.
		const sourceText = context.source;
		return pattern.semanticBindings.flatMap(({ source: moduleSource, imported }) => {
			const namedImport = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*["']([^"']+)["']`, "g");
			const namespaceImport = new RegExp(
				`import\\s*\\*\\s*as\\s+([A-Za-z_$][\\w$]*)\\s*from\\s*["']([^"']+)["']`,
				"g",
			);
			const fallback: RegexCandidate[] = [];
			for (const match of sourceText.matchAll(namedImport)) {
				const actualSource = match[2];
				if (
					actualSource === undefined ||
					(actualSource !== moduleSource &&
						pattern.semanticBindingSourceMatcher?.(actualSource, moduleSource) !== true &&
						context.sourceModuleSemanticMatchers?.every(
							(matcher) => matcher(actualSource, moduleSource) !== true,
						))
				)
					continue;
				const clause = match[1] ?? "";
				for (const specifier of clause.split(",")) {
					const parts = specifier.trim().split(/\s+as\s+/u);
					if (parts[0] !== imported) continue;
					const localName = parts[1] ?? parts[0];
					if (localName === undefined) continue;
					const binding: SourceBinding = {
						localName,
						importedName: imported,
						source: actualSource,
						kind: SourceBindingKind.Named,
						range: { start: match.index ?? 0, end: (match.index ?? 0) + match[0].length },
					};
					fallback.push({ regex: pattern.regexForBinding?.(binding) ?? pattern.regex, binding });
				}
			}
			if (imported !== "default")
				for (const match of sourceText.matchAll(namespaceImport)) {
					const actualSource = match[2];
					if (
						actualSource === undefined ||
						(actualSource !== moduleSource &&
							pattern.semanticBindingSourceMatcher?.(actualSource, moduleSource) !== true &&
							context.sourceModuleSemanticMatchers?.every(
								(matcher) => matcher(actualSource, moduleSource) !== true,
							))
					)
						continue;
					const localName = match[1];
					if (localName === undefined) continue;
					const binding: SourceBinding = {
						localName,
						importedName: imported,
						source: actualSource,
						kind: SourceBindingKind.Namespace,
						range: { start: match.index ?? 0, end: (match.index ?? 0) + match[0].length },
					};
					fallback.push({ regex: pattern.regexForBinding?.(binding) ?? pattern.regex, binding });
				}
			return fallback;
		});
	};
	const matchesFor = (
		candidate: RegexCandidate,
	): readonly { candidate: RegexCandidate; match: RegExpMatchArray }[] => {
		if (candidate.callSite === undefined)
			return [...source.matchAll(candidate.regex)].map((match) => ({ candidate, match }));
		const sourceText = source.slice(candidate.callSite.start, candidate.callSite.end);
		candidate.regex.lastIndex = 0;
		const localMatch = candidate.regex.exec(sourceText);
		if (localMatch === null) return [];
		const match = [sourceText, ...localMatch.slice(1)] as RegExpMatchArray;
		match.index = candidate.callSite.start;
		match.input = source;
		return [{ candidate, match }];
	};
	let mask: ReturnType<typeof SourcePass.computeExcludedRanges> | undefined;
	try {
		mask = SourcePass.computeExcludedRanges(source, context.file);
	} catch {
		// Source parsers are allowed to operate on snippets that are not complete
		// modules; the adapter remains conservative through its balanced matcher.
	}
	const hostRanges = patterns.flatMap((pattern) => {
		if (
			pattern.form !== CodemodCallPatternFormTag.JsxStyle &&
			pattern.form !== CodemodCallPatternFormTag.JsxGlobal
		)
			return [];
		if (pattern.sourceGuard !== undefined && !pattern.sourceGuard(source, context)) return [];
		return regexesFor(pattern)
			.flatMap(matchesFor)
			.flatMap((match) => {
				const start = match.match.index ?? 0;
				if (
					match.candidate.binding !== undefined &&
					context.bindings?.isShadowedAt(match.candidate.binding.localName, start)
				)
					return [];
				if (mask?.isExcluded(start)) return [];
				const tag = JsxStyleHost.parse(
					source,
					start,
					context,
					resolveStyleProps(pattern, context),
					adapterSource(context, start),
					pattern.matchWithoutStyleProps,
				);
				return tag === undefined || pattern.hostGuard?.(tag, context) === false
					? []
					: [{ start, end: tag.end }];
			});
	});
	const isInsideHostRange = (start: number): boolean =>
		hostRanges.some((range) => start >= range.start && start < range.end);
	for (const pattern of patterns) {
		if (pattern.sourceGuard !== undefined && !pattern.sourceGuard(source, context)) continue;
		const patternObjectOptions =
			typeof pattern.sourceObjectOptions === "function"
				? pattern.sourceObjectOptions(context.source, context)
				: (pattern.sourceObjectOptions ?? {});
		if (pattern.functionCall !== undefined) {
			const parsed = FunctionStyleCallParser.parse(source, context, {
				id: context.config.adapter,
				pattern: pattern.name,
				...pattern.functionCall,
				sourceObjectOptions: {
					...resolvedObjectOptions,
					...patternObjectOptions,
					...(pattern.objectKind === undefined
						? undefined
						: { nestedObjectKind: pattern.objectKind }),
					...pattern.functionCall.sourceObjectOptions,
				},
			});
			matches.push(...parsed.matches);
			residuals.push(...parsed.residuals);
			continue;
		}
		for (const candidate of regexesFor(pattern))
			for (const { candidate: matchedCandidate, match } of matchesFor(candidate)) {
				const start = match.index ?? 0;
				if (
					candidate.binding !== undefined &&
					context.bindings?.isShadowedAt(candidate.binding.localName, start)
				)
					continue;
				if (mask?.isExcluded(start)) continue;
				if (
					pattern.form === CodemodCallPatternFormTag.JsxStyle ||
					pattern.form === CodemodCallPatternFormTag.JsxGlobal
				) {
					const initialTag = JsxStyleHost.parse(
						source,
						start,
						context,
						resolveStyleProps(pattern, context),
						adapterSource(context, start),
						pattern.matchWithoutStyleProps,
					);
					if (initialTag !== undefined && pattern.hostGuard?.(initialTag, context) !== false) {
						if (
							pattern.form === CodemodCallPatternFormTag.JsxGlobal &&
							initialTag.styleAttributes.some(
								(attribute) =>
									!attribute.expression ||
									typeof attribute.value !== "string" ||
									!attribute.value.trim().startsWith("{"),
							)
						)
							continue;
						const preserved = new Set(pattern.preserveHostStyleProps?.(initialTag) ?? []);
						const tag =
							preserved.size === 0
								? initialTag
								: JsxStyleHost.parse(
										source,
										start,
										context,
										excludeStyleProps(resolveStyleProps(pattern, context), preserved),
										adapterSource(context, start),
										pattern.matchWithoutStyleProps,
									);
						if (tag === undefined) continue;
						const program =
							tag.template === undefined
								? pattern.form === CodemodCallPatternFormTag.JsxGlobal
									? parseGlobalProgram(tag.body, context, start)
									: styleProgramFromSourceObject(tag.body, {
											...resolvedObjectOptions,
											...patternObjectOptions,
											source: tag.source,
											sourceOffset: start,
										})
								: parseTemplateProgram(tag.template, context, start);
						const hostProgram = {
							...program,
							source: {
								...program.source,
								...tag.source,
								...(tag.template === undefined ? {} : { template: tag.template }),
							},
						};
						matches.push({
							start,
							end: tag.end,
							program: pattern.transform?.(hostProgram, context) ?? hostProgram,
							sourceText: tag.openingTag,
						});
					}
					continue;
				}
				if (pattern.form === CodemodCallPatternFormTag.Residual) {
					const residual = pattern.residual;
					if (residual === undefined) continue;
					const sourceMap: StyleProgramSource = {
						file: context.file,
						start,
						end: start + match[0].length,
						adapter: context.config.adapter,
						...context.semantic?.source,
					};
					matches.push({
						start,
						end: start + match[0].length,
						sourceText: match[0],
						program: styleProgramFromRules([], {
							source: sourceMap,
							residuals: [
								{
									kind: residual.kind,
									text: match[0],
									hint: residual.hint,
								},
							],
						}),
					});
					continue;
				}
				if (pattern.form === CodemodCallPatternFormTag.Reference) {
					const reference = match[1];
					if (reference === undefined) continue;
					const escaped = reference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
					const binding = new RegExp(`\\b(?:const|let|var)\\s+${escaped}\\s*=\\s*\\{`, "g").exec(
						source,
					);
					if (binding === null) {
						residuals.push({
							kind: StyleProgramResidualKindTag.Parse,
							text: match[0],
							hint: `JSS style binding '${reference}' was not found`,
						});
						continue;
					}
					const open = binding.index + binding[0].lastIndexOf("{");
					const block = SourcePass.matchBlock(source, open);
					if (block === null) {
						residuals.push({
							kind: StyleProgramResidualKindTag.Parse,
							text: match[0],
							hint: `JSS style binding '${reference}' is unbalanced`,
						});
						continue;
					}
					const program = styleProgramFromSourceObject(block.body, {
						...resolvedObjectOptions,
						...patternObjectOptions,
						...(pattern.objectKind === undefined ? {} : { nestedObjectKind: pattern.objectKind }),
						source: {
							file: context.file,
							start,
							end: start + match[0].length,
							adapter: context.config.adapter,
						},
						sourceOffset: open + 1,
					});
					matches.push({
						start,
						end: start + match[0].length,
						program,
						sourceText: match[0],
					});
					continue;
				}
				if (pattern.form === CodemodCallPatternFormTag.Template) {
					const firstTick = source.indexOf("`", start);
					const lastTick = findTemplateLiteralEnd(source, firstTick);
					if (firstTick === -1 || lastTick === undefined || lastTick <= firstTick) continue;
					// A JSX style host owns the complete tagged template. Do not parse the
					// nested `css\`...\`` again: doing so creates residuals for the same
					// source site and makes a valid host migration look incomplete.
					if (isInsideHostRange(start)) continue;
					if (source.slice(start, firstTick).includes("=>")) {
						residuals.push({
							kind: StyleProgramResidualKindTag.Capability,
							text: source.slice(start, lastTick + 1),
							hint: `${pattern.name} function-valued styles require a host-specific lowering`,
						});
						continue;
					}
					const templateBody = source.slice(firstTick + 1, lastTick);
					if (/\$\{[^`]*`/u.test(templateBody)) {
						residuals.push({
							kind: StyleProgramResidualKindTag.Dynamic,
							text: source.slice(start, lastTick + 1),
							hint: `${pattern.name} nested template interpolation requires a host-specific lowering`,
						});
						continue;
					}
					const template = source.slice(start, lastTick + 1);
					let program =
						pattern.kind === CodemodCallPatternKindTag.Keyframes
							? parseKeyframeTemplateProgram(
									templateBody,
									context,
									start,
									sourceName(source, start, `${pattern.name}${matches.length + 1}`),
								)
							: pattern.kind === CodemodCallPatternKindTag.Global
								? parseGlobalTemplateProgram(templateBody, context, start)
								: parseTemplateProgram(templateBody, context, start);
					program = {
						...program,
						source: {
							...program.source,
							...(pattern.kind === CodemodCallPatternKindTag.Styled
								? styledSubject(source, start)
								: {}),
							...(context.document?.framework ? { framework: context.document.framework } : {}),
							...context.semantic?.source,
						},
					};
					program = pattern.transform?.(program, context) ?? program;
					matches.push({ start, end: start + template.length, program, sourceText: template });
					continue;
				}
				matchedCandidate.regex.lastIndex = 0;
				const matchedPrefix = matchedCandidate.regex.exec(source.slice(start))?.[0] ?? match[0];
				matchedCandidate.regex.lastIndex = 0;
				const prefixObjectOffset = matchedPrefix.lastIndexOf("{");
				const open =
					prefixObjectOffset === -1 ? source.indexOf("{", start) : start + prefixObjectOffset;
				if (open === -1) continue;
				const block = SourcePass.matchBlock(source, open);
				if (block === null) {
					residuals.push({
						kind: StyleProgramResidualKindTag.Parse,
						text: source.slice(start),
						hint: "unbalanced style object",
					});
					continue;
				}
				const end = source[block.end] === ")" ? block.end + 1 : block.end;
				const suffixMatch = pattern.suffix?.exec(source.slice(end));
				const fullEnd = suffixMatch?.index === 0 ? end + suffixMatch[0].length : end;
				const fallbackName = `${pattern.name}Style${matches.length + 1}`;
				let program: StyleProgram;
				if (pattern.kind === CodemodCallPatternKindTag.Keyframes) {
					program = parseKeyframeProgram(
						block.body,
						context,
						start,
						sourceName(source, start, fallbackName),
						{ ...resolvedObjectOptions, ...patternObjectOptions },
					);
				} else if (pattern.kind === CodemodCallPatternKindTag.Global) {
					const selector = source.slice(start, open).match(/\(\s*(["'])([^"']+)\1\s*,\s*$/)?.[2];
					program = parseGlobalProgram(block.body, context, start, selector);
				} else {
					const base = styleProgramFromSourceObject(block.body, {
						source: {
							file: context.file,
							start,
							end: fullEnd,
							adapter: context.config.adapter,
							...(context.document?.framework ? { framework: context.document.framework } : {}),
							...(pattern.kind === CodemodCallPatternKindTag.Styled
								? styledSubject(source, start)
								: {}),
							...context.semantic?.source,
						},
						sourceOffset: open + 1,
						...(context.semantic?.themes ? { themes: context.semantic.themes } : {}),
						...(context.semantic?.compositions
							? { compositions: context.semantic.compositions }
							: {}),
						...(context.semantic?.runtime ? { runtime: context.semantic.runtime } : {}),
						...(context.semantic?.plugins ? { plugins: context.semantic.plugins } : {}),
						...resolvedObjectOptions,
						...patternObjectOptions,
						...(pattern.objectKind === undefined ? {} : { nestedObjectKind: pattern.objectKind }),
					});
					if (pattern.kind === CodemodCallPatternKindTag.FontFace) {
						program = styleProgramFromRules(
							[
								{
									kind: CodemodCallPatternKindTag.FontFace,
									conditions: [],
									declarations: base.declarations,
									children: [],
									order: 0,
								},
							],
							{ source: base.source, residuals: base.residuals },
						);
					} else {
						program = base;
					}
				}
				program = pattern.transform?.(program, context) ?? program;
				program = {
					...program,
					source: { ...program.source, pattern: pattern.name },
				};
				matches.push({ start, end: fullEnd, program, sourceText: source.slice(start, fullEnd) });
			}
	}
	matches.sort((a, b) => a.start - b.start);
	return { matches, residuals };
}

export const AdapterParser = { parse: parseCalls } as const;
