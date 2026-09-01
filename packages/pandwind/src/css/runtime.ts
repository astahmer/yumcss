/**
 * Full runtime CSS-in-JS entry point.
 *
 * Kept separate from `pandwind/css` so applications using only extracted
 * atoms do not pay for the stylesheet compiler in their browser bundle.
 */
import { createStylesheet } from "./create-stylesheet.ts";
import { createCss, type CreateCssOptions, type CssFn } from "./create-css.ts";
import {
	createRuntimeSheet,
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
import { VARS_ATOMS } from "./var-compiler.ts";
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

export interface RuntimeCssOptions extends CreateCssOptions {
	/** Reuse a sheet across multiple css instances. */
	readonly sheet?: RuntimeSheet;
	/** Options for the automatically-created sheet. */
	readonly sheetOptions?: RuntimeSheetOptions;
}

interface RuntimeBinding {
	sheet: RuntimeSheet;
	cssOptions: CreateCssOptions;
	registerVars: (css: CssFn<StyleObject>) => void;
}

// Module-scoped style declarations are common in codemod output. Reusing the
// default sheet keeps those declarations in one artifact instead of allowing
// each module to overwrite the same `data-pandwind-sheet` element. The global
// symbol also joins duplicate runtime copies emitted by split bundles.
const sharedSheetsKey = Symbol.for("pandwind.runtime.default-sheet");
type RuntimeGlobal = typeof globalThis & {
	[sharedSheetsKey]?: RuntimeSheet;
};

function runtimeSheetFor(options: RuntimeCssOptions): RuntimeSheet {
	if (options.sheet !== undefined) return options.sheet;
	if (options.sheetOptions !== undefined) return createRuntimeSheet(options.sheetOptions);
	const globalObject = globalThis as RuntimeGlobal;
	const existing = globalObject[sharedSheetsKey];
	if (existing !== undefined) return existing;
	const sheet = createRuntimeSheet();
	globalObject[sharedSheetsKey] = sheet;
	return sheet;
}

function runtimeOptions(preset: CssConfigReturn, options: RuntimeCssOptions): RuntimeBinding {
	const sheet = runtimeSheetFor(options);
	const { sheet: _sheet, sheetOptions: _sheetOptions, ...cssOptions } = options;
	const stylesheet = createStylesheet(preset, cssOptions);
	const sync = (): void => {
		sheet.setTokens(stylesheet.gen.tokens());
		sheet.register([...stylesheet.gen.atomicEntries(), ...stylesheet.gen.varEntries()]);
	};
	const authoredStrategy = cssOptions.className;
	const runtimeStrategy: ClassNameStrategy = {
		name: authoredStrategy?.name ?? "runtime",
		sheetBacked: authoredStrategy?.sheetBacked,
		toClassName: (key, value) => {
			stylesheet.process([{ [key]: value } as StyleObject]);
			sync();
			return authoredStrategy?.toClassName(key, value) ?? null;
		},
	};
	return {
		sheet,
		cssOptions: { ...cssOptions, className: runtimeStrategy },
		registerVars: (css) => {
			const vars = css.vars;
			css.vars = (...styles) => {
				const output = vars(...styles);
				for (const atom of output[VARS_ATOMS] ?? []) {
					for (const key of atom.keys) stylesheet.processVarKey(key);
				}
				sync();
				return output;
			};
		},
	};
}

/** Create the full runtime CSS-in-JS engine for a preset. */
export function createRuntimeCss<
	TPreset extends CssConfigReturn<DefinePresetOptions<AnyCssConfig, AnyTokens>>,
>(
	preset: TPreset,
	options: RuntimeCssOptions = {},
): CssFn<TypedStyleObject<TPreset["_config"], TPreset["tokens"], TPreset>> & {
	sheet: RuntimeSheet;
} {
	const runtime = runtimeOptions(preset, options);
	const css = createCss({ ...runtime.cssOptions, conditions: preset.conditions }) as CssFn<
		TypedStyleObject<TPreset["_config"], TPreset["tokens"], TPreset>
	>;
	runtime.registerVars(css as unknown as CssFn<StyleObject>);
	return Object.assign(css, { sheet: runtime.sheet });
}

/** Design-vocabulary equivalent of {@link createRuntimeCss}. */
export function createRuntimeDesignCss<TPreset extends DesignPreset>(
	preset: TPreset,
	options: RuntimeCssOptions = {},
): CssFn<DesignStyleObject<TPreset>> & { sheet: RuntimeSheet } {
	const runtime = runtimeOptions(preset, options);
	const css = createDesignCss(preset, runtime.cssOptions) as CssFn<DesignStyleObject<TPreset>>;
	runtime.registerVars(css as unknown as CssFn<StyleObject>);
	return Object.assign(css, { sheet: runtime.sheet });
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
