import { createCx } from "pandwind/cx";
import { css } from "./css.ts";
import { __pandwindConfig as cfg } from "./tw.ts";

/** App-level cx(): same generated conflict map the vite plugins fold against. */
export const cx = createCx({
	css: css,
	variants: cfg.variants,
	conflicts: cfg.conflicts,
	compose: cfg.compose,
});
