import { createUnsafeCss } from "pandwind/unsafe/css";

const css = createUnsafeCss({
	conditions: { _hover: "&:hover", md: "@media (min-width: 768px)" },
});

type BannerInput = { color: string; padding: string };

const groups = css.group({
	card: { display: "flex", padding: 8 },
	gap: (value: number) => ({ gap: value }),
	banner: {
		$input: {} as BannerInput,
		color: css.input("color"),
		padding: css.input("padding"),
	},
});

const compiled = css(
	{ display: "flex", color: "tomato", padding: 8 },
	{ _hover: { color: "blue" }, md: { padding: 12 } },
);
const className = css.class({ display: "grid", color: "rebeccapurple" });
const variables = css.vars({ color: "var(--open-color)", padding: "var(--open-padding)" });
const props = css.props(compiled, variables, groups.banner({ color: "tomato", padding: "12px" }));
const raw = css.raw({ animation: "fade-in 1s ease" });

export const workload = {
	className,
	compiled,
	gap: groups.gap(12),
	props,
	raw,
	variables,
};
