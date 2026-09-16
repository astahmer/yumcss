import { createCx } from "pandwind/cx";
import { dss } from "./css.ts";
import { __pandwindRuntimeConfig as cfg } from "./tw.runtime.ts";

/** App-level cx(): same generated conflict map the vite plugins fold against. */
export const cx = createCx({
	css: dss,
	variants: cfg.variants,
	conflicts: cfg.conflicts,
	compose: cfg.compose,
});
