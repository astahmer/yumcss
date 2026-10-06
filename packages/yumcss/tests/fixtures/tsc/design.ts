import { createDesignCss } from "yumcss/design";
import { preset } from "./css-custom.ts";

const dss = createDesignCss(preset);

const cards = [
	dss.class({
		$frame: { w: "20", corners: "md", fill: "$blue-500", pad: [4, 8] },
		$layout: { flow: "stackY", gap: 4, align: "center" },
		$text: { size: "lg", weight: "bold", color: "$gray-900" },
	}),
	dss.class({
		$frame: { w: "50%", corners: "lg", fill: "$gray-50", pad: 6 },
		$layout: { flow: "stackX", gap: 2 },
		$text: { size: "md", weight: "medium" },
		_hover: { $frame: { fill: "$blue-600" } },
	}),
	dss.class({ $frame: { fill: "$blue-500", pad: 2 } }),
	dss.class({ $frame: { fill: "$gray-50", pad: 4 } }),
	dss.class({ $frame: { fill: "$blue-600", pad: 6 } }),
	dss.class({ $frame: { fill: "$gray-50", pad: 8 } }),
	dss.class({ $frame: { fill: "$blue-500", pad: 2 } }),
	dss.class({ $frame: { fill: "$gray-50", pad: 4 } }),
];

const compiled = dss(
	{ $frame: { fill: "$blue-500", pad: [4, 8], corners: "md" } },
	{ $layout: { flow: "stackY", gap: 4 }, $text: { color: "$gray-900" } },
	{ _dark: { $frame: { fill: "$gray-900" } } },
);
const props = dss.props(compiled);
const variables = dss.vars({ $raw: { color: "var(--runtime-color)" } });
const raw = dss.raw({ $raw: { animation: "fade-in 1s ease" } });

export const workload = { cards, compiled, props, variables, raw };
