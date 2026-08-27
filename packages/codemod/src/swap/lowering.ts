import type { AdapterCapabilities, AdapterCapabilityMode } from "./capabilities.ts";
import type {
	StyleDeclaration,
	StyleProgram,
	StyleProgramResidual,
	StyleRule,
} from "./semantic-ir.ts";

export const STYLE_LOWERING_SCHEMA = "pandwind.style-lowering/1" as const;

export interface StyleLoweringContext {
	readonly program: StyleProgram;
	readonly target: AdapterCapabilities;
	readonly mode: AdapterCapabilityMode;
}

export interface StyleLoweringResult {
	readonly program: StyleProgram;
	readonly residuals: readonly StyleProgramResidual[];
	readonly applied: readonly string[];
}

export interface StyleLowering {
	readonly schema: typeof STYLE_LOWERING_SCHEMA;
	readonly id: string;
	apply(context: StyleLoweringContext): StyleLoweringResult;
}

export interface StyleLoweringRegistry {
	readonly lowerings: readonly StyleLowering[];
	register(lowering: StyleLowering): StyleLoweringRegistry;
	lower(context: StyleLoweringContext): StyleLoweringResult;
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

const dynamicAndThemes: StyleLowering = {
	schema: STYLE_LOWERING_SCHEMA,
	id: "dynamic-and-theme",
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
			applied: changed ? ["dynamic-and-theme"] : [],
		};
	},
};

const composition: StyleLowering = {
	schema: STYLE_LOWERING_SCHEMA,
	id: "composition-flatten",
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
			applied: ["composition-flatten"],
		};
	},
};

const runtimeAndPlugins: StyleLowering = {
	schema: STYLE_LOWERING_SCHEMA,
	id: "runtime-and-plugin",
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
			applied: applied ? ["runtime-and-plugin"] : [],
		};
	},
};

export const STYLE_LOWERINGS: readonly StyleLowering[] = [
	dynamicAndThemes,
	composition,
	runtimeAndPlugins,
];

export function createStyleLoweringRegistry(
	initial: readonly StyleLowering[] = STYLE_LOWERINGS,
): StyleLoweringRegistry {
	const lowerings = new Map<string, StyleLowering>();
	const registry: StyleLoweringRegistry = {
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
		lower(context) {
			let program = context.program;
			const residuals: StyleProgramResidual[] = [];
			const applied: string[] = [];
			for (const lowering of registry.lowerings) {
				const result = lowering.apply({ ...context, program });
				program = result.program;
				residuals.push(...result.residuals);
				applied.push(...result.applied);
			}
			return { program, residuals, applied };
		},
	};
	for (const lowering of initial) registry.register(lowering);
	return registry;
}

export const STYLE_LOWERING_REGISTRY = createStyleLoweringRegistry();
