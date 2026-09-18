import { createCss } from "pandwind/css";
import { createRuntimeCss } from "pandwind/css/runtime";
import { createCx } from "pandwind/cx";
import { createDesignCss } from "pandwind/design";
import { realWorldPreset } from "./real-world-theme.ts";

const css = createCss(realWorldPreset);
const dss = createDesignCss(realWorldPreset);
const runtimeCss = createRuntimeCss(realWorldPreset, { sheetOptions: { autoMount: false } });
const cx = createCx({ css });

type Tone = "brand" | "positive" | "warning" | "danger" | "info" | "neutral";

const createButton = (tone: Tone, compact: boolean) =>
	css.class({
		display: "inline-flex",
		alignItems: "center",
		$raw: {
			justifyContent: "center",
			transition: "background-color, border-color, color",
		},
		gap: compact ? 2 : 3,
		paddingBlock: compact ? 2 : 3,
		paddingInline: compact ? 3 : 4,
		border: "hairline",
		borderRadius: compact ? "sm" : "md",
		backgroundColor: tone === "neutral" ? "button.secondary.background" : "colorPalette.solid",
		borderColor: tone === "neutral" ? "button.secondary.border" : "colorPalette.solid",
		color: tone === "neutral" ? "button.secondary.foreground" : "colorPalette.contrast",
		colorPalette: tone,
		fontFamily: "sans",
		fontSize: compact ? "sm" : "md",
		fontWeight: "semibold",
		lineHeight: "tight",
		transitionDuration: "normal",
		transitionTimingFunction: "standard",
		_hover: {
			backgroundColor: "colorPalette.emphasized",
			borderColor: "colorPalette.emphasized",
		},
		_focusVisible: { boxShadow: "focus" },
		_disabled: { opacity: 0.5, $raw: { cursor: "not-allowed" } },
		sm: { paddingInline: compact ? 3 : 5 },
		motionReduce: { transitionDuration: "instant" },
	});

const primaryButton = createButton("brand", false);
const secondaryButton = createButton("neutral", false);
const compactButton = createButton("brand", true);
const positiveButton = createButton("positive", false);
const warningButton = createButton("warning", false);
const dangerButton = createButton("danger", false);
const infoButton = createButton("info", false);

const card = css.class({
	display: "grid",
	gap: 4,
	padding: 6,
	backgroundColor: "surfaceRaised",
	border: "hairline",
	borderColor: "border",
	borderRadius: "lg",
	boxShadow: "card",
	color: "text",
	fontFamily: "sans",
	fontSize: "md",
	lineHeight: "normal",
	_hover: { boxShadow: "lg", borderColor: "borderStrong" },
	_dark: { backgroundColor: "surface", borderColor: "borderStrong" },
	lg: { padding: 8, gap: 6 },
});

const elevatedCard = css.class({
	position: "relative",
	width: "full",
	maxWidth: "32",
	padding: 8,
	backgroundColor: "surface",
	borderRadius: "xl",
	boxShadow: "xl",
	color: "textStrong",
	zIndex: "base",
	_dark: { backgroundColor: "surfaceRaised" },
});

const input = css.class({
	display: "block",
	width: "full",
	minHeight: "10",
	paddingBlock: 2,
	paddingInline: 3,
	border: "input",
	borderRadius: "md",
	backgroundColor: "input.background",
	borderColor: "input.border",
	color: "input.foreground",
	fontFamily: "sans",
	fontSize: "md",
	lineHeight: "normal",
	_focus: { borderColor: "input.borderFocus", boxShadow: "focus" },
	_disabled: { backgroundColor: "surfaceSunken", color: "textDisabled" },
	_dark: { backgroundColor: "input.background" },
});

const invalidInput = css.class({
	width: "full",
	padding: 3,
	border: "focus",
	borderRadius: "md",
	backgroundColor: "input.background",
	borderColor: "danger",
	color: "input.foreground",
	boxShadow: "focus",
});

const successBadge = css.class({
	display: "inline-flex",
	alignItems: "center",
	paddingBlock: 1,
	paddingInline: 2,
	borderRadius: "full",
	backgroundColor: "badge.success.background",
	color: "badge.success.foreground",
	fontSize: "xs",
	fontWeight: "bold",
	lineHeight: "tight",
});

const warningBadge = css.class({
	display: "inline-flex",
	alignItems: "center",
	paddingBlock: 1,
	paddingInline: 2,
	borderRadius: "full",
	backgroundColor: "badge.warning.background",
	color: "badge.warning.foreground",
	fontSize: "xs",
	fontWeight: "bold",
	lineHeight: "tight",
});

const dangerBadge = css.class({
	display: "inline-flex",
	alignItems: "center",
	paddingBlock: 1,
	paddingInline: 2,
	borderRadius: "full",
	backgroundColor: "badge.danger.background",
	color: "badge.danger.foreground",
	fontSize: "xs",
	fontWeight: "bold",
	lineHeight: "tight",
});

const navigation = css.class({
	display: "flex",
	alignItems: "center",
	gap: 4,
	paddingBlock: 3,
	paddingInline: 4,
	backgroundColor: "surface",
	borderColor: "border",
	color: "text",
	fontFamily: "sans",
	fontSize: "sm",
	fontWeight: "medium",
	_dark: { backgroundColor: "surfaceRaised" },
	sm: { paddingInline: 6, gap: 6 },
});

const table = css.class({
	width: "full",
	border: "hairline",
	borderColor: "border",
	borderRadius: "lg",
	backgroundColor: "surface",
	color: "text",
	fontSize: "sm",
	lineHeight: "normal",
	$raw: { overflow: "hidden" },
});

const dialog = css.class({
	position: "fixed",
	inset: 0,
	width: "full",
	maxWidth: "32",
	$raw: { margin: "auto" },
	padding: 8,
	backgroundColor: "surface",
	border: "hairline",
	borderColor: "borderStrong",
	borderRadius: "xl",
	boxShadow: "dialog",
	color: "text",
	zIndex: "modal",
	_dark: { backgroundColor: "surfaceRaised" },
});

const toast = css.class({
	position: "fixed",
	inset: 4,
	margin: 0,
	width: "full",
	maxWidth: "24",
	padding: 4,
	backgroundColor: "surfaceRaised",
	border: "hairline",
	borderColor: "borderStrong",
	borderRadius: "lg",
	boxShadow: "lg",
	color: "textStrong",
	zIndex: "toast",
	lg: { $raw: { inset: "auto" }, right: 6, bottom: 6 },
});

const codeBlock = css.class({
	width: "full",
	padding: 4,
	backgroundColor: "surfaceSunken",
	borderRadius: "md",
	color: "textStrong",
	fontFamily: "mono",
	fontSize: "sm",
	lineHeight: "relaxed",
	letterSpacing: "normal",
	$raw: { overflowX: "auto" },
	_dark: { backgroundColor: "surface" },
});

const composedCard = css(
	{
		display: "grid",
		gap: 4,
		padding: 6,
		backgroundColor: "surfaceRaised",
		borderRadius: "lg",
		boxShadow: "card",
		color: "text",
	},
	{ _hover: { boxShadow: "lg", borderColor: "borderStrong" } },
	{ _dark: { backgroundColor: "surface", color: "textStrong" } },
);

const runtimeClass = runtimeCss.class({
	display: "flex",
	gap: 3,
	padding: 4,
	backgroundColor: "colorPalette.subtle",
	colorPalette: "brand",
	color: "colorPalette.contrast",
	_dark: { backgroundColor: "colorPalette.muted" },
});

const runtimeProps = runtimeCss.props(
	runtimeClass,
	runtimeCss.vars({
		color: "var(--runtime-text)",
		backgroundColor: "var(--runtime-surface)",
		padding: "var(--runtime-space)",
	}),
);

const designClass = dss.class({
	$frame: { fill: "$brand-600", pad: [4, 6], corners: "lg" },
	$layout: { flow: "stackY", gap: 4, align: "center" },
	$text: { color: "$neutral-700", size: "md", weight: "medium" },
});

const designProps = dss.props(
	dss(
		{ $frame: { fill: "$neutral-0", pad: [6, 8], corners: "xl" } },
		{ $layout: { flow: "stackY", gap: 6 } },
		{ _dark: { $text: { color: "$neutral-200" } } },
	),
);

const raw = css.raw(
	{ animation: "fade-in 180ms ease", transitionDuration: "180ms" },
	{ _dark: { backgroundColor: "var(--runtime-surface)" } },
);

const merged = cx(
	primaryButton,
	secondaryButton,
	card,
	elevatedCard,
	input,
	invalidInput,
	successBadge,
	warningBadge,
	dangerBadge,
	navigation,
	table,
	dialog,
	toast,
	codeBlock,
	composedCard,
	runtimeClass,
	designClass,
	compactButton,
	positiveButton,
	warningButton,
	dangerButton,
	infoButton,
	"external-class",
	false,
	undefined,
);

const workload = {
	primaryButton,
	secondaryButton,
	compactButton,
	positiveButton,
	warningButton,
	dangerButton,
	infoButton,
	card,
	elevatedCard,
	input,
	invalidInput,
	successBadge,
	warningBadge,
	dangerBadge,
	navigation,
	table,
	dialog,
	toast,
	codeBlock,
	composedCard,
	runtimeProps,
	designClass,
	designProps,
	raw,
	merged,
};

void workload;
