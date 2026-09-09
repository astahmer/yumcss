import { createCss } from "pandwind/css";
import { createRuntimeCss } from "pandwind/css/runtime";
import { examplePreset } from "@pandwind/example-preset";

/**
 * Strict preset-bound CSS. Tokens and the configured condition names are part
 * of the inferred style object, so invalid values fail in the editor.
 */
export const css = createCss(examplePreset);

/**
 * The explicit runtime-sheet variant. Prefer `css` above in applications
 * using `pandwindCssVite`: `css.vars()` and `css.input()` keep runtime values
 * inline while the plugin emits their value-independent rules. Use this
 * variant when code must register CSS without a build-time extractor, or when
 * the caller needs the `sheet` for SSR extraction, hydration, or inspection.
 */
export const runtimeCss = createRuntimeCss(examplePreset);

/**
 * The same token and condition vocabulary with strict values relaxed. This
 * is useful when a component needs a CSS value that is not a named token.
 */
const relaxedPreset = { ...examplePreset, strict: false as const };
export const relaxedCss = createCss(relaxedPreset);

/** Untyped convenience form for deliberately open-ended CSS objects. */
export const untypedCss = createCss();
