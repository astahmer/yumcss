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

/** Complete runtime CSS surface, including its attached stylesheet.
 *
 * Runtime styles may contain values and properties discovered from another
 * styling system, so keep the preset-aware overload while also exposing the
 * neutral `StyleObject` overload used by migration output. The compile-time
 * `createCss(preset)` surface remains strict and token-aware.
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
	let tokensSynced = false;
	let pendingStyles: StyleObject[] = [];
	const pendingStyleIds = new Set<string>();
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
		const added = stylesheet.process(styles);
		sync(Array.from(added.values()));
	};
	const syncVars = (keys: readonly string[]): void => {
		flush();
		const newRules: RuntimeRule[] = [];
		for (const key of keys) {
			const rule = stylesheet.processVarKey(key);
			if (rule !== undefined) newRules.push(rule);
		}
		if (newRules.length > 0) sync(newRules);
	};
	const authoredStrategy = cssOptions.className;
	const runtimeStrategy: ClassNameStrategy = {
		name: authoredStrategy?.name ?? "runtime",
		sheetBacked: authoredStrategy?.sheetBacked,
		toClassName: (key, value) => {
			const id = `${key}\u0000${value}`;
			if (!pendingStyleIds.has(id)) {
				pendingStyleIds.add(id);
				pendingStyles.push({ [key]: value } as StyleObject);
			}
			return authoredStrategy?.toClassName(key, value) ?? null;
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
				const keys: string[] = [];
				for (const atom of output[VARS_ATOMS] ?? []) {
					keys.push(...atom.keys);
				}
				syncVars(keys);
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

/** Create the full runtime CSS-in-JS engine for a preset. */
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

/** Design-vocabulary equivalent of {@link createRuntimeCss}. */
export function createRuntimeDesignCss<TPreset extends DesignPreset>(
	preset: TPreset,
	options: RuntimeCssOptions = {},
): RuntimeCssFn<DesignStyleObject<TPreset>> {
	const runtime = runtimeOptions(preset, options);
	const css = createDesignCss(preset, runtime.cssOptions) as CssFn<DesignStyleObject<TPreset>>;
	runtime.registerVars(css as unknown as CssFn<StyleObject>);
	const flushed = withRuntimeFlush(css as unknown as CssFn<StyleObject>, runtime);
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
