import { createCss } from "pandwind/css";
import { createRuntimeCss } from "pandwind/css/runtime";
import { examplePreset } from "@pandwind/example-preset";

/**
 * Strict preset-bound CSS. Tokens and the configured condition names are part
 * of the inferred style object, so invalid values fail in the editor.
 */
export const css = createCss(examplePreset);

/**
 * The runtime-sheet variant. Use this when a style group carries values that
 * are supplied at render time through `input()`.
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
