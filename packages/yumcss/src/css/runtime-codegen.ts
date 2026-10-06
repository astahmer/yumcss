/**
 * Shared CSS runtime attachment registry and source renderer.
 *
 * Vite uses this to materialize usage-specific virtual modules. The codemod
 * uses the same renderer for explicit generated modules so the two
 * specialization paths cannot drift apart.
 */

/** Runtime methods that can be attached to a CSS factory callable. */
export const CssRuntimeMethodTag = {
	Class: "class",
	Vars: "vars",
	Raw: "raw",
	Props: "props",
	Group: "group",
	Input: "input",
	Keyframes: "keyframes",
} as const;

export type CssRuntimeMethod = (typeof CssRuntimeMethodTag)[keyof typeof CssRuntimeMethodTag];

/** Factory implementations that can share a specialized attachment module. */
export const CssRuntimeFactoryTag = {
	Unsafe: "unsafe",
	Preset: "preset",
	Generated: "generated",
	Design: "design",
} as const;

export type CssRuntimeFactory = (typeof CssRuntimeFactoryTag)[keyof typeof CssRuntimeFactoryTag];

/** Stable registry order used for method ids, imports, and generated output. */
export const CSS_RUNTIME_METHODS = [
	CssRuntimeMethodTag.Class,
	CssRuntimeMethodTag.Vars,
	CssRuntimeMethodTag.Raw,
	CssRuntimeMethodTag.Props,
	CssRuntimeMethodTag.Group,
	CssRuntimeMethodTag.Input,
	CssRuntimeMethodTag.Keyframes,
] as const satisfies readonly CssRuntimeMethod[];

const isCssRuntimeMethod = (value: string): value is CssRuntimeMethod =>
	(CSS_RUNTIME_METHODS as readonly string[]).includes(value);

const attachmentName = (method: CssRuntimeMethod): string =>
	`attach${method[0]!.toUpperCase()}${method.slice(1)}`;

/**
 * Validate and canonicalize a method selection.
 *
 * `group` needs `vars` to represent parameterized groups, so that dependency
 * is expanded here rather than being reimplemented by individual consumers.
 */
export const normalizeCssRuntimeMethods = (methods: readonly string[]): CssRuntimeMethod[] => {
	const selected = new Set<CssRuntimeMethod>();
	for (const method of methods) {
		if (!isCssRuntimeMethod(method))
			throw new Error(
				`Unknown CSS runtime method '${method}'. Expected ${CSS_RUNTIME_METHODS.join(", ")}.`,
			);
		selected.add(method);
	}
	if (selected.has(CssRuntimeMethodTag.Group)) selected.add(CssRuntimeMethodTag.Vars);
	return CSS_RUNTIME_METHODS.filter((method) => selected.has(method));
};

export interface RenderCssRuntimeModuleOptions {
	/** Add the typed `createUnsafeCss` contract used by explicit generated files. */
	readonly typed?: boolean;
	/** Select the public factory implemented by the specialized module. */
	readonly factory?: CssRuntimeFactory;
	/** Replace a preset argument with build-time projected metadata. */
	readonly presetSource?: string;
}

const renderRuntimeImports = (
	methods: readonly CssRuntimeMethod[],
	factory: CssRuntimeFactory,
): string[] => [
	`import { ${factory === CssRuntimeFactoryTag.Unsafe ? "createCssRuntime" : factory === CssRuntimeFactoryTag.Design ? "createDesignCssRuntime" : "createPresetCssRuntime"} } from "yumcss/_runtime/${factory === CssRuntimeFactoryTag.Unsafe ? "css-base" : factory === CssRuntimeFactoryTag.Design ? "css-design" : "css-preset"}";`,
	...methods.map(
		(method) => `import { ${attachmentName(method)} } from "yumcss/_runtime/css-${method}";`,
	),
];

const renderRuntimeFactory = (
	methods: readonly CssRuntimeMethod[],
	factory: CssRuntimeFactory,
	presetSource?: string,
): string => {
	const attachments = methods.map(attachmentName).join(", ");
	if (factory === CssRuntimeFactoryTag.Unsafe)
		return `export const createUnsafeCss = (options = {}) => createCssRuntime(options, [${attachments}]);`;
	const factoryName =
		factory === CssRuntimeFactoryTag.Design ? "createDesignCssRuntime" : "createPresetCssRuntime";
	const exportName =
		factory === CssRuntimeFactoryTag.Design
			? "createDesignCss"
			: factory === CssRuntimeFactoryTag.Generated
				? "createGeneratedCss"
				: "createCss";
	const preset = presetSource ?? "preset";
	return `export const ${exportName} = (preset, options = {}) => ${factoryName}(${preset}, options, [${attachments}]);`;
};

const renderTypedRuntime = (methods: readonly CssRuntimeMethod[]): string[] => {
	const methodType =
		methods.length === 0 ? "never" : methods.map((method) => `"${method}"`).join(" | ");
	return [
		'import type { CssFn, CreateCssOptions } from "yumcss/unsafe/css";',
		'import type { StyleObject } from "yumcss/types/typings";',
		"",
		`type GeneratedCssFn<TStyles extends StyleObject> = ((...styles: Array<TStyles>) => ReturnType<CssFn<TStyles>>) & Pick<CssFn<TStyles>, ${methodType}>;`,
		"",
		"export const createUnsafeCss = (options: CreateCssOptions = {}): GeneratedCssFn<StyleObject> =>",
		"	createCssRuntime(options, [ATTACHMENTS]) as unknown as GeneratedCssFn<StyleObject>;",
	];
};

/** Render a deterministic specialized `createUnsafeCss` module. */
export const renderCssRuntimeModule = (
	methods: readonly string[],
	options: RenderCssRuntimeModuleOptions = {},
): string => {
	const normalized = normalizeCssRuntimeMethods(methods);
	const factory = options.factory ?? CssRuntimeFactoryTag.Unsafe;
	const lines = renderRuntimeImports(normalized, factory);
	if (options.typed === true) {
		if (factory !== CssRuntimeFactoryTag.Unsafe)
			throw new Error("Typed CSS runtime modules only support createUnsafeCss.");
		lines.push(
			"",
			...renderTypedRuntime(normalized).map((line) =>
				line.replace("ATTACHMENTS", normalized.map(attachmentName).join(", ")),
			),
		);
	} else {
		lines.push(renderRuntimeFactory(normalized, factory, options.presetSource));
	}
	return `${lines.join("\n")}\n`;
};
