import { createCss } from "pandwind/css";
// The shipped default preset carries no palette, so this scenario resolves the
// shared fixture preset's named color tokens instead of authored literals.
import { fixturePreset } from "../fixture-preset.ts";

const css = createCss(fixturePreset);

const cards = [
	css.class({
		display: "flex",
		alignItems: "center",
		gap: 2,
		padding: 4,
		color: "blue.600",
		backgroundColor: "white",
		borderRadius: "md",
	}),
	css.class({
		display: "grid",
		gap: 4,
		padding: 6,
		color: "gray.900",
		backgroundColor: "gray.50",
		borderRadius: "lg",
		_hover: { color: "blue.500" },
	}),
	css.class({ display: "flex", gap: 6, padding: 8, color: "blue.500" }),
	css.class({ display: "grid", gap: 2, padding: 4, color: "gray.900" }),
	css.class({ display: "flex", gap: 4, padding: 6, color: "blue.600" }),
	css.class({ display: "grid", gap: 6, padding: 8, color: "gray.900" }),
	css.class({ display: "flex", gap: 2, padding: 4, color: "blue.500" }),
	css.class({ display: "grid", gap: 4, padding: 6, color: "gray.900" }),
	css.class({ display: "flex", gap: 6, padding: 8, color: "blue.600" }),
	css.class({ display: "grid", gap: 2, padding: 4, color: "gray.900" }),
	css.class({ display: "flex", gap: 4, padding: 6, color: "blue.500" }),
	css.class({ display: "grid", gap: 6, padding: 8, color: "gray.900" }),
];

const compiled = css(
	{ display: "flex", padding: 4, gap: 2, color: "blue.600" },
	{ _hover: { color: "gray.900" } },
);
const props = css.props(compiled, css.vars({ color: "var(--card-color)" }));
const raw = css.raw({ padding: 8 }, { margin: 4 });

export const workload = { cards, compiled, props, raw };
