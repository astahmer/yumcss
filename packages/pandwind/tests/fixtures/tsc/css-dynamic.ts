import { createCss } from "pandwind/css";
import { createUnsafeCss } from "pandwind/unsafe/css";
import { defaultPreset } from "pandwind/preset/default";

const css = createCss(defaultPreset);
const unsafeCss = createUnsafeCss();

type BannerInput = { color: string; padding: string };

const groups = unsafeCss.group({
	card: { display: "flex", padding: 8, borderRadius: 6 },
	gap: (value: number) => ({ gap: value }),
	banner: {
		$input: {} as BannerInput,
		color: unsafeCss.input("color"),
		padding: unsafeCss.input("padding"),
	},
});

const staticClass = unsafeCss.class({ display: "flex", padding: 8 });
const typedVariables = css.vars({ color: "var(--typed-color)", padding: 4 });
const openVariables = unsafeCss.vars({
	color: "var(--open-color)",
	padding: "var(--open-padding)",
});
const dynamicBanner = groups.banner({ color: "tomato", padding: "12px" });
const props = unsafeCss.props(staticClass, typedVariables, openVariables, dynamicBanner);
const merged = unsafeCss.raw({ color: "red" }, { padding: 8 }, { _hover: { color: "blue" } });

export const workload = {
	card: groups.card,
	gap: groups.gap(12),
	dynamicBanner,
	props,
	merged,
};
