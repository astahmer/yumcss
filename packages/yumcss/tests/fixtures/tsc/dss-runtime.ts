import { createRuntimeDesignCss, createRuntimeSheet } from "yumcss/css/runtime";
import { examplePreset } from "@yumcss/example-preset";

const sheet = createRuntimeSheet({ autoMount: false });
const dss = createRuntimeDesignCss(examplePreset, { sheet });

const compiled = dss(
	{ $frame: { fill: "$blue-500", pad: [4, 8], corners: "md" } },
	{ $layout: { flow: "stackY", gap: 4 }, $text: { color: "$gray-900" } },
	{ _dark: { $frame: { fill: "$gray-900" } } },
);
const className = dss.class({ $frame: { fill: "$blue-600", pad: 6 } });
const variables = dss.vars({ $raw: { color: "var(--runtime-color)" } });
const props = dss.props(compiled, variables);

export const workload = { className, compiled, props, sheet, variables };
