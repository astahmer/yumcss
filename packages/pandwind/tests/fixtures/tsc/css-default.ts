import { createCss } from "pandwind/css";
import { defaultPreset } from "pandwind/preset/default";

const css = createCss(defaultPreset);

const cards = [
	css.class({
		display: "flex",
		alignItems: "center",
		gap: 2,
		padding: 4,
		color: "#2563eb",
		backgroundColor: "white",
		borderRadius: "md",
	}),
	css.class({
		display: "grid",
		gap: 4,
		padding: 6,
		color: "#171923",
		backgroundColor: "#f7fafc",
		borderRadius: "lg",
		_hover: { color: "#3182ce" },
	}),
	css.class({ display: "flex", gap: 6, padding: 8, color: "#3182ce" }),
	css.class({ display: "grid", gap: 2, padding: 4, color: "#171923" }),
	css.class({ display: "flex", gap: 4, padding: 6, color: "#2563eb" }),
	css.class({ display: "grid", gap: 6, padding: 8, color: "#171923" }),
	css.class({ display: "flex", gap: 2, padding: 4, color: "#3182ce" }),
	css.class({ display: "grid", gap: 4, padding: 6, color: "#171923" }),
	css.class({ display: "flex", gap: 6, padding: 8, color: "#2563eb" }),
	css.class({ display: "grid", gap: 2, padding: 4, color: "#171923" }),
	css.class({ display: "flex", gap: 4, padding: 6, color: "#3182ce" }),
	css.class({ display: "grid", gap: 6, padding: 8, color: "#171923" }),
];

const compiled = css(
	{ display: "flex", padding: 4, gap: 2, color: "#2563eb" },
	{ _hover: { color: "#171923" } },
);
const props = css.props(compiled, css.vars({ color: "var(--card-color)" }));
const raw = css.raw({ padding: 8 }, { margin: 4 });

export const workload = { cards, compiled, props, raw };
