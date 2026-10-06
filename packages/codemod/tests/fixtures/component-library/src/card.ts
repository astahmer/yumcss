import { createDesignCss } from "yumcss/design";
import { examplePreset } from "@yumcss/example-preset";

const css = createDesignCss(examplePreset);

export const card = (tone: "blue" | "red") =>
	css.class({
		$frame: {
			fill: tone === "blue" ? "$blue-500" : "$red-500",
			pad: 8,
		},
	});
