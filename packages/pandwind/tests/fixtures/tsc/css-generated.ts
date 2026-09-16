import { firstThatWorks } from "pandwind/css";
import { css } from "../generated-css.ts";

const groups = css.group({
	card: { display: "flex", padding: 8, color: "$blue-600" },
	gap: (value: number) => ({ gap: value }),
});

const compiled = css(
	{ display: "grid", padding: 4, color: "colorPalette.solid", colorPalette: "brand" },
	{ _hover: { color: "$white" }, md: { padding: 8 } },
);
const className = css.class({
	padding: firstThatWorks("1rem", "0.5rem", 4),
	color: "$blue-500",
});
const variables = css.vars({ color: "var(--runtime-color)", padding: 12 });
const props = css.props(compiled, variables, groups.card, groups.gap(6));
const raw = css.raw({ margin: 4 }, { padding: 8 });

export const workload = { className, compiled, props, raw, variables };
