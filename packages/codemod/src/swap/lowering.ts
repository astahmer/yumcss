import type { AdapterCapabilities, AdapterCapabilityMode } from "./capabilities.ts";
import type {
	StyleDeclaration,
	StyleProgram,
	StyleProgramResidual,
	StyleRule,
} from "./semantic-ir.ts";
import { StyleLoweringId, StyleRepresentationKind } from "./identifiers.ts";

export const STYLE_LOWERING_SCHEMA = "pandwind.style-lowering/1" as const;
export const STYLE_LOWERING_PLUGIN_SCHEMA = "pandwind.style-lowering-plugin/1" as const;

export interface StyleLoweringContext {
	readonly program: StyleProgram;
	readonly target: AdapterCapabilities;
	readonly mode: AdapterCapabilityMode;
}

export interface StyleLoweringResult {
	readonly program: StyleProgram;
	readonly residuals: readonly StyleProgramResidual[];
	readonly applied: readonly string[];
	/** Residual kinds this strategy proved it replaced with a safe representation. */
	readonly resolvedResidualKinds?: readonly string[];
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

const allDeclarations = (program: StyleProgram): StyleDeclaration[] =>
	program.rules.flatMap(function collect(rule): StyleDeclaration[] {
		return [...rule.declarations, ...rule.children.flatMap(collect)];
	});

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
	apply: ({ program, target }) => {
		const residuals: StyleProgramResidual[] = [];
		let changed = false;
		const transform = (declaration: StyleDeclaration): StyleDeclaration => {
			const value = declaration.value;
			if (value.kind !== "dynamic") return declaration;
			const resolved = resolveThemeExpression(value.expression, program);
			if (resolved !== undefined && level(target, "theme-context") === "unsupported") {
				changed = true;
				return { ...declaration, value: { kind: "literal", value: resolved.value } };
			}
			if (level(target, "dynamic-values") !== "unsupported") return declaration;
			if (level(target, "custom-properties") !== "unsupported") {
				changed = true;
				const variable = dynamicVariableName(value.expression);
				residuals.push({
					kind: "dynamic-custom-property",
					text: value.expression,
					hint: `bind ${variable} at runtime for target ${target.adapter}`,
				});
				return {
					...declaration,
					value: { kind: "literal", value: `var(${variable})` },
				};
			}
			if (value.fallback !== undefined) {
				changed = true;
				residuals.push({
					kind: "dynamic-fallback",
					text: value.expression,
					hint: "target lacks runtime dynamic values; fallback emitted",
				});
				return { ...declaration, value: value.fallback };
			}
			residuals.push({
				kind: "dynamic",
				text: value.expression,
				hint: "target lacks runtime dynamic values",
			});
			return declaration;
		};
		const rules = program.rules.map((rule) => replaceDeclarations(rule, transform));
		const themes = level(target, "theme-context") === "unsupported" ? undefined : program.themes;
		if (themes === undefined && program.themes !== undefined) changed = true;
		return {
			program: changed
				? { ...program, rules, declarations: program.declarations.map(transform), themes }
				: program,
			residuals,
			applied: changed ? [StyleLoweringId.DynamicAndTheme] : [],
		};
	},
};

const composition: StyleLowering = {
	schema: STYLE_LOWERING_SCHEMA,
	id: StyleLoweringId.CompositionFlatten,
	apply: ({ program, target }) => {
		if ((program.compositions?.length ?? 0) === 0 || level(target, "composition") !== "unsupported")
			return { program, residuals: [], applied: [] };
		const residuals: StyleProgramResidual[] = [];
		const rules = [...program.rules];
		for (const edge of program.compositions ?? []) {
			if (edge.program === undefined) {
				residuals.push({
					kind: "composition",
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
	apply: ({ program, target }) => {
		const residuals: StyleProgramResidual[] = [];
		let rules = program.rules;
		let applied = false;
		if (
			(program.plugins?.length ?? 0) > 0 &&
			level(target, "plugin-transforms") === "unsupported"
		) {
			const transforms = program.plugins ?? [];
			rules = rules.map((rule) =>
				replaceDeclarations(rule, (declaration) => {
					const value = declaration.value;
					if (value.kind !== "dynamic") return declaration;
					let expression = value.expression;
					for (const transform of transforms) {
						if (transform.output !== undefined)
							expression = expression.replace(transform.input, transform.output);
					}
					if (expression === value.expression) return declaration;
					applied = true;
					return { ...declaration, value: { ...value, expression } };
				}),
			);
			if (!applied) {
				for (const transform of transforms)
					residuals.push({
						kind: "plugin-transform",
						text: transform.id,
						hint: "target lacks plugin transform support",
					});
			}
		}
		const runtime =
			level(target, "runtime-context") === "unsupported" ? undefined : program.runtime;
		if (runtime === undefined && program.runtime !== undefined) {
			applied = true;
			residuals.push({
				kind: "runtime-context",
				text: program.runtime.phase,
				hint: "target lacks runtime context support",
			});
		}
		const source =
			level(target, "framework-semantics") === "unsupported" &&
			program.source?.framework !== undefined
				? { ...program.source, framework: undefined }
				: program.source;
		if (source !== program.source) {
			applied = true;
			residuals.push({
				kind: "framework-semantics",
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
						plugins: undefined,
					}
				: program,
			residuals,
			applied: applied ? [StyleLoweringId.RuntimeAndPlugin] : [],
		};
	},
};

export const STYLE_LOWERINGS: readonly StyleLowering[] = [
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
			for (const lowering of registry.lowerings) {
				const result = lowering.apply({ ...context, program });
				if (result.resolvedResidualKinds !== undefined) {
					const resolved = new Set(result.resolvedResidualKinds);
					for (let index = residuals.length - 1; index >= 0; index--)
						if (resolved.has(residuals[index]!.kind)) residuals.splice(index, 1);
				}
				program = result.program;
				residuals.push(...result.residuals);
				applied.push(...result.applied);
			}
			return { program, residuals, applied };
		},
		plan(context) {
			const result = registry.lower(context);
			return {
				...result,
				representation: representationFor(context, result),
				availableRepresentations: availableRepresentationsFor(context),
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
	const declarations = result.program.rules.flatMap(function collect(rule): StyleDeclaration[] {
		return [...rule.declarations, ...rule.children.flatMap(collect)];
	});
	const hasDynamic = declarations.some((declaration) => declaration.value.kind === "dynamic");
	if (result.residuals.length > 0 || result.program.residuals.length > 0) {
		if (
			declarations.some(
				(declaration) =>
					declaration.value.kind === "literal" &&
					typeof declaration.value.value === "string" &&
					declaration.value.value.startsWith("var(--pandwind-dynamic-"),
			)
		)
			return StyleRepresentationKind.CustomProperty;
		return StyleRepresentationKind.Residual;
	}
	if (hasDynamic) {
		const dynamicCapability = level(context.target, "dynamic-values");
		return dynamicCapability === "unsupported"
			? StyleRepresentationKind.Residual
			: StyleRepresentationKind.TargetNative;
	}
	return StyleRepresentationKind.Static;
}

function availableRepresentationsFor(
	context: StyleLoweringContext,
): readonly StyleRepresentationKind[] {
	const representations = [StyleRepresentationKind.Static];
	if (level(context.target, "dynamic-values") !== "unsupported")
		representations.push(StyleRepresentationKind.TargetNative);
	if (level(context.target, "custom-properties") !== "unsupported")
		representations.push(StyleRepresentationKind.CustomProperty);
	if (level(context.target, "runtime-context") !== "unsupported")
		representations.push(StyleRepresentationKind.RuntimeCarrier);
	representations.push(StyleRepresentationKind.Residual);
	return representations;
}
