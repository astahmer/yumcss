import { StyleProgramResidualKindTag, StyleValueKindTag } from "./semantic-ir.ts";
import type {
	AdapterCapabilities,
	AdapterCapability,
	AdapterCapabilityMode,
} from "./capabilities.ts";
import { AdapterCapabilityLevelTag, AdapterCapabilityModeTag } from "./capabilities.ts";
import type {
	StyleDeclaration,
	StyleProgram,
	StyleProgramResidual,
	StyleRule,
} from "./semantic-ir.ts";
import {
	AdapterCapabilityTag,
	StyleDynamicExpressionKind,
	StyleLoweringId,
	StyleRepresentationKind,
} from "./identifiers.ts";
import { StyleProgramAnalysis } from "./style-program-analysis.ts";

export const STYLE_LOWERING_SCHEMA = "pandwind.style-lowering/1" as const;
export const STYLE_LOWERING_PLUGIN_SCHEMA = "pandwind.style-lowering-plugin/1" as const;

export interface StyleLoweringContext {
	readonly program: StyleProgram;
	readonly target: AdapterCapabilities;
	readonly mode: AdapterCapabilityMode;
	/** Target host adapter may consume framework semantics during rewriting. */
	readonly hostFramework?: boolean;
}

export interface StyleLoweringResult {
	readonly program: StyleProgram;
	readonly residuals: readonly StyleProgramResidual[];
	readonly applied: readonly string[];
	/** Residual kinds this strategy proved it replaced with a safe representation. */
	readonly resolvedResidualKinds?: readonly string[];
	/** Capability blockers this strategy replaced with a validated representation. */
	readonly resolvedCapabilities?: readonly AdapterCapability[];
}

export interface StyleLoweringPlan extends StyleLoweringResult {
	/** The representation selected after all registered lowerings ran. */
	readonly representation: StyleRepresentationKind;
	/** Representations the target contract can accept for this program family. */
	readonly availableRepresentations: readonly StyleRepresentationKind[];
}

export interface StyleLowering {
	readonly schema: typeof STYLE_LOWERING_SCHEMA;
	readonly id: string;
	apply(context: StyleLoweringContext): StyleLoweringResult;
}

export interface StyleLoweringPlugin {
	readonly schema: typeof STYLE_LOWERING_PLUGIN_SCHEMA;
	readonly id: string;
	readonly lowerings: readonly StyleLowering[];
}

export interface StyleLoweringRegistry {
	readonly plugins: readonly StyleLoweringPlugin[];
	readonly lowerings: readonly StyleLowering[];
	register(lowering: StyleLowering): StyleLoweringRegistry;
	registerPlugin(plugin: StyleLoweringPlugin): StyleLoweringRegistry;
	extend(lowerings: readonly StyleLowering[]): StyleLoweringRegistry;
	lower(context: StyleLoweringContext): StyleLoweringResult;
	plan(context: StyleLoweringContext): StyleLoweringPlan;
}

const level = (
	target: AdapterCapabilities,
	capability: keyof AdapterCapabilities["capabilities"],
) => target.capabilities[capability] ?? "unsupported";

const isFunctionDynamic = (value: StyleDeclaration["value"]): boolean =>
	value.kind === StyleValueKindTag.Dynamic &&
	(value.expressionKind === StyleDynamicExpressionKind.Function ||
		/=>|^function\b/.test(value.expression.trim()));

const allDeclarations = (program: StyleProgram): readonly StyleDeclaration[] =>
	StyleProgramAnalysis.declarations(program);

function replaceDeclarations(
	rule: StyleRule,
	transform: (declaration: StyleDeclaration) => StyleDeclaration,
): StyleRule {
	return {
		...rule,
		declarations: rule.declarations.map(transform),
		children: rule.children.map((child) => replaceDeclarations(child, transform)),
	};
}

const tokenFallback: StyleLowering = {
	schema: STYLE_LOWERING_SCHEMA,
	id: StyleLoweringId.TokenFallback,
	apply: ({ program, target, mode }) => {
		const tokenLevel = level(target, AdapterCapabilityTag.TokenValues);
		const mustInline =
			tokenLevel === AdapterCapabilityLevelTag.Unsupported ||
			(mode === AdapterCapabilityModeTag.Safe && tokenLevel === AdapterCapabilityLevelTag.Partial);
		if (!mustInline) return { program, residuals: [], applied: [] };
		const residuals: StyleProgramResidual[] = [];
		const resolved = new Set<AdapterCapability>();
		let changed = false;
		const transform = (declaration: StyleDeclaration): StyleDeclaration => {
			const value = declaration.value;
			if (value.kind !== StyleValueKindTag.Token) return declaration;
			if (value.resolved !== undefined) {
				changed = true;
				resolved.add(AdapterCapabilityTag.TokenValues);
				return {
					...declaration,
					value: { kind: StyleValueKindTag.Literal, value: value.resolved },
				};
			}
			residuals.push({
				kind: AdapterCapabilityTag.TokenValues,
				text: value.authored,
				hint: `token ${value.ref} has no verified resolved value for target ${target.adapter}`,
			});
			return declaration;
		};
		const rules = program.rules.map((rule) => replaceDeclarations(rule, transform));
		return {
			program: changed
				? { ...program, rules, declarations: program.declarations.map(transform) }
				: program,
			residuals,
			applied: changed ? [StyleLoweringId.TokenFallback] : [],
			...(resolved.size === 0 ? {} : { resolvedCapabilities: [...resolved] }),
		};
	},
};

function resolveThemeExpression(
	expression: string,
	program: StyleProgram,
): { value: string; path: string } | undefined {
	for (const binding of program.themes ?? []) {
		if (expression === binding.authored || expression === `theme.${binding.path}`) {
			if (binding.resolved !== undefined) return { value: binding.resolved, path: binding.path };
		}
	}
	return undefined;
}

function dynamicVariableName(expression: string): string {
	let hash = 2166136261;
	for (const character of expression) {
		hash ^= character.charCodeAt(0);
		hash = Math.imul(hash, 16777619);
	}
	return `--pandwind-dynamic-${(hash >>> 0).toString(36)}`;
}

const dynamicAndThemes: StyleLowering = {
	schema: STYLE_LOWERING_SCHEMA,
	id: StyleLoweringId.DynamicAndTheme,
	apply: ({ program, target, mode, hostFramework }) => {
		const residuals: StyleProgramResidual[] = [];
		let changed = false;
		const resolvedDynamicCapabilities = new Set<AdapterCapability>();
		const transform = (declaration: StyleDeclaration): StyleDeclaration => {
			const value = declaration.value;
			if (value.kind !== StyleValueKindTag.Dynamic) return declaration;
			// A function-valued style is not a scalar runtime value. Replacing it
			// with a custom property would stringify the function and silently lose
			// its props/theme evaluation. Only a target-native function carrier or a
			// host/framework lowering may consume it.
			if (isFunctionDynamic(value)) {
				if (
					level(target, AdapterCapabilityTag.FunctionValues) !==
					AdapterCapabilityLevelTag.Unsupported
				) {
					resolvedDynamicCapabilities.add(AdapterCapabilityTag.FunctionValues);
					return declaration;
				}
				if (
					hostFramework === true &&
					level(target, AdapterCapabilityTag.CustomProperties) === AdapterCapabilityLevelTag.Exact
				) {
					changed = true;
					const variable = dynamicVariableName(value.expression);
					residuals.push({
						kind: StyleProgramResidualKindTag.DynamicCustomProperty,
						text: value.expression,
						hint: `evaluate ${value.expression} for ${variable} in the generated host wrapper`,
					});
					return {
						...declaration,
						value: { kind: StyleValueKindTag.Literal, value: `var(${variable})` },
					};
				}
				residuals.push({
					kind: StyleProgramResidualKindTag.FunctionDynamic,
					text: value.expression,
					hint: "function-valued styles require a target-native or host prop wrapper",
				});
				return declaration;
			}
			const resolved = resolveThemeExpression(value.expression, program);
			if (
				resolved !== undefined &&
				level(target, AdapterCapabilityTag.ThemeContext) === AdapterCapabilityLevelTag.Unsupported
			) {
				changed = true;
				return {
					...declaration,
					value: { kind: StyleValueKindTag.Literal, value: resolved.value },
				};
			}
			const nativeDynamicLevel = level(target, AdapterCapabilityTag.DynamicValues);
			const preferStaticCustomProperty =
				mode === AdapterCapabilityModeTag.Safe &&
				nativeDynamicLevel === AdapterCapabilityLevelTag.Partial &&
				level(target, AdapterCapabilityTag.CustomProperties) === AdapterCapabilityLevelTag.Exact;
			if (
				nativeDynamicLevel !== AdapterCapabilityLevelTag.Unsupported &&
				!preferStaticCustomProperty
			) {
				const themeExpression = /^(?:theme|tokens)\./.test(value.expression.trim());
				if (
					!themeExpression ||
					level(target, AdapterCapabilityTag.ThemeContext) !== AdapterCapabilityLevelTag.Unsupported
				)
					resolvedDynamicCapabilities.add(AdapterCapabilityTag.DynamicValues);
				return declaration;
			}
			if (
				level(target, AdapterCapabilityTag.CustomProperties) !==
				AdapterCapabilityLevelTag.Unsupported
			) {
				changed = true;
				const variable = dynamicVariableName(value.expression);
				residuals.push({
					kind: StyleProgramResidualKindTag.DynamicCustomProperty,
					text: value.expression,
					hint: `bind ${variable} at runtime for target ${target.adapter}`,
				});
				return {
					...declaration,
					value: { kind: StyleValueKindTag.Literal, value: `var(${variable})` },
				};
			}
			if (value.fallback !== undefined) {
				changed = true;
				residuals.push({
					kind: StyleProgramResidualKindTag.DynamicFallback,
					text: value.expression,
					hint: "target lacks runtime dynamic values; fallback emitted",
				});
				return { ...declaration, value: value.fallback };
			}
			residuals.push({
				kind: StyleProgramResidualKindTag.Dynamic,
				text: value.expression,
				hint: "target lacks runtime dynamic values",
			});
			return declaration;
		};
		const rules = program.rules.map((rule) => replaceDeclarations(rule, transform));
		const themes =
			level(target, AdapterCapabilityTag.ThemeContext) === AdapterCapabilityLevelTag.Unsupported
				? undefined
				: program.themes;
		if (themes === undefined && program.themes !== undefined) changed = true;
		return {
			program: changed
				? { ...program, rules, declarations: program.declarations.map(transform), themes }
				: program,
			residuals,
			applied: changed ? [StyleLoweringId.DynamicAndTheme] : [],
			...(resolvedDynamicCapabilities.size === 0
				? {}
				: { resolvedCapabilities: [...resolvedDynamicCapabilities] }),
		};
	},
};

const composition: StyleLowering = {
	schema: STYLE_LOWERING_SCHEMA,
	id: StyleLoweringId.CompositionFlatten,
	apply: ({ program, target }) => {
		if (
			(program.compositions?.length ?? 0) === 0 ||
			level(target, AdapterCapabilityTag.Composition) !== AdapterCapabilityLevelTag.Unsupported
		)
			return { program, residuals: [], applied: [] };
		const residuals: StyleProgramResidual[] = [];
		const rules = [...program.rules];
		for (const edge of program.compositions ?? []) {
			if (edge.program === undefined) {
				residuals.push({
					kind: StyleProgramResidualKindTag.Composition,
					text: edge.reference,
					hint: "target lacks composition support and edge has no embedded program",
				});
				continue;
			}
			rules.unshift(...edge.program.rules);
		}
		return {
			program: {
				...program,
				rules,
				declarations: allDeclarations({ ...program, rules }),
				compositions: undefined,
			},
			residuals,
			applied: [StyleLoweringId.CompositionFlatten],
		};
	},
};

const runtimeAndPlugins: StyleLowering = {
	schema: STYLE_LOWERING_SCHEMA,
	id: StyleLoweringId.RuntimeAndPlugin,
	apply: ({ program, target, hostFramework }) => {
		const residuals: StyleProgramResidual[] = [];
		let rules = program.rules;
		let applied = false;
		const resolvedPluginIds = new Set<string>();
		let remainingPlugins = program.plugins;
		if (
			(program.plugins?.length ?? 0) > 0 &&
			level(target, AdapterCapabilityTag.PluginTransforms) === AdapterCapabilityLevelTag.Unsupported
		) {
			const transforms = program.plugins ?? [];
			rules = rules.map((rule) =>
				replaceDeclarations(rule, (declaration) => {
					const value = declaration.value;
					if (value.kind !== StyleValueKindTag.Dynamic) return declaration;
					let expression = value.expression;
					for (const transform of transforms) {
						const before = expression;
						if (transform.output !== undefined)
							expression = expression.replace(transform.input, transform.output);
						if (expression !== before) resolvedPluginIds.add(transform.id);
					}
					if (expression === value.expression) return declaration;
					applied = true;
					return { ...declaration, value: { ...value, expression } };
				}),
			);
			for (const transform of transforms)
				if (!resolvedPluginIds.has(transform.id))
					residuals.push({
						kind: StyleProgramResidualKindTag.PluginTransform,
						text: transform.id,
						hint: "target lacks plugin transform support",
					});
			remainingPlugins = transforms.filter((transform) => !resolvedPluginIds.has(transform.id));
		}
		const runtime =
			level(target, AdapterCapabilityTag.RuntimeContext) === AdapterCapabilityLevelTag.Unsupported
				? undefined
				: program.runtime;
		if (runtime === undefined && program.runtime !== undefined) {
			applied = true;
			residuals.push({
				kind: StyleProgramResidualKindTag.RuntimeContext,
				text: program.runtime.phase,
				hint: "target lacks runtime context support",
			});
		}
		const source =
			level(target, AdapterCapabilityTag.FrameworkSemantics) ===
				AdapterCapabilityLevelTag.Unsupported &&
			program.source?.framework !== undefined &&
			hostFramework !== true
				? { ...program.source, framework: undefined }
				: program.source;
		if (source !== program.source) {
			applied = true;
			residuals.push({
				kind: AdapterCapabilityTag.FrameworkSemantics,
				text: program.source?.framework ?? "",
				hint: "target lacks framework semantics",
			});
		}
		return {
			program: applied
				? {
						...program,
						rules,
						declarations: allDeclarations({ ...program, rules }),
						runtime,
						source,
						...(remainingPlugins === undefined
							? {}
							: { plugins: remainingPlugins.length === 0 ? undefined : remainingPlugins }),
					}
				: program,
			residuals,
			applied: applied ? [StyleLoweringId.RuntimeAndPlugin] : [],
			...(program.plugins !== undefined &&
			program.plugins.length > 0 &&
			residuals.every(
				(residual) => residual.kind !== StyleProgramResidualKindTag.PluginTransform,
			) &&
			resolvedPluginIds.size === program.plugins.length
				? { resolvedCapabilities: [AdapterCapabilityTag.PluginTransforms] }
				: {}),
		};
	},
};

export const STYLE_LOWERINGS: readonly StyleLowering[] = [
	tokenFallback,
	dynamicAndThemes,
	composition,
	runtimeAndPlugins,
];

export const BUILTIN_STYLE_LOWERING_PLUGIN: StyleLoweringPlugin = {
	schema: STYLE_LOWERING_PLUGIN_SCHEMA,
	id: StyleLoweringId.Builtin,
	lowerings: STYLE_LOWERINGS,
};

export function createStyleLoweringRegistry(
	initial?: readonly StyleLowering[],
): StyleLoweringRegistry {
	const lowerings = new Map<string, StyleLowering>();
	const plugins = new Map<string, StyleLoweringPlugin>();
	const registry: StyleLoweringRegistry = {
		get plugins() {
			return [...plugins.values()];
		},
		get lowerings() {
			return [...lowerings.values()];
		},
		register(lowering) {
			if (lowering.schema !== STYLE_LOWERING_SCHEMA)
				throw new Error(`unsupported lowering schema: ${lowering.schema}`);
			if (lowerings.has(lowering.id))
				throw new Error(`lowering already registered: ${lowering.id}`);
			lowerings.set(lowering.id, lowering);
			return registry;
		},
		registerPlugin(plugin) {
			if (plugin.schema !== STYLE_LOWERING_PLUGIN_SCHEMA)
				throw new Error(`unsupported lowering plugin schema: ${plugin.schema}`);
			if (plugins.has(plugin.id))
				throw new Error(`lowering plugin already registered: ${plugin.id}`);
			plugins.set(plugin.id, plugin);
			for (const lowering of plugin.lowerings) registry.register(lowering);
			return registry;
		},
		extend(additional) {
			const known = new Set(registry.lowerings.map((lowering) => lowering.id));
			const merged = [...registry.lowerings];
			for (const lowering of additional) {
				if (known.has(lowering.id)) continue;
				known.add(lowering.id);
				merged.push(lowering);
			}
			return createStyleLoweringRegistry(merged);
		},
		lower(context) {
			let program = context.program;
			const residuals: StyleProgramResidual[] = [];
			const applied: string[] = [];
			const resolvedCapabilities = new Set<AdapterCapability>();
			for (const lowering of registry.lowerings) {
				const result = lowering.apply({ ...context, program });
				if (result.resolvedResidualKinds !== undefined) {
					const resolved = new Set(result.resolvedResidualKinds);
					for (let index = residuals.length - 1; index >= 0; index--)
						if (resolved.has(residuals[index]!.kind)) residuals.splice(index, 1);
					program = {
						...result.program,
						residuals: result.program.residuals.filter((residual) => !resolved.has(residual.kind)),
					};
				} else {
					program = result.program;
				}
				residuals.push(...result.residuals);
				applied.push(...result.applied);
				for (const capability of result.resolvedCapabilities ?? [])
					resolvedCapabilities.add(capability);
			}
			return {
				program,
				residuals: [
					...new Map(
						residuals.map((residual) => [
							`${residual.kind}\0${residual.text}\0${residual.hint ?? ""}`,
							residual,
						]),
					).values(),
				],
				applied,
				...(resolvedCapabilities.size === 0
					? {}
					: { resolvedCapabilities: [...resolvedCapabilities] }),
			};
		},
		plan(context) {
			const result = registry.lower(context);
			return {
				...result,
				representation: representationFor(context, result),
				availableRepresentations: availableRepresentationsFor(context, result),
			};
		},
	};
	if (initial === undefined) registry.registerPlugin(BUILTIN_STYLE_LOWERING_PLUGIN);
	else for (const lowering of initial) registry.register(lowering);
	return registry;
}

export const STYLE_LOWERING_REGISTRY = createStyleLoweringRegistry();

function representationFor(
	context: StyleLoweringContext,
	result: StyleLoweringResult,
): StyleRepresentationKind {
	const declarations = StyleProgramAnalysis.declarations(result.program);
	const hasDynamic = declarations.some(
		(declaration) => declaration.value.kind === StyleValueKindTag.Dynamic,
	);
	if (result.residuals.length > 0 || result.program.residuals.length > 0) {
		if (
			declarations.some(
				(declaration) =>
					declaration.value.kind === StyleValueKindTag.Literal &&
					typeof declaration.value.value === "string" &&
					declaration.value.value.startsWith("var(--pandwind-dynamic-"),
			)
		)
			return StyleRepresentationKind.CustomProperty;
		return StyleRepresentationKind.Residual;
	}
	if (result.program.rules.some((rule) => rule.name !== undefined))
		return StyleRepresentationKind.NamedMap;
	if (hasDynamic) {
		const hasFunctionDynamic = declarations.some(
			(declaration) =>
				declaration.value.kind === StyleValueKindTag.Dynamic &&
				declaration.value.expressionKind === StyleDynamicExpressionKind.Function,
		);
		const dynamicCapability = hasFunctionDynamic
			? level(context.target, AdapterCapabilityTag.FunctionValues)
			: level(context.target, AdapterCapabilityTag.DynamicValues);
		return dynamicCapability === AdapterCapabilityLevelTag.Unsupported
			? StyleRepresentationKind.Residual
			: StyleRepresentationKind.TargetNative;
	}
	return StyleRepresentationKind.Static;
}

function availableRepresentationsFor(
	context: StyleLoweringContext,
	result: StyleLoweringResult,
): readonly StyleRepresentationKind[] {
	const declarations = allDeclarations(result.program);
	const hasDynamic = declarations.some(
		(declaration) => declaration.value.kind === StyleValueKindTag.Dynamic,
	);
	const hasFunctionDynamic = declarations.some((declaration) =>
		isFunctionDynamic(declaration.value),
	);
	const hasCustomProperty = declarations.some(
		(declaration) =>
			declaration.value.kind === StyleValueKindTag.Literal &&
			typeof declaration.value.value === "string" &&
			declaration.value.value.startsWith("var(--pandwind-dynamic-"),
	);
	const hasResidual = result.program.residuals.length > 0 || result.residuals.length > 0;
	const representations: StyleRepresentationKind[] = [];
	if (!hasDynamic && !hasResidual) representations.push(StyleRepresentationKind.Static);
	if (
		level(context.target, AdapterCapabilityTag.NamedRules) !== AdapterCapabilityLevelTag.Unsupported
	)
		representations.push(StyleRepresentationKind.NamedMap);
	if (
		hasDynamic &&
		!hasFunctionDynamic &&
		level(context.target, AdapterCapabilityTag.DynamicValues) !==
			AdapterCapabilityLevelTag.Unsupported
	)
		representations.push(StyleRepresentationKind.TargetNative);
	if (
		(hasDynamic || hasCustomProperty) &&
		!hasFunctionDynamic &&
		level(context.target, AdapterCapabilityTag.CustomProperties) !==
			AdapterCapabilityLevelTag.Unsupported
	)
		representations.push(StyleRepresentationKind.CustomProperty);
	if (
		hasDynamic &&
		level(context.target, AdapterCapabilityTag.RuntimeContext) !==
			AdapterCapabilityLevelTag.Unsupported
	)
		representations.push(StyleRepresentationKind.RuntimeCarrier);
	representations.push(StyleRepresentationKind.Residual);
	return representations;
}
