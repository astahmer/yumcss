/**
 * Full runtime CSS-in-JS entry point.
 *
 * Kept separate from `pandwind/css` so applications using only extracted
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
import { createDesignCss, type DesignPreset, type DesignStyleObject } from "../design/index.ts";
import type {
	AnyCssConfig,
	AnyTokens,
	CssConfigReturn,
	DefinePresetOptions,
	StyleObject,
	TypedStyleObject,
} from "../types/typings.ts";

type RuntimeDeclaration = { key: string; value: string };

/**
 * Options for the runtime CSS lane, which owns a live stylesheet in addition
 * to the normal `CssFn` projections.
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

/**
 * Complete runtime CSS surface, including its attached stylesheet.
 *
 * Runtime styles may contain values and properties discovered from another
 * styling system, so keep the preset-aware overload while also exposing the
 * neutral `StyleObject` overload used by migration output. The compile-time
 * `createCss(preset)` surface remains strict and token-aware.
 *
 * @typeParam TStyles - The style-object type accepted by the callable surface.
 * @category runtime
 * @since 0.1.0
 */
export type RuntimeCssFn<TStyles extends StyleObject = StyleObject> = CssFn<TStyles> &
	CssFn<StyleObject> & {
		readonly sheet: RuntimeSheet;
	};

interface RuntimeBinding {
	sheet: RuntimeSheet;
	cssOptions: CreateCssOptions;
	flush: () => void;
	registerVars: (css: CssFn<StyleObject>) => void;
}

// Module-scoped style declarations are common in codemod output. Reusing the
// default sheet keeps those declarations in one artifact instead of allowing
// each module to overwrite the same `data-pandwind-sheet` element. The global
// symbol also joins duplicate runtime copies emitted by split bundles.
const sharedSheetsKey = Symbol.for("pandwind.runtime.default-sheet");
type RuntimeGlobal = typeof globalThis & {
	[sharedSheetsKey]?: WeakMap<object, RuntimeSheet>;
};

function runtimeSheetFor(preset: CssConfigReturn, options: RuntimeCssOptions): RuntimeSheet {
	if (options.sheet !== undefined) return options.sheet;
	if (options.sheetOptions !== undefined) return createRuntimeSheet(options.sheetOptions);
	if (
		options.className !== undefined ||
		options.debug !== undefined ||
		options.hashFn !== undefined
	)
		return createRuntimeSheet();
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
			sheet.setTokens(stylesheet.gen.tokens());
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
		sheetBacked: authoredStrategy?.sheetBacked,
		toClassName: (key, value) => {
			const custom = authoredStrategy?.toClassName(key, value);
			const hasCustomClass =
			typeof custom === "string" && custom.length > 0 && !/[\s\u0000]/.test(custom);
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
	const group = original.group as unknown as (groups: Record<string, unknown>) => unknown;
	flushed.group = ((groups: Record<string, unknown>) => {
		try {
			return group(groups);
		} finally {
			runtime.flush();
		}
	}) as unknown as typeof flushed.group;
	return flushed;
}

/**
 * Create the full runtime CSS-in-JS engine for a preset.
 *
 * Unlike `createCss`, this lane registers discovered rules in a live
 * {@link RuntimeSheet}. It is the right boundary for browser runtime styles,
 * SSR/hydration, and migration output that cannot be fully extracted ahead of
 * time.
 *
 * @example Runtime CSS with an explicit sheet
 * ```ts
 * import { createRuntimeCss, createRuntimeSheet } from "pandwind/css/runtime";
 * import { examplePreset } from "@pandwind/example-preset";
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
 * @returns A preset-aware CSS function with a live `sheet` property.
 * @category runtime
 * @since 0.1.0
 */
export function createRuntimeCss<
	TPreset extends CssConfigReturn<DefinePresetOptions<AnyCssConfig, AnyTokens>>,
>(
	preset: TPreset,
	options: RuntimeCssOptions = {},
): RuntimeCssFn<TypedStyleObject<TPreset["_config"], TPreset["tokens"], TPreset>> {
	const runtime = runtimeOptions(preset, options);
	const css = createCss({ ...runtime.cssOptions, conditions: preset.conditions }) as CssFn<
		TypedStyleObject<TPreset["_config"], TPreset["tokens"], TPreset>
	>;
	runtime.registerVars(css as unknown as CssFn<StyleObject>);
	const flushed = withRuntimeFlush(css as unknown as CssFn<StyleObject>, runtime);
	return Object.assign(flushed, { sheet: runtime.sheet }) as RuntimeCssFn<
		TypedStyleObject<TPreset["_config"], TPreset["tokens"], TPreset>
	>;
}

/**
 * Create the runtime equivalent of {@link createDesignCss}.
 *
 * The returned function resolves `$frame`, `$layout`, and `$text` values and
 * registers the resulting rules in its live sheet.
 *
 * @example
 * ```ts
 * import { createRuntimeDesignCss, createRuntimeSheet } from "pandwind/css/runtime";
 * import { examplePreset } from "@pandwind/example-preset";
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
): RuntimeCssFn<DesignStyleObject<TPreset>> {
	const runtime = runtimeOptions(preset, options);
	const dss = createDesignCss(preset, runtime.cssOptions) as CssFn<DesignStyleObject<TPreset>>;
	runtime.registerVars(dss as unknown as CssFn<StyleObject>);
	const flushed = withRuntimeFlush(dss as unknown as CssFn<StyleObject>, runtime);
	return Object.assign(flushed, { sheet: runtime.sheet }) as RuntimeCssFn<
		DesignStyleObject<TPreset>
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
