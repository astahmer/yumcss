import { cva } from "class-variance-authority";
import { dss } from "./design.ts";

/**
 * CVA selects strings that YumCSS has already generated. It does not need
 * to know about tokens or CSS extraction; the statically-authored dss calls
 * remain visible to yumcssExtractVite.
 */
export const cvaButton = cva(dss.class({ $frame: { corners: "lg" } }), {
	variants: {
		size: {
			sm: dss.class({ $frame: { pad: [8, 12] } }),
			lg: dss.class({ $frame: { pad: [12, 20] } }),
		},
	},
	defaultVariants: { size: "sm" },
});
