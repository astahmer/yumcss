import { createCx } from "pandwind/cx";
import { dss } from "./css.ts";
import { __pandwindRuntimeConfig as cfg } from "./tw.runtime.ts";

/**
 * Playground-only exact Tailwind conflict demo. Normal app code should use
 * createCx({ css }) unless arbitrary runtime strings need this catalog.
 */
export const cx = createCx({
	css: dss,
	variants: cfg.variants,
	conflicts: cfg.conflicts,
	compose: cfg.compose,
});
