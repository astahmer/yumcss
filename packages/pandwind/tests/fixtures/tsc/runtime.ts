import { createRuntimeCss, createRuntimeDesignCss } from "pandwind/css/runtime";
import { preset } from "./css-custom.ts";

const css = createRuntimeCss(preset, { sheetOptions: { autoMount: false } });
const dss = createRuntimeDesignCss(preset, { sheetOptions: { autoMount: false } });

const classes = [
	css.class({ display: "flex", color: "$blue-500", padding: 4 }),
	css.class({ display: "grid", color: "$gray-900", padding: 6 }),
	css.class({ display: "flex", color: "$blue-600", padding: 8 }),
	css.class({ display: "grid", color: "$gray-900", padding: 2 }),
	css.class({ display: "flex", color: "$blue-500", padding: 4 }),
	css.class({ display: "grid", color: "$gray-900", padding: 6 }),
	css.class({ display: "flex", color: "$blue-600", padding: 8 }),
	css.class({ display: "grid", color: "$gray-900", padding: 2 }),
];

const compiled = css({ color: "$blue-500", padding: 4 }, { _hover: { color: "$blue-600" } });
const variables = css.vars({ color: "var(--runtime-color)", padding: 6 });
const props = css.props(compiled, variables);
const designClass = dss.class({
	$frame: { fill: "$blue-500", corners: "md", pad: [4, 8] },
	$layout: { flow: "stackY", gap: 4 },
});

export const workload = {
	classes,
	compiled,
	props,
	designClass,
	stylesheet: css.sheet.css(),
};
