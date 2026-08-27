import { cva } from "class-variance-authority";
import { dcss } from "./design.ts";

/**
 * CVA selects strings that Pandwind has already generated. It does not need
 * to know about tokens or CSS extraction; the statically-authored dcss calls
 * remain visible to pandwindCssVite.
 */
export const cvaButton = cva(dcss.class({ $frame: { corners: "lg" } }), {
	variants: {
		size: {
			sm: dcss.class({ $frame: { pad: [8, 12] } }),
			lg: dcss.class({ $frame: { pad: [12, 20] } }),
		},
	},
	defaultVariants: { size: "sm" },
});
