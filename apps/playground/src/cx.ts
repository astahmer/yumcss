import { createCx } from "pandwind/cx";
import type { CssFn } from "pandwind/css";
import { css } from "./design.ts";
import { __pandwindConfig as cfg } from "./tw.ts";

/** App-level cx(): same generated conflict map the vite plugins fold against. */
export const cx = createCx({
	css: css as unknown as CssFn<never>,
	variants: cfg.variants,
	conflicts: cfg.conflicts,
	compose: cfg.compose,
});
