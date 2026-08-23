import { createCx } from "pandwind/cx";
import type { CssFn } from "pandwind/css";
import { css } from "./design";
import { __pandwindConfig as cfg } from "./tw";

/**
 * App-level cx(): merges raw strings, tw() output and css() atoms with the
 * SAME generated conflict map the vite plugins fold against. The vite pass
 * (see vite.config.ts) folds literal cx() calls in this file at build time —
 * including imported constants and css() atoms.
 */
export const cx = createCx({
	css: css as unknown as CssFn<never>,
	variants: cfg.variants,
	conflicts: cfg.conflicts,
	compose: cfg.compose,
});
