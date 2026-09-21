import { createDesignCss } from "pandwind/design";
import { examplePreset } from "@pandwind/example-preset";

const css = createDesignCss(examplePreset);

export const card = (tone: "blue" | "red") =>
	css.class({
		$frame: {
			fill: tone === "blue" ? "$blue-500" : "$red-500",
			pad: 8,
		},
	});
