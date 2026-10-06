/**
 * Full runtime CSS-in-JS entry point.
 *
 * Kept separate from `yumcss/css` so applications using only extracted
 * atoms do not pay for the stylesheet compiler in their browser bundle.
 */
import { createRuntimeStylesheet } from "./runtime-stylesheet.ts";
import { createCss, type CreateCssOptions, type CssFn } from "./create-css.ts";
import {
	createRuntimeSheet,
	type RuntimeRule,
	type RuntimeSheet,
	type RuntimeSheetOptions,
} from "./runtime-sheet.ts";
export type {
	RuntimeDocument,
	RuntimeOrderingPolicy,
	RuntimeRuleCanonicalizer,
	RuntimeRuleSerializer,
	RuntimeStyleElementSink,
} from "./runtime-sheet-contracts.ts";
export { RuntimeSemanticRuleKindTag } from "./runtime-sheet-contracts.ts";
import type { VarAtom } from "./var-compiler.ts";
import { VARS_ATOMS } from "./vars-carrier.ts";
import type { ClassNameStrategy } from "./class-name-strategy.ts";
import {
	createDesignCss,
	type DesignDynamicStyleObject,
	type DesignPreset,
	type DesignStyleObject,
} from "../design/index.ts";
import type {
	AnyCssConfig,
	AnyTokens,
	CssConfigReturn,
	DefinePresetOptions,
	DynamicStyleObject,
	StyleObject,
	TypedDynamicStyleObject,
	TypedRawStyleObject,
	TypedStyleObject,
} from "../types/typings.ts";

type RuntimeDeclaration = { key: string; value: string };

/**
 * Options for the runtime CSS lane and its live stylesheet.
 *
 * Supply a `sheet` when server and client code must share or hydrate one
 * explicit sheet. Otherwise the runtime creates or reuses its default sheet.
 *
 * @category runtime
 * @since 0.1.0
 */
export interface RuntimeCssOptions extends CreateCssOptions {
	/** Reuse a sheet across multiple css instances. */
	readonly sheet?: RuntimeSheet;
	/** Options for the automatically-created sheet. */
	readonly sheetOptions?: RuntimeSheetOptions;
}

type OpenRuntimeStyleValue =
	| string
	| number
	| null
	| undefined
	| OpenRuntimeStyleObject
	| readonly OpenRuntimeStyleValue[];
type OpenRuntimeStyleObject = {
	readonly [property: string]: OpenRuntimeStyleValue;
} & { readonly colorPalette?: never };
type OpenRuntimeDynamicStyleValue =
	| string
	| number
	| boolean
	| null
	| undefined
	| OpenRuntimeDynamicStyleObject
	| readonly OpenRuntimeDynamicStyleValue[];
type OpenRuntimeDynamicStyleObject = {
	readonly [property: string]: OpenRuntimeDynamicStyleValue;
} & { readonly colorPalette?: never };

/**
 * Complete runtime CSS surface, including its attached stylesheet.
 *
 * Runtime styles can use the preset-aware surface as well as the open
 * non-palette `StyleObject` overload used by migration output and
 * runtime-discovered values.
 *
 * @typeParam TStyles - The style-object type accepted by the callable surface.
 * @category runtime
 * @since 0.1.0
 */
export type RuntimeCssFn<
	TStyles extends StyleObject = StyleObject,
	TDynamicStyles = DynamicStyleObject,
	TOpenStyles extends StyleObject = OpenRuntimeStyleObject,
	TOpenDynamicStyles = OpenRuntimeDynamicStyleObject,
	TRawStyles extends StyleObject = TStyles,
	TOpenRawStyles extends StyleObject = TOpenStyles,
> = CssFn<TStyles, TDynamicStyles, TRawStyles> &
	CssFn<TOpenStyles, TOpenDynamicStyles, TOpenRawStyles> & {
		readonly sheet: RuntimeSheet;
	};

interface RuntimeBinding {
	sheet: RuntimeSheet;
	cssOptions: CreateCssOptions;
	flush: () => void;
	registerVars: (css: CssFn<StyleObject>) => void;
}

// Browser module-scoped declarations share one artifact across split bundles.
// Server instances stay request-local so one render cannot inherit another's rules.
const sharedSheetsKey = Symbol.for("yumcss.runtime.default-sheet");
type RuntimeGlobal = typeof globalThis & {
	[sharedSheetsKey]?: WeakMap<object, RuntimeSheet>;
};

function runtimeSheetFor(preset: CssConfigReturn, options: RuntimeCssOptions): RuntimeSheet {
	if (options.sheet !== undefined) return options.sheet;
	if (options.sheetOptions !== undefined)
		return createRuntimeSheet({
			...options.sheetOptions,
			...(options.cascade === undefined ? {} : { cascade: options.cascade }),
		});
	if (
		options.className !== undefined ||
		options.debug !== undefined ||
		options.hashFn !== undefined ||
		options.cascade !== undefined ||
		options.tokenVariableNames !== undefined
	)
		return createRuntimeSheet({ cascade: options.cascade });
	if ((globalThis as { document?: unknown }).document === undefined) return createRuntimeSheet();
	const globalObject = globalThis as RuntimeGlobal;
	const sheets = globalObject[sharedSheetsKey] ?? new WeakMap<object, RuntimeSheet>();
	globalObject[sharedSheetsKey] = sheets;
	const existing = sheets.get(preset);
	if (existing !== undefined) return existing;
	const sheet = createRuntimeSheet();
	sheets.set(preset, sheet);
	return sheet;
}

function runtimeOptions(preset: CssConfigReturn, options: RuntimeCssOptions): RuntimeBinding {
	const sheet = runtimeSheetFor(preset, options);
	const { sheet: _sheet, sheetOptions: _sheetOptions, ...cssOptions } = options;
	const stylesheet = createRuntimeStylesheet(preset, cssOptions);
	let tokensSynced = false;
	let pendingStyles: RuntimeDeclaration[] = [];
	const pendingStyleIds = new Set<string>();
	const registeredVarKeys = new Set<string>();
	const sync = (rules: readonly RuntimeRule[] = []): void => {
		if (!tokensSynced) {
			const tokens = stylesheet.gen.tokens();
			if (tokens.length > 0) sheet.setTokens(tokens);
			tokensSynced = true;
		}
		if (rules.length > 0) sheet.register(rules);
	};
	const flush = (): void => {
		if (pendingStyles.length === 0) return;
		const styles = pendingStyles;
		pendingStyles = [];
		const added = stylesheet.processPrepared(styles);
		sync(Array.from(added.values()));
	};
	const syncVars = (varAtoms: readonly VarAtom[]): void => {
		let needsRegistration = false;
		for (const atom of varAtoms) {
			for (const key of atom.keys) {
				if (!registeredVarKeys.has(key)) {
					needsRegistration = true;
					break;
				}
			}
			if (needsRegistration) break;
		}
		// vars() does not enqueue atomic declarations. Once every structural
		// key has its toggle rule, there is no sheet work left to flush.
		if (!needsRegistration) return;
		flush();
		const newRules: RuntimeRule[] = [];
		for (const atom of varAtoms) {
			for (const key of atom.keys) {
				if (registeredVarKeys.has(key)) continue;
				const rule = stylesheet.processVarKey(key);
				registeredVarKeys.add(key);
				if (rule !== undefined) newRules.push(rule);
			}
		}
		if (newRules.length > 0) sync(newRules);
	};
	const authoredStrategy = cssOptions.className;
	const runtimeStrategy: ClassNameStrategy = {
		name: authoredStrategy?.name ?? "runtime",
		sheetBacked: authoredStrategy?.sheetBacked ?? true,
		toClassName: (key, value) => {
			const custom = authoredStrategy?.toClassName(key, value);
			const hasCustomClass =
				typeof custom === "string" &&
				custom.length > 0 &&
				// oxlint-disable-next-line no-control-regex -- Class tokens reject whitespace and NUL.
				!/[\s\u0000]/.test(custom);
			if (hasCustomClass && authoredStrategy?.sheetBacked !== true) return custom;
			const id = `${key}\u0000${value}`;
			if (!pendingStyleIds.has(id)) {
				pendingStyleIds.add(id);
				pendingStyles.push({ key, value });
			}
			return hasCustomClass ? custom : null;
		},
	};
	return {
		sheet,
		cssOptions: { ...cssOptions, className: runtimeStrategy },
		flush,
		registerVars: (css) => {
			const vars = css.vars;
			css.vars = (...styles) => {
				const output = vars(...styles);
				syncVars(output[VARS_ATOMS] ?? []);
				return output;
			};
		},
	};
}

/**
 * A compiled call can discover several atomic rules before the caller needs
 * the result. Keep those discoveries together so a runtime sheet orders and
 * serializes the stylesheet once per public call instead of once per
 * declaration.
 */
function withRuntimeFlush(css: CssFn<StyleObject>, runtime: RuntimeBinding): CssFn<StyleObject> {
	const original = css;
	const flushed = ((...styles: Array<StyleObject>) => {
		try {
			return original(...styles);
		} finally {
			runtime.flush();
		}
	}) as CssFn<StyleObject>;
	Object.assign(flushed, original);
	flushed.class = (...styles: Array<StyleObject>) => {
		try {
			return original.class(...styles);
		} finally {
			runtime.flush();
		}
	};
	const group = original.group as (groups: Record<string, unknown>) => unknown;
	flushed.group = ((groups: Record<string, unknown>) => {
		try {
			return group(groups);
		} finally {
			runtime.flush();
		}
	}) as typeof flushed.group;
	return flushed;
}

/**
 * Create a CSS function that registers rules in a live {@link RuntimeSheet}.
 *
 * Unlike `createCss`, this lane registers discovered rules in the live sheet,
 * which makes it the boundary for browser runtime styles, SSR/hydration, and
 * migration output that cannot be fully extracted ahead of time.
 *
 * @example
 * ```ts
 * import { createRuntimeCss, createRuntimeSheet } from "yumcss/css/runtime";
 * import { examplePreset } from "@yumcss/example-preset";
 *
 * const sheet = createRuntimeSheet({ autoMount: false });
 * const css = createRuntimeCss(examplePreset, { sheet });
 * const className = css.class({ color: "$blue-500" });
 *
 * const emittedCss = sheet.css();
 * ```
 *
 * @typeParam TPreset - The preset supplying property, token, and condition types.
 * @param preset - The typed preset used to resolve runtime tokens.
 * @param options - Runtime sheet and CSS backend options.
 * @returns A CSS function with a live `sheet` property.
 * @category runtime
 * @since 0.1.0
 */
export function createRuntimeCss<
	TPreset extends CssConfigReturn<DefinePresetOptions<AnyCssConfig, AnyTokens>>,
>(
	preset: TPreset,
	options: RuntimeCssOptions = {},
): RuntimeCssFn<
	TypedStyleObject<TPreset>,
	TypedDynamicStyleObject<TPreset>,
	OpenRuntimeStyleObject,
	OpenRuntimeDynamicStyleObject,
	TypedRawStyleObject<TPreset>,
	OpenRuntimeStyleObject
> {
	const runtime = runtimeOptions(preset, options);
	const css = createCss(preset, runtime.cssOptions) as CssFn<TypedStyleObject<TPreset>>;
	runtime.registerVars(css as CssFn<StyleObject>);
	const flushed = withRuntimeFlush(css as CssFn<StyleObject>, runtime);
	return Object.assign(flushed, { sheet: runtime.sheet }) as RuntimeCssFn<
		TypedStyleObject<TPreset>,
		TypedDynamicStyleObject<TPreset>,
		OpenRuntimeStyleObject,
		OpenRuntimeDynamicStyleObject,
		TypedRawStyleObject<TPreset>,
		OpenRuntimeStyleObject
	>;
}

/**
 * Create a runtime CSS function for the design vocabulary.
 *
 * This is the runtime equivalent of {@link createDesignCss}: it resolves the
 * design modules and registers their resulting rules in the live sheet.
 *
 * @example
 * ```ts
 * import { createRuntimeDesignCss, createRuntimeSheet } from "yumcss/css/runtime";
 * import { examplePreset } from "@yumcss/example-preset";
 *
 * const sheet = createRuntimeSheet({ autoMount: false });
 * const dss = createRuntimeDesignCss(examplePreset, { sheet });
 * dss.class({ $frame: { fill: "$blue-500", pad: 16 } });
 * ```
 *
 * @typeParam TPreset - The design-compatible preset.
 * @param preset - The typed preset used by the design resolver.
 * @param options - Runtime sheet and CSS backend options.
 * @returns A design-vocabulary runtime CSS function.
 * @category runtime
 * @since 0.1.0
 */
export function createRuntimeDesignCss<TPreset extends DesignPreset>(
	preset: TPreset,
	options: RuntimeCssOptions = {},
): RuntimeCssFn<
	DesignStyleObject<TPreset>,
	DesignDynamicStyleObject<TPreset>,
	DesignStyleObject<TPreset>,
	DesignDynamicStyleObject<TPreset>
> {
	const runtime = runtimeOptions(preset, options);
	const dss = createDesignCss(preset, runtime.cssOptions) as CssFn<DesignStyleObject<TPreset>>;
	runtime.registerVars(dss as CssFn<StyleObject>);
	const flushed = withRuntimeFlush(dss as CssFn<StyleObject>, runtime);
	return Object.assign(flushed, { sheet: runtime.sheet }) as RuntimeCssFn<
		DesignStyleObject<TPreset>,
		DesignDynamicStyleObject<TPreset>,
		DesignStyleObject<TPreset>,
		DesignDynamicStyleObject<TPreset>
	>;
}

export { createRuntimeSheet } from "./runtime-sheet.ts";
export type {
	RuntimeDeclaration,
	RuntimeRule,
	RuntimeSemanticRule,
	RuntimeSemanticRuleKind,
	RuntimeSheet,
	RuntimeSheetOptions,
	RuntimeSheetSnapshot,
} from "./runtime-sheet.ts";
