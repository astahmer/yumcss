/**
 * Shared per-build engine context — the one place that knows how a literal
 * style object becomes a final class name for THIS build.
 *
 * `yumcssVite` (tw/cx inlining) and `yumcssExtractVite` (stylesheet
 * generation) used to each derive class names independently. That works for
 * hashing alone (the hash is a pure function of key + value), but folding
 * `css()` atoms inside compile-time `cx()` needs the exact same
 * preset + strategy + canonicalization the stylesheet pass uses. This
 * context bundles them once:
 *
 * ```ts
 * const engine = createYumCSSEngineContext({ preset: examplePreset });
 * yumcssVite({ css: { engine } });
 * yumcssExtractVite(css, { engine, root: dir });
 * ```
 *
 * Both plugins stay fully usable without a context (they construct one
 * internally from their own options) — the factory exists so apps can wire
 * both plugins to one configuration source.
 *
 * Class-name derivation mirrors `createStylesheet.processFlatStyles`
 * exactly: design-resolve the literal, flatten, drop the empty condition,
 * sort the remaining path parts, then hash (or apply a sheet-backed
 * strategy). Matching the stylesheet — not the runtime engine's unsorted
 * registration keys — is deliberate: for statically-extracted styles the
 * generated sheet is the shipped truth, and its selectors are what folded
 * atoms must resolve to.
 */
import type { ClassNameStrategy } from "../css/class-name-strategy.ts";
import { createLiteralStyleCompiler, type PreparedStyle } from "./literal-style-compiler.ts";

import type { CssPreset } from "./css-extract.ts";

export interface YumCSSEngineContextOptions {
	preset: CssPreset;
	className?: ClassNameStrategy;
	debug?: boolean;
}

export interface YumCSSEngineContext {
	readonly preset: CssPreset;
	readonly className?: ClassNameStrategy;
	/**
	 * Atom registry populated by {@link foldLiteralStyle}: class name ->
	 * flattened style key. Handing this to `createCx({ css })` lets the
	 * merge resolve folded atoms against other inputs exactly like the
	 * runtime does.
	 */
	readonly registry: import("../css/atoms.ts").AtomRegistry;
	/** Prepared declarations recorded by source while a build-time fold runs. */
	readonly preparedStyles: ReadonlyMap<string, readonly PreparedStyle[]>;
	/**
	 * Compile one literal (design-vocabulary or raw) style object into the
	 * exact class string the stylesheet pass generates rules for. Returns
	 * `null` when the literal cannot be safely folded at build time:
	 * `$input` dynamics, or a class-name strategy that refuses the
	 * declaration. The caller must leave such calls to the runtime.
	 */
	foldLiteralStyle(literal: Record<string, unknown>, source?: string): string | null;
	/** Remove prepared declarations for a source before it is transformed again. */
	clearPreparedStyles(source: string): void;
}

type EngineRefresh = (options: YumCSSEngineContextOptions) => void;

const engineRefreshers = new WeakMap<YumCSSEngineContext, EngineRefresh>();

export const refreshYumCSSEngineContext = (
	context: YumCSSEngineContext,
	options: YumCSSEngineContextOptions,
): boolean => {
	const refresh = engineRefreshers.get(context);
	if (refresh === undefined) return false;
	refresh(options);
	return true;
};

export function createYumCSSEngineContext(
	options: YumCSSEngineContextOptions,
): YumCSSEngineContext {
	let preset = options.preset;
	let className = options.className;
	let debug = options.debug;
	const compiler = createLiteralStyleCompiler({
		preset,
		...(className === undefined ? {} : { className }),
		...(debug === undefined ? {} : { debug }),
	});
	const context: YumCSSEngineContext = {
		get preset() {
			return preset;
		},
		get className() {
			return className;
		},
		registry: compiler.registry,
		preparedStyles: compiler.preparedStyles,
		foldLiteralStyle: compiler.compile.bind(compiler),
		clearPreparedStyles: compiler.clear.bind(compiler),
	};
	engineRefreshers.set(context, (nextOptions) => {
		preset = nextOptions.preset;
		className = nextOptions.className;
		debug = nextOptions.debug ?? debug;
		compiler.refresh({
			preset,
			...(className === undefined ? {} : { className }),
			...(debug === undefined ? {} : { debug }),
		});
	});
	return context;
}
