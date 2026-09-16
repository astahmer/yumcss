import { createCss } from "pandwind/css";
import { createRuntimeCss } from "pandwind/css/runtime";
import { createCx } from "pandwind/cx";
import { createDesignCss } from "pandwind/design";
import { createStackClassName, stackClasses } from "pandwind/stack";
import { createTw } from "pandwind/tw";
import { preset } from "./css-custom.ts";

const css = createCss(preset);
const dss = createDesignCss(preset);
const runtimeCss = createRuntimeCss(preset, { sheetOptions: { autoMount: false } });
const cx = createCx({ css });
const stackClassName = createStackClassName(css);

type AppUtilities = {
	display?: "flex" | "grid";
	bg?: "blue-600" | "gray-50";
	text?: "gray-900" | "white";
	p?: "4" | "6" | "8";
	sm?: { p?: "6" | "8" };
};

const tw = createTw<AppUtilities>({
	variants: { sm: { join: ":" } },
	conflicts: {
		bg: { "*": ["background-color"] },
		text: { "*": ["color"] },
		p: { "*": ["padding"] },
	},
});

const renderButton = (disabled: boolean) => {
	const atom = css({
		display: "flex",
		alignItems: "center",
		gap: 4,
		padding: disabled ? 6 : 4,
		color: disabled ? "$gray-900" : "$blue-600",
		backgroundColor: disabled ? "$gray-50" : "colorPalette.solid",
		colorPalette: disabled ? undefined : "brand",
		_hover: { backgroundColor: "$blue-500" },
	});
	const className = cx(
		tw({ display: "flex", bg: disabled ? "gray-50" : "blue-600", p: "4", sm: { p: "6" } }),
		atom,
		dss.class({ $frame: { corners: "md" }, $text: { weight: "bold" } }),
		disabled && "opacity-50",
	);
	const runtimeProps = runtimeCss.props(
		runtimeCss.vars({ color: "var(--button-color)" }),
		className,
	);
	const designProps = dss.props(
		dss({ $frame: { fill: "$blue-500", pad: [4, 8] }, $text: { color: "$gray-900" } }),
	);
	const stack = stackClassName({ direction: "row", gap: 4, align: "center" });
	return { className, runtimeProps, designProps, stack, utility: stackClasses({ gap: 4 }) };
};

export const workload = [
	renderButton(false),
	renderButton(true),
	renderButton(false),
	renderButton(true),
	renderButton(false),
	renderButton(true),
	renderButton(false),
	renderButton(true),
];
