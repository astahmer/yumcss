import {
	StyleRuleKindTag,
	StyleValueKindTag,
	styleProgramFromRules,
	type StyleCondition,
	type StyleDeclaration,
	type StyleDynamicValue,
	type StyleLiteralValue,
	type StyleProgram,
	type StyleProgramOptions,
	type StyleProgramResidual,
	type StyleProgramSource,
	type StyleRule,
	type StyleRuleInput,
	type StyleTokenValue,
	type StyleValue,
} from "./semantic-ir.ts";

export type StyleProgramValueInput = StyleValue | string | number | boolean;

export type StyleProgramChildInput = Omit<StyleRuleInput, "children"> & {
	readonly children?: readonly StyleProgramChildInput[];
};

export interface StyleProgramRuleOptions {
	readonly conditions?: readonly StyleCondition[];
	readonly selector?: string;
	readonly name?: string;
	readonly layer?: string;
	readonly children?: readonly StyleProgramChildInput[];
	readonly source?: StyleProgramSource;
	readonly order?: number;
}

export interface StyleProgramBuilderOptions extends StyleProgramOptions {
	readonly residuals?: readonly StyleProgramResidual[];
}

export interface StyleProgramKeyframe {
	readonly selector: string;
	readonly declarations:
		| Readonly<Record<string, StyleProgramValueInput>>
		| readonly StyleDeclaration[];
	readonly order?: number;
}

export class StyleProgramBuilder {
	private readonly rules: StyleRuleInput[] = [];

	private readonly residuals: StyleProgramResidual[];

	private readonly options: Mutable<StyleProgramBuilderOptions>;

	private nextOrder = 0;

	private constructor(options: StyleProgramBuilderOptions) {
		this.options = { ...options };
		this.residuals = [...(options.residuals ?? [])];
	}

	static create(options: StyleProgramBuilderOptions = {}): StyleProgramBuilder {
		return new StyleProgramBuilder(options);
	}

	static from(program: StyleProgram): StyleProgramBuilder {
		const builder = new StyleProgramBuilder({
			source: program.source,
			sourceMap: program.sourceMap,
			themes: program.themes,
			compositions: program.compositions,
			runtime: program.runtime,
			plugins: program.plugins,
			emissionHints: program.emissionHints,
			canonicalization: program.canonicalization,
			residuals: program.residuals,
		});
		builder.rules.push(...program.rules);
		builder.nextOrder = Math.max(0, ...program.rules.map((rule) => rule.order + 1));
		return builder;
	}

	static literal(value: StyleLiteralValue["value"]): StyleLiteralValue {
		return { kind: StyleValueKindTag.Literal, value };
	}

	static token(
		ref: string,
		options: { readonly authored?: string; readonly resolved?: string } = {},
	): StyleTokenValue {
		requireNonEmpty(ref, "token reference");
		return {
			kind: StyleValueKindTag.Token,
			ref,
			authored: options.authored ?? `$${ref}`,
			...(options.resolved === undefined ? {} : { resolved: options.resolved }),
		};
	}

	static dynamic(
		expression: string,
		options: Omit<StyleDynamicValue, "kind" | "expression"> = {},
	): StyleDynamicValue {
		requireNonEmpty(expression, "dynamic expression");
		return {
			kind: StyleValueKindTag.Dynamic,
			expression,
			...options,
		};
	}

	style(
		declarations: Readonly<Record<string, StyleProgramValueInput>> | readonly StyleDeclaration[],
		options: StyleProgramRuleOptions = {},
	): this {
		return this.addRule({
			kind: StyleRuleKindTag.Style,
			conditions: options.conditions ?? [],
			declarations: toDeclarations(declarations),
			children: normalizeChildren(options.children),
			...ruleOptions(options),
		});
	}

	withStyle(
		declarations: Readonly<Record<string, StyleProgramValueInput>> | readonly StyleDeclaration[],
		options: StyleProgramRuleOptions = {},
	): this {
		return this.style(declarations, options);
	}

	global(
		selector: string,
		declarations: Readonly<Record<string, StyleProgramValueInput>> | readonly StyleDeclaration[],
		options: StyleProgramRuleOptions = {},
	): this {
		requireNonEmpty(selector, "global selector");
		return this.addRule({
			kind: StyleRuleKindTag.Global,
			selector,
			conditions: options.conditions ?? [],
			declarations: toDeclarations(declarations),
			children: normalizeChildren(options.children),
			...ruleOptions(options),
		});
	}

	keyframes(
		name: string,
		frames: readonly StyleProgramKeyframe[],
		options: Omit<StyleProgramRuleOptions, "children" | "name" | "selector"> = {},
	): this {
		requireNonEmpty(name, "keyframe name");
		return this.addRule({
			kind: StyleRuleKindTag.Keyframes,
			name,
			conditions: options.conditions ?? [],
			declarations: [],
			children: frames.map((frame) => ({
				kind: StyleRuleKindTag.Style,
				selector: frame.selector,
				conditions: [],
				declarations: toDeclarations(frame.declarations),
				children: [],
				order: frame.order ?? 0,
			})),
			...ruleOptions(options),
		});
	}

	fontFace(
		declarations: Readonly<Record<string, StyleProgramValueInput>> | readonly StyleDeclaration[],
		options: Omit<StyleProgramRuleOptions, "children" | "name" | "selector"> = {},
	): this {
		return this.addRule({
			kind: StyleRuleKindTag.FontFace,
			conditions: options.conditions ?? [],
			declarations: toDeclarations(declarations),
			children: [],
			...ruleOptions(options),
		});
	}

	layer(
		name: string,
		declarations:
			| Readonly<Record<string, StyleProgramValueInput>>
			| readonly StyleDeclaration[] = {},
		options: Omit<StyleProgramRuleOptions, "children" | "name" | "layer"> & {
			readonly children?: readonly StyleProgramChildInput[];
		} = {},
	): this {
		requireNonEmpty(name, "layer name");
		return this.addRule({
			kind: StyleRuleKindTag.Layer,
			name,
			layer: name,
			conditions: options.conditions ?? [],
			declarations: toDeclarations(declarations),
			children: normalizeChildren(options.children),
			...ruleOptions(options),
		});
	}

	supports(
		condition: string,
		declarations:
			| Readonly<Record<string, StyleProgramValueInput>>
			| readonly StyleDeclaration[] = {},
		options: Omit<StyleProgramRuleOptions, "children" | "name"> & {
			readonly children?: readonly StyleProgramChildInput[];
		} = {},
	): this {
		requireNonEmpty(condition, "supports condition");
		return this.addRule({
			kind: StyleRuleKindTag.Supports,
			name: condition,
			conditions: options.conditions ?? [],
			declarations: toDeclarations(declarations),
			children: normalizeChildren(options.children),
			...ruleOptions(options),
		});
	}

	property(
		name: string,
		declarations: Readonly<Record<string, StyleProgramValueInput>> | readonly StyleDeclaration[],
		options: Omit<StyleProgramRuleOptions, "children" | "name"> = {},
	): this {
		requireNonEmpty(name, "property name");
		return this.addRule({
			kind: StyleRuleKindTag.Property,
			name,
			conditions: options.conditions ?? [],
			declarations: toDeclarations(declarations),
			children: [],
			...ruleOptions(options),
		});
	}

	addRule(rule: StyleRuleInput): this {
		const order = rule.order ?? this.nextOrder;
		this.nextOrder = Math.max(this.nextOrder, order + 1);
		this.rules.push({ ...rule, order });
		return this;
	}

	withResidual(residual: StyleProgramResidual): this {
		this.residuals.push(residual);
		return this;
	}

	withTheme(binding: NonNullable<StyleProgramOptions["themes"]>[number]): this {
		this.options.themes = [...(this.options.themes ?? []), binding];
		return this;
	}

	withComposition(composition: NonNullable<StyleProgramOptions["compositions"]>[number]): this {
		this.options.compositions = [...(this.options.compositions ?? []), composition];
		return this;
	}

	withRuntime(runtime: NonNullable<StyleProgramOptions["runtime"]>): this {
		this.options.runtime = runtime;
		return this;
	}

	withPlugin(plugin: NonNullable<StyleProgramOptions["plugins"]>[number]): this {
		this.options.plugins = [...(this.options.plugins ?? []), plugin];
		return this;
	}

	withEmissionHint(hint: NonNullable<StyleProgramOptions["emissionHints"]>[number]): this {
		this.options.emissionHints = [...(this.options.emissionHints ?? []), hint];
		return this;
	}

	withSourceMap(source: StyleProgramSource): this {
		this.options.sourceMap = [...(this.options.sourceMap ?? []), source];
		return this;
	}

	build(): StyleProgram {
		return styleProgramFromRules(this.rules, {
			...this.options,
			residuals: this.residuals,
		});
	}
}

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };

function ruleOptions(options: StyleProgramRuleOptions): Partial<StyleRuleInput> {
	return {
		...(options.selector === undefined ? {} : { selector: options.selector }),
		...(options.name === undefined ? {} : { name: options.name }),
		...(options.layer === undefined ? {} : { layer: options.layer }),
		...(options.source === undefined ? {} : { source: options.source }),
		...(options.order === undefined ? {} : { order: options.order }),
	};
}

function normalizeChildren(
	children: readonly StyleProgramChildInput[] | undefined,
): readonly StyleRule[] {
	return (children ?? []).map((child, index) => ({
		...child,
		children: normalizeChildren(child.children),
		order: child.order ?? index,
	}));
}

function toDeclarations(
	declarations: Readonly<Record<string, StyleProgramValueInput>> | readonly StyleDeclaration[],
): readonly StyleDeclaration[] {
	if (Array.isArray(declarations))
		return declarations.map((declaration) => ({
			...declaration,
			property: requireNonEmpty(declaration.property, "declaration property"),
			value: toValue(declaration.value),
		}));
	return Object.entries(declarations).map(([property, value]) => ({
		conditions: [],
		property: requireNonEmpty(property, "declaration property"),
		value: toValue(value),
	}));
}

function toValue(value: StyleProgramValueInput): StyleValue {
	if (typeof value !== "object" || value === null) {
		if (typeof value === "string" && value.startsWith("$"))
			return StyleProgramBuilder.token(value.slice(1), { authored: value });
		return StyleProgramBuilder.literal(value);
	}
	if (value.kind === StyleValueKindTag.Token) return value;
	if (value.kind === StyleValueKindTag.Literal) return value;
	if (value.kind === StyleValueKindTag.Dynamic) return value;
	throw new TypeError("StyleProgramBuilder received an unknown semantic value kind");
}

function requireNonEmpty(value: string, label: string): string {
	if (value.trim() === "") throw new TypeError(`StyleProgramBuilder requires a ${label}`);
	return value;
}
