import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const benchmarkRoot = resolve(import.meta.dirname, "..");
const generatedRoot = resolve(benchmarkRoot, ".generated");

export const libraries = [
	"pandwind",
	"pandwind-generated",
	"panda",
	"stylex",
	"sprinkles",
	"emotion",
	"styled-components",
	"goober",
	"griffel",
	"linaria",
	"compiled",
	"vanilla-extract",
	"stitches",
	"jss",
	"react-jss",
	"fela",
	"aphrodite",
	"style9",
	"treat",
	"typestyle",
	"next-yak",
	"react-strict-dom",
] as const;
export const scenarios = ["natural", "stress"] as const;

export type Library = (typeof libraries)[number];
export type Scenario = (typeof scenarios)[number];

const scenarioOptions: Record<Scenario, { componentCount: number; catalogCount: number }> = {
	natural: { componentCount: 12, catalogCount: 16 },
	stress: { componentCount: 180, catalogCount: 128 },
};

const colorTokens = [
	["$blue-500", "#2563eb"],
	["$blue-600", "#1d4ed8"],
	["$gray-50", "#f9fafb"],
	["$gray-100", "#f3f4f6"],
	["$gray-900", "#111827"],
	["$white", "#ffffff"],
] as const;

const spacingTokens = [
	["1", "0.25rem"],
	["2", "0.5rem"],
	["4", "1rem"],
	["6", "1.5rem"],
	["8", "2rem"],
] as const;

const radiiTokens = [
	["sm", "0.25rem"],
	["md", "0.375rem"],
	["lg", "0.5rem"],
] as const;

const quote = (value: string): string => JSON.stringify(value);

const extraColorTokens = (count: number): readonly (readonly [string, string])[] =>
	Array.from(
		{ length: count },
		(_, index) => [`$catalog-${String(index).padStart(3, "0")}`, `hsl(${index} 60% 50%)`] as const,
	);

const extraSpacingTokens = (count: number): readonly (readonly [string, string])[] =>
	Array.from(
		{ length: count },
		(_, index) => [`catalog-${String(index).padStart(3, "0")}`, `${index + 1}px`] as const,
	);

export const pandwindTokenNames = (catalogCount: number) => ({
	colors: [...colorTokens, ...extraColorTokens(catalogCount)].map(([name]) => name),
	spacing: [...spacingTokens, ...extraSpacingTokens(catalogCount)].map(([name]) => name),
	radii: radiiTokens.map(([name]) => name),
});

const entries = (items: readonly (readonly [string, string])[]): string =>
	items.map(([key, value]) => `\t\t${quote(key)}: ${quote(value)},`).join("\n");

const objectEntries = (items: readonly (readonly [string, string])[]): string =>
	items.map(([key, value]) => `\t${quote(key)}: ${quote(value)},`).join("\n");

export const generatePandwindPresetSource = (catalogCount: number): string => {
	const colors = [...colorTokens, ...extraColorTokens(catalogCount)];
	const spacing = [...spacingTokens, ...extraSpacingTokens(catalogCount)];
	return `import { define, type PandwindProperties } from "pandwind/preset";

const conditions = define.conditions({
\tbase: "",
\t_hover: "&:hover",
\t_dark: ".dark &",
\tsm: "@media (min-width: 640px)",
\tmd: "@media (min-width: 768px)",
});

const tokens = define.tokens({
\tcolors: {
${entries(colors)}
\t},
\tspacing: {
${entries(spacing)}
\t},
\tradii: {
${entries(radiiTokens)}
\t},
});

const semanticTokens = tokens.defineSemanticTokens(conditions, {
\tsemantic: {
\t\tsurface: { base: "colors.$gray-50", _dark: "colors.$gray-900" },
\t},
});

const colorPalettes = semanticTokens.defineColorPalettes({
\tbrand: {
\t\tsolid: "colors.$blue-600",
\t\tcontrast: "colors.$white",
\t},
});

const properties = define.properties({
\t$all: true,
\tcolor: { $tokens: "colors", $strictness: "inherits" },
\tbackgroundColor: { $tokens: "colors", $strictness: "inherits" },
\tpadding: { $tokens: "spacing", $strictness: "inherits" },
\tmargin: { $tokens: "spacing", $strictness: "inherits" },
\tgap: { $tokens: "spacing", $strictness: "inherits" },
\tborderRadius: { $tokens: "radii", $strictness: "inherits" },
});

const cssConfig: PandwindProperties = {};
const theme = define.theme({ config: cssConfig, tokens: semanticTokens });

export const preset = define.preset(theme, {
\tstrict: true,
\tconditions,
\tproperties,
\tcolorPalettes,
});
`;
};

type PandwindAppOptions = {
	readonly includeRaw?: boolean;
	readonly includeColorPalette?: boolean;
	readonly includeCxVars?: boolean;
};

export const pandwindApp = (componentCount: number, options: PandwindAppOptions = {}): string => {
	const styles = Array.from({ length: componentCount }, (_, index) => {
		const padding = ["1", "2", "4", "6", "8"][index % 5]!;
		const useColorPalette = options.includeColorPalette === true && index % 4 === 0;
		const color = useColorPalette
			? "colorPalette.contrast"
			: index % 2 === 0
				? "$blue-500"
				: "$gray-900";
		const backgroundColor = useColorPalette
			? "colorPalette.solid"
			: index % 3 === 0
				? "$gray-50"
				: "$white";
		const colorPalette = useColorPalette ? '\t\tcolorPalette: "brand",\n' : "";
		return `\tcss.class({
\t\tdisplay: ${quote(index % 2 === 0 ? "flex" : "grid")},
${colorPalette}\t\tcolor: ${quote(color)},
\t\tbackgroundColor: ${quote(backgroundColor)},
\t\tpadding: ${quote(padding)},
\t\tgap: ${quote(padding)},
\t\tborderRadius: ${quote(index % 2 === 0 ? "md" : "lg")},
\t\t_hover: { color: ${quote("$blue-600")} },
\t\t_dark: { backgroundColor: ${quote("$gray-900")} },
\t\tsm: { padding: ${quote("4")} },
\t}),`;
	}).join("\n");
	const rawDeclaration =
		options.includeRaw === true
			? 'const raw = css.raw({ margin: "2" }, { _hover: { color: "$gray-900" } });'
			: "";
	const rawWorkload = options.includeRaw === true ? "\traw,\n" : "";
	const composedVarsDeclaration =
		options.includeCxVars === true
			? 'const composedVars = cx.vars(css.vars({ color: "var(--composed-color)" }), composed);'
			: "";
	const composedVarsWorkload = options.includeCxVars === true ? "\tcomposedVars,\n" : "";

	return `import { createCx } from "pandwind/cx";
import { css } from "./styles.ts";

type RuntimeButtonInput = { backgroundColor: string; padding: string };

const declarations = css(
\t{ color: "$blue-500", padding: "4" },
\t{ margin: "2", backgroundColor: "$gray-50" },
);
const declarationProps = css.props(declarations);
const variableProps = css.props(css.vars({ color: "var(--runtime-color)" }));
const dynamicGroup = css.group({
\tbutton: {
\t\t$input: {} as RuntimeButtonInput,
\t\tbackgroundColor: css.input("backgroundColor"),
\t\tpadding: css.input("padding"),
\t},
});
const dynamicProps = css.props(
\tdynamicGroup.button({ backgroundColor: "var(--button-color)", padding: "12px" }),
);
${rawDeclaration}
const cx = createCx({ css });
const composed = cx(css.class({ color: "$blue-500" }), "external-class");
${composedVarsDeclaration}

export const componentStyles = [
${styles}
];

export const workload = {
\tdeclarationProps,
\tvariableProps,
\tdynamicProps,
\tcomposed,
${composedVarsWorkload}${rawWorkload}\tcomponentStyles,
};
`;
};

export const pandwindStyles = (): string => `import { createCss } from "pandwind/css";
import { preset } from "./preset.ts";

export const css = createCss(preset);
`;

const pandwindGeneratedStyles = (): string => `export { css } from "./css.generated.ts";
`;

const pandaTokens = (catalogCount: number): string => {
	const extraColors = Array.from(
		{ length: catalogCount },
		(_, index) =>
			`\t\t\t\t\t${quote(String(index).padStart(3, "0"))}: { value: ${quote(`hsl(${index} 60% 50%)`)} },`,
	).join("\n");
	return `import { defineConfig } from "@pandacss/dev";

export default defineConfig({
\tpreflight: false,
\tinclude: ["src/**/*.ts"],
\tconditions: {
\t\textend: {
\t\tdark: ".dark &",
\t\t sm: "@media (min-width: 640px)",
\t\t md: "@media (min-width: 768px)",
\t\t},
\t},
\ttheme: {
\t\textend: {
\t\ttokens: {
\t\t\tcolors: {
\t\t\t\tblue: {
\t\t\t\t\t500: { value: "#2563eb" },
\t\t\t\t\t600: { value: "#1d4ed8" },
\t\t\t\t},
\t\t\t\tgray: {
\t\t\t\t\t50: { value: "#f9fafb" },
\t\t\t\t\t900: { value: "#111827" },
\t\t\t\t},
\t\t\t\twhite: { value: "#ffffff" },
\t\t\t\tcatalog: {
${extraColors}
\t\t\t\t},
\t\t\t},
\t\t\tspacing: {
\t\t\t\t1: { value: "0.25rem" },
\t\t\t\t2: { value: "0.5rem" },
\t\t\t\t4: { value: "1rem" },
\t\t\t\t6: { value: "1.5rem" },
\t\t\t\t8: { value: "2rem" },
\t\t\t},
\t\t\tradii: {
\t\t\t\tmd: { value: "0.375rem" },
\t\t\t\tlg: { value: "0.5rem" },
\t\t\t},
\t\t},
\t\tsemanticTokens: {
\t\t\tcolors: {
\t\t\t\tsurface: {
\t\t\t\t\tvalue: { base: "{colors.gray.50}", _dark: "{colors.gray.900}" },
\t\t\t\t},
\t\t\t},
\t\t},
\t},
\t},
});
`;
};

const pandaApp = (componentCount: number): string => {
	const styles = Array.from({ length: componentCount }, (_, index) => {
		const padding = ["1", "2", "4", "6", "8"][index % 5]!;
		const color = index % 2 === 0 ? "blue.500" : "gray.900";
		return `\tcss({
\t\tdisplay: ${quote(index % 2 === 0 ? "flex" : "grid")},
\t\tcolor: ${quote(color)},
\t\tbackgroundColor: ${quote("gray.50")},
\t\tpadding: ${quote(padding)},
\t\tgap: ${quote(padding)},
\t\tborderRadius: ${quote(index % 2 === 0 ? "md" : "lg")},
\t\t_hover: { color: ${quote("blue.600")} },
\t\t_dark: { backgroundColor: ${quote("gray.900")} },
\t\t_sm: { padding: ${quote("4")} },
\t}),`;
	}).join("\n");

	return `import { css, cva } from "../styled-system/css";

const button = cva({
\tbase: {
\t\tdisplay: "flex",
\t\talignItems: "center",
\t\tcolor: "white",
\t\tbackgroundColor: "blue.600",
\t\tpadding: "4",
\t\tborderRadius: "md",
\t\t_hover: { backgroundColor: "blue.500" },
\t},
\tvariants: {
\t\tsize: {
\t\t\tsm: { padding: "2" },
\t\t\tlg: { padding: "6" },
\t\t},
\t\ttone: {
\t\t\tbrand: { backgroundColor: "blue.600" },
\t\t\tneutral: { backgroundColor: "gray.900" },
\t\t},
\t},
\tdefaultVariants: { size: "sm", tone: "brand" },
});

const buttonClasses = [
\tbutton({ size: "sm", tone: "brand" }),
\tbutton({ size: "lg", tone: "neutral" }),
];

export const componentStyles = [
${styles}
];

export const workload = { buttonClasses, componentStyles };
`;
};

const stylexVars = (catalogCount: number): string => {
	const entries: readonly (readonly [string, string])[] = [
		["blue500", "#2563eb"],
		["blue600", "#1d4ed8"],
		["gray50", "#f9fafb"],
		["gray900", "#111827"],
		["white", "#ffffff"],
		...Array.from(
			{ length: catalogCount },
			(_, index) => [`catalog${String(index).padStart(3, "0")}`, `hsl(${index} 60% 50%)`] as const,
		),
	];
	return `const vars = stylex.defineVars({
${objectEntries(entries)}
});
`;
};

const stylexApp = (componentCount: number, catalogCount: number): string => {
	const styles = Array.from({ length: componentCount }, (_, index) => {
		const color = index % 2 === 0 ? "vars.blue500" : "vars.gray900";
		return `\tstyle${index}: {
\t\tdisplay: ${quote(index % 2 === 0 ? "flex" : "grid")},
\t\tcolor: { default: ${color}, ":hover": vars.blue600 },
\t\tbackgroundColor: { default: vars.gray50, "@media (prefers-color-scheme: dark)": vars.gray900 },
\t\tpadding: { default: ${index % 2 === 0 ? 8 : 16}, "@media (min-width: 768px)": 24 },
\t\tborderRadius: ${index % 2 === 0 ? 6 : 8},
	\t},`;
	}).join("\n");

	const outputs = Array.from({ length: componentCount }, (_, index) => {
		const alternate = index % 2 === 0 ? `styles.style${(index + 1) % componentCount}` : "null";
		return `\tstylex.props(styles.style${index}, ${alternate}),`;
	}).join("\n");

	return `import * as stylex from "@stylexjs/stylex";

${stylexVars(catalogCount)}
const styles = stylex.create({
${styles}
});

export const componentStyles = [
${outputs}
];

export const workload = { componentStyles };
`;
};

const sprinklesSetup = (catalogCount: number): string => {
	const colors: readonly (readonly [string, string])[] = [
		["blue-500", "#2563eb"],
		["blue-600", "#1d4ed8"],
		["gray-50", "#f9fafb"],
		["gray-900", "#111827"],
		["white", "#ffffff"],
		...Array.from(
			{ length: catalogCount },
			(_, index) => [`catalog-${String(index).padStart(3, "0")}`, `hsl(${index} 60% 50%)`] as const,
		),
	];
	const spacing: readonly (readonly [string, string])[] = [
		["1", "0.25rem"],
		["2", "0.5rem"],
		["4", "1rem"],
		["6", "1.5rem"],
		["8", "2rem"],
		...Array.from(
			{ length: catalogCount },
			(_, index) => [`catalog-${String(index).padStart(3, "0")}`, `${index + 1}px`] as const,
		),
	];
	return `const colors = {
${objectEntries(colors)}
};

const spacing = {
${objectEntries(spacing)}
};

const radii = { sm: "0.25rem", md: "0.375rem", lg: "0.5rem" };

const properties = defineProperties({
\tconditions: {
\t\tmobile: {},
\t\ttablet: { "@media": "(min-width: 640px)" },
\t\tdesktop: { "@media": "(min-width: 1024px)" },
\t},
\tdefaultCondition: "mobile",
\tproperties: {
\t\tdisplay: ["flex", "grid", "block"],
\t\tcolor: colors,
\t\tbackgroundColor: colors,
\t\tpadding: spacing,
\t\tmargin: spacing,
\t\tgap: spacing,
\t\tborderRadius: radii,
\t},
});

export const sprinkles = createSprinkles(properties);
`;
};

const sprinklesApp = (componentCount: number): string => {
	const styles = Array.from({ length: componentCount }, (_, index) => {
		const padding = ["1", "2", "4", "6", "8"][index % 5]!;
		const color = index % 2 === 0 ? "blue-500" : "gray-900";
		return `\tsprinkles({
\t\tdisplay: ${quote(index % 2 === 0 ? "flex" : "grid")},
\t\tcolor: { mobile: ${quote(color)}, desktop: ${quote("blue-600")} },
\t\tbackgroundColor: { mobile: ${quote("gray-50")}, desktop: ${quote("white")} },
\t\tpadding: { mobile: ${quote(padding)}, tablet: ${quote("4")}, desktop: ${quote("8")} },
\t\tgap: ${quote(padding)},
\t\tborderRadius: ${quote(index % 2 === 0 ? "md" : "lg")},
\t}),`;
	}).join("\n");
	return `import { sprinkles } from "./sprinkles.css.ts";

export const componentStyles = [
${styles}
];

export const workload = { componentStyles };
`;
};

const externalStyleObject = (index: number, conditions = true): string => {
	const padding = ["0.25rem", "0.5rem", "1rem", "1.5rem", "2rem"][index % 5]!;
	const color = index % 2 === 0 ? "#2563eb" : "#111827";
	const backgroundColor = index % 3 === 0 ? "#f9fafb" : "#ffffff";
	const declarations = `
		display: ${quote(index % 2 === 0 ? "flex" : "grid")},
		color: ${quote(color)},
		backgroundColor: ${quote(backgroundColor)},
		padding: ${quote(padding)},
		gap: ${quote(padding)},
		borderRadius: ${quote(index % 2 === 0 ? "0.375rem" : "0.5rem")},`;
	if (!conditions)
		return `{${declarations}
}`;
	return `{${declarations}
		"&:hover": { color: "#1d4ed8" },
		"@media (min-width: 768px)": { padding: "2rem" },
	}`;
};

const basicExternalStyleObject = (index: number): string => externalStyleObject(index, false);

const griffelStyleObject = (index: number): string => {
	const style = externalStyleObject(index, false);
	return (
		style.slice(0, -2) +
		`
	":hover": { color: "#1d4ed8" },
	"@media (min-width: 768px)": { padding: "2rem" },
}`
	);
};

const vanillaStyleObject = (index: number): string => {
	const style = externalStyleObject(index, false);
	return (
		style.slice(0, -2) +
		`
	":hover": { color: "#1d4ed8" },
	"@media": { "screen and (min-width: 768px)": { padding: "2rem" } },
}`
	);
};

const typeStyleObject = (index: number): string => {
	const style = externalStyleObject(index, false);
	return (
		style.slice(0, -2) +
		`
	"$nest": { "&:hover": { color: "#1d4ed8" } },
}`
	);
};

const stylexStyleObject = (index: number): string => {
	const padding = [4, 8, 16, 24, 32][index % 5]!;
	const color = index % 2 === 0 ? "vars.blue500" : "vars.gray900";
	return `{
		display: ${quote(index % 2 === 0 ? "flex" : "grid")},
		color: { default: ${color}, ":hover": vars.blue600 },
		backgroundColor: { default: vars.gray50, "@media (prefers-color-scheme: dark)": vars.gray900 },
		padding: { default: ${String(padding)}, "@media (min-width: 768px)": 32 },
		borderRadius: ${index % 2 === 0 ? 6 : 8},
	}`;
};

const stitchesStyleObject = (index: number): string => {
	const padding = ["$1", "$2", "$4", "$6", "$8"][index % 5]!;
	const color = index % 2 === 0 ? "$blue500" : "$gray900";
	return `{
		display: ${quote(index % 2 === 0 ? "flex" : "grid")},
		color: ${quote(color)},
		backgroundColor: ${quote(index % 3 === 0 ? "$gray50" : "$white")},
		padding: ${quote(padding)},
		gap: ${quote(padding)},
		borderRadius: ${quote(index % 2 === 0 ? "$md" : "$lg")},
		"&:hover": { color: "$blue600" },
	}`;
};

const generatedExpressions = (count: number, expression: (index: number) => string): string =>
	Array.from({ length: count }, (_, index) => expression(index)).join("\n");

const emotionApp = (
	componentCount: number,
	catalogCount: number,
): string => `import { css as classCss, cx } from "@emotion/css";
import { css as emotionCss } from "@emotion/react";
import styled from "@emotion/styled";

type CardProps = { $tone: "brand" | "neutral"; $compact?: boolean };

const Card = styled.div<CardProps>((props) => ({
	color: props.$tone === "brand" ? "#2563eb" : "#111827",
	padding: props.$compact ? "0.5rem" : "1rem",
}));
const className = classCss(${externalStyleObject(0)});
const emotionStyles = emotionCss(${externalStyleObject(1)});
const composed = cx(className, classCss(${basicExternalStyleObject(2)}));
const cardProps: CardProps = { $tone: "brand", $compact: true };

const componentStyles = [
${generatedExpressions(componentCount, (index) => `\tclassCss(${externalStyleObject(index)}),`)}
];
const catalogStyles = [
${generatedExpressions(catalogCount, (index) => `\tclassCss(${basicExternalStyleObject(index)}),`)}
];

export const workload = { Card, cardProps, className, emotionStyles, composed, componentStyles, catalogStyles };
`;

const griffelApp = (
	componentCount: number,
	catalogCount: number,
): string => `import { makeStyles, mergeClasses } from "@griffel/react";

const useStyles = makeStyles({
	card: ${griffelStyleObject(0)},
${generatedExpressions(componentCount, (index) => `	component${String(index).padStart(3, "0")}: ${griffelStyleObject(index)},`)}
${generatedExpressions(catalogCount, (index) => `	catalog${String(index).padStart(3, "0")}: ${basicExternalStyleObject(index)},`)}
});
const classes = useStyles();
const componentStyles = [
	classes.card,
${generatedExpressions(componentCount, (index) => `	mergeClasses(classes.card, classes.component${String(index).padStart(3, "0")}),`)}
];
const catalogStyles = [
${generatedExpressions(catalogCount, (index) => `	classes.catalog${String(index).padStart(3, "0")},`)}
];

export const workload = { classes, componentStyles, catalogStyles };
`;

const styledComponentsApp = (
	componentCount: number,
	catalogCount: number,
): string => `import type { ComponentProps } from "react";
import styled, { css } from "styled-components";

type CardProps = { $tone: "brand" | "neutral"; $compact?: boolean };

const Card = styled.button<CardProps>(${externalStyleObject(0)});
const cardProps: ComponentProps<typeof Card> = { $tone: "brand", $compact: true, type: "button" };
const fragment = css\`color: #2563eb; padding: 1rem;\`;

const componentStyles = [
\tCard,
${generatedExpressions(componentCount, (index) => `\tstyled.div(${externalStyleObject(index)}),`)}
];
const catalogStyles = [
${generatedExpressions(catalogCount, (index) => `\tstyled.span(${basicExternalStyleObject(index)}),`)}
];

export const workload = { Card, cardProps, fragment, componentStyles, catalogStyles };
`;

const gooberApp = (
	componentCount: number,
	catalogCount: number,
): string => `import { css } from "goober";

const componentStyles = [
${generatedExpressions(componentCount, (index) => `\tcss(${externalStyleObject(index)}),`)}
];
const catalogStyles = [
${generatedExpressions(catalogCount, (index) => `\tcss(${basicExternalStyleObject(index)}),`)}
];

export const workload = { componentStyles, catalogStyles };
`;

const linariaApp = (
	componentCount: number,
	catalogCount: number,
): string => `import { css } from "@linaria/core";
import type { CSSProperties } from "@linaria/core";
import { styled } from "@linaria/react";

type CardProps = { $tone: "brand" | "neutral"; $compact?: boolean };
const interpolatedProperties: CSSProperties = { color: "#2563eb", padding: "1rem" };
const Card = styled.button<CardProps>\`
\tdisplay: flex;
\tcolor: \${(props) => (props.$tone === "brand" ? "#2563eb" : "#111827")};
\tpadding: \${(props) => (props.$compact ? "0.5rem" : "1rem")};
\`;
const interpolated = css\`
\t\${interpolatedProperties}
\t&:hover { color: #1d4ed8; }
\`;

const componentStyles = [
\tinterpolated,
${generatedExpressions(componentCount, (index) => `\tcss\`display: flex; color: ${index % 2 === 0 ? "#2563eb" : "#111827"}; padding: ${["0.25rem", "0.5rem", "1rem", "1.5rem", "2rem"][index % 5]!};\`,`)}
];
const catalogStyles = [
${generatedExpressions(catalogCount, (index) => `\tcss\`color: hsl(${index} 60% 50%); padding: 1rem;\`,`)}
];

export const workload = { Card, interpolated, componentStyles, catalogStyles };
`;

const compiledApp = (
	componentCount: number,
	catalogCount: number,
): string => `import { css, cssMap, styled } from "@compiled/react";

const styleMap = cssMap({
	card: ${basicExternalStyleObject(0)},
	primary: ${basicExternalStyleObject(1)},
});
const componentStyles = [
\tcss(${externalStyleObject(0)}),
\tstyleMap.card,
\tstyleMap.primary,
\tstyled.div(${basicExternalStyleObject(1)}),
${generatedExpressions(componentCount, (index) => `\tcss(${externalStyleObject(index)}),`)}
];
const catalogStyles = [
${generatedExpressions(catalogCount, (index) => `\tcss(${basicExternalStyleObject(index)}),`)}
];

export const workload = { styleMap, componentStyles, catalogStyles };
`;

const vanillaExtractApp = (
	componentCount: number,
	catalogCount: number,
): string => `import { createTheme, style } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";

const themeClass = createTheme({
\tcolors: { brand: "#2563eb", neutral: "#111827" },
\tspacing: { small: "0.5rem", medium: "1rem", large: "2rem" },
});
const button = recipe({
\tbase: ${vanillaStyleObject(0)},
\tvariants: {
\t\ttone: {
\t\t\tbrand: { background: "#2563eb" },
\t\t\tneutral: { background: "#111827" },
\t\t},
\t\tsize: {
\t\t\tsm: { padding: "0.5rem" },
\t\t\tlg: { padding: "2rem" },
\t\t},
\t},
\tdefaultVariants: { tone: "brand", size: "sm" },
});
const componentStyles = [
\tthemeClass,
\tstyle(${vanillaStyleObject(1)}),
\tbutton({ tone: "brand", size: "sm" }),
${generatedExpressions(componentCount, (index) => `\tstyle(${vanillaStyleObject(index)}),`)}
];
const catalogStyles = [
${generatedExpressions(catalogCount, (index) => `\tstyle(${basicExternalStyleObject(index)}),`)}
];

export const workload = { themeClass, button, componentStyles, catalogStyles };
`;

const stitchesApp = (componentCount: number, catalogCount: number): string => {
	const catalogTokens = Array.from(
		{ length: catalogCount },
		(_, index) =>
			`\t\tcatalog${String(index).padStart(3, "0")}: ${quote(`hsl(${index} 60% 50%)`)},`,
	).join("\n");
	return `import { createStitches } from "@stitches/react";

const { css, styled } = createStitches({
	theme: {
		colors: {
			blue500: "#2563eb",
			blue600: "#1d4ed8",
			gray50: "#f9fafb",
			gray900: "#111827",
			white: "#ffffff",
${catalogTokens}
		},
		space: { 1: "0.25rem", 2: "0.5rem", 4: "1rem", 6: "1.5rem", 8: "2rem" },
		radii: { md: "0.375rem", lg: "0.5rem" },
	},
	media: { md: "(min-width: 768px)" },
});

const button = css({
	display: "flex",
	color: "$blue500",
	backgroundColor: "$gray50",
	padding: "$4",
	borderRadius: "$md",
	"&:hover": { color: "$blue600" },
	variants: {
		tone: {
			brand: { color: "$blue600" },
			neutral: { color: "$gray900" },
		},
		size: {
			sm: { padding: "$2" },
			lg: { padding: "$8" },
		},
	},
	defaultVariants: { tone: "brand", size: "sm" },
	compoundVariants: [{ css: { backgroundColor: "$white" }, tone: "neutral", size: "lg" }],
});
const Card = styled("button", {
	color: "$blue500",
	padding: "$4",
	});
const componentStyles = [
	button({ tone: "brand", size: "sm" }),
	button({ tone: "neutral", size: "lg" }),
	Card,
${generatedExpressions(componentCount, (index) => `\tcss(${stitchesStyleObject(index)})({ tone: ${quote(index % 2 === 0 ? "brand" : "neutral")} }),`)}
];

export const workload = { button, Card, componentStyles };
`;
};

const jssApp = (componentCount: number, catalogCount: number): string => `import jss from "jss";

const sheet = jss.createStyleSheet({
	card: ${externalStyleObject(0)},
${generatedExpressions(componentCount, (index) => `\tcomponent${String(index).padStart(3, "0")}: ${externalStyleObject(index)},`)}
${generatedExpressions(catalogCount, (index) => `\tcatalog${String(index).padStart(3, "0")}: ${basicExternalStyleObject(index)},`)}
});
const classes = sheet.attach().classes;
const componentStyles = [
	classes.card,
${generatedExpressions(componentCount, (index) => `\tclasses.component${String(index).padStart(3, "0")},`)}
];
const catalogStyles = [
${generatedExpressions(catalogCount, (index) => `\tclasses.catalog${String(index).padStart(3, "0")},`)}
];

export const workload = { classes, componentStyles, catalogStyles };
`;

const reactJssApp = (
	componentCount: number,
	catalogCount: number,
): string => `import { createUseStyles } from "react-jss";

type CardProps = { tone: "brand" | "neutral"; compact?: boolean };
const useStyles = createUseStyles<string, CardProps>({
	card: {
		color: (props) => (props.tone === "brand" ? "#2563eb" : "#111827"),
		padding: (props) => (props.compact ? "0.5rem" : "1rem"),
		"&:hover": { color: "#1d4ed8" },
	},
${generatedExpressions(componentCount, (index) => `\tcomponent${String(index).padStart(3, "0")}: ${externalStyleObject(index)},`)}
${generatedExpressions(catalogCount, (index) => `\tcatalog${String(index).padStart(3, "0")}: ${basicExternalStyleObject(index)},`)}
});
const resolveStyles = (props: CardProps) => useStyles(props);

export const workload = { resolveStyles };
`;

const felaStyleObject = (index: number): string => {
	const padding = ["0.25rem", "0.5rem", "1rem", "1.5rem", "2rem"][index % 5]!;
	return `{
	\tdisplay: ${quote(index % 2 === 0 ? "flex" : "grid")},
	\tcolor: ${quote(index % 2 === 0 ? "#2563eb" : "#111827")},
	\tbackgroundColor: ${quote(index % 3 === 0 ? "#f9fafb" : "#ffffff")},
	\tpadding: ${quote(padding)},
	\tgap: ${quote(padding)},
	\tborderRadius: ${quote(index % 2 === 0 ? "0.375rem" : "0.5rem")},
	}`;
};

const felaApp = (
	componentCount: number,
	catalogCount: number,
): string => `import { createRenderer } from "fela";

type CardProps = { tone: "brand" | "neutral" };
const renderer = createRenderer();
const render = (props: CardProps) => renderer.renderRule(
	(input: CardProps) => ({ color: input.tone === "brand" ? "#2563eb" : "#111827" }),
	props,
);
const componentStyles = [
${generatedExpressions(componentCount, (index) => `\trenderer.renderRule((props: CardProps) => (${felaStyleObject(index)}), { tone: ${quote(index % 2 === 0 ? "brand" : "neutral")} }),`)}
];
const catalogStyles = [
${generatedExpressions(catalogCount, (index) => `\trenderer.renderRule(() => (${felaStyleObject(index)}), {}),`)}
];

export const workload = { render, componentStyles, catalogStyles };
`;

const aphroditeApp = (
	componentCount: number,
	catalogCount: number,
): string => `import { css, StyleSheet } from "aphrodite";

const styles = StyleSheet.create({
	card: ${basicExternalStyleObject(0)},
${generatedExpressions(componentCount, (index) => `\tcomponent${String(index).padStart(3, "0")}: ${basicExternalStyleObject(index)},`)}
${generatedExpressions(catalogCount, (index) => `\tcatalog${String(index).padStart(3, "0")}: ${basicExternalStyleObject(index)},`)}
});
const componentStyles = [
	css(styles.card),
${generatedExpressions(componentCount, (index) => `\tcss(styles.component${String(index).padStart(3, "0")}),`)}
];
const catalogStyles = [
${generatedExpressions(catalogCount, (index) => `\tcss(styles.catalog${String(index).padStart(3, "0")}),`)}
];

export const workload = { styles, componentStyles, catalogStyles };
`;

const style9App = (
	componentCount: number,
	catalogCount: number,
): string => `import style9 from "style9";

const styles = style9.create({
	card: ${basicExternalStyleObject(0)},
${generatedExpressions(componentCount, (index) => `\tcomponent${String(index).padStart(3, "0")}: ${basicExternalStyleObject(index)},`)}
${generatedExpressions(catalogCount, (index) => `\tcatalog${String(index).padStart(3, "0")}: ${basicExternalStyleObject(index)},`)}
});
const componentStyles = [
	styles("card"),
${generatedExpressions(componentCount, (index) => `\tstyles("component${String(index).padStart(3, "0")}"),`)}
];
const catalogStyles = [
${generatedExpressions(catalogCount, (index) => `\tstyles("catalog${String(index).padStart(3, "0")}"),`)}
];

export const workload = { styles, componentStyles, catalogStyles };
`;

const treatApp = (
	componentCount: number,
	catalogCount: number,
): string => `import { style, styleMap } from "treat";

const componentStyles = [
${generatedExpressions(componentCount, (index) => `\tstyle(${vanillaStyleObject(index)}),`)}
];
const catalogStyles = styleMap({
${generatedExpressions(catalogCount, (index) => `\tcatalog${String(index).padStart(3, "0")}: ${basicExternalStyleObject(index)},`)}
});

export const workload = { componentStyles, catalogStyles };
`;

const typestyleApp = (
	componentCount: number,
	catalogCount: number,
): string => `import { style, stylesheet } from "typestyle";

const componentStyles = [
${generatedExpressions(componentCount, (index) => `\tstyle(${typeStyleObject(index)}),`)}
];
const catalogStyles = stylesheet({
${generatedExpressions(catalogCount, (index) => `\tcatalog${String(index).padStart(3, "0")}: ${basicExternalStyleObject(index)},`)}
});

export const workload = { componentStyles, catalogStyles };
`;

const nextYakApp = (
	componentCount: number,
	catalogCount: number,
): string => `import { css, styled } from "next-yak";

type CardProps = { $tone: "brand" | "neutral"; $compact?: boolean };
const Card = styled.button<CardProps>\`
\tdisplay: flex;
\tcolor: \${(props) => (props.$tone === "brand" ? "#2563eb" : "#111827")};
\tpadding: \${(props) => (props.$compact ? "0.5rem" : "1rem")};
\`;
const cardStyle = css<CardProps>\`
\tcolor: \${(props) => (props.$tone === "brand" ? "#2563eb" : "#111827")};
\t&:hover { color: #1d4ed8; }
\`;
const componentStyles = [
\tCard,
\tcardStyle,
${generatedExpressions(componentCount, (index) => `\tcss\`display: flex; color: ${index % 2 === 0 ? "#2563eb" : "#111827"}; padding: ${["0.25rem", "0.5rem", "1rem", "1.5rem", "2rem"][index % 5]!};\`,`)}
];
const catalogStyles = [
${generatedExpressions(catalogCount, (index) => `\tcss\`color: hsl(${index} 60% 50%); padding: 1rem;\`,`)}
];

export const workload = { Card, cardStyle, componentStyles, catalogStyles };
`;

const reactStrictDomApp = (
	componentCount: number,
	catalogCount: number,
): string => `import { css } from "react-strict-dom";

const vars = css.defineVars({
	blue500: "#2563eb",
	blue600: "#1d4ed8",
	gray50: "#f9fafb",
	gray900: "#111827",
});
const styles = css.create({
	card: ${stylexStyleObject(0)},
${generatedExpressions(componentCount, (index) => `\tcomponent${String(index).padStart(3, "0")}: ${stylexStyleObject(index)},`)}
${generatedExpressions(catalogCount, (index) => `\tcatalog${String(index).padStart(3, "0")}: ${stylexStyleObject(index)},`)}
});
const componentStyles = [
\tstyles.card,
${generatedExpressions(componentCount, (index) => `\tstyles.component${String(index).padStart(3, "0")},`)}
];
const catalogStyles = [
${generatedExpressions(catalogCount, (index) => `\tstyles.catalog${String(index).padStart(3, "0")},`)}
];

export const workload = { styles, componentStyles, catalogStyles };
`;

const tsconfig = (): string =>
	JSON.stringify(
		{
			extends: "../../../tsconfig.base.json",
			compilerOptions: { types: [] },
			include: ["src/**/*.ts", "styled-system/**/*.ts"],
		},
		null,
		2,
	) + "\n";

const writeFile = (projectRoot: string, fileName: string, content: string): void => {
	const path = resolve(projectRoot, fileName);
	mkdirSync(resolve(path, ".."), { recursive: true });
	writeFileSync(path, content);
};

export const generateFixtures = (): void => {
	rmSync(generatedRoot, { recursive: true, force: true });

	for (const scenario of scenarios) {
		const options = scenarioOptions[scenario];
		for (const library of libraries) {
			const projectRoot = resolve(generatedRoot, library, scenario);
			mkdirSync(projectRoot, { recursive: true });
			writeFile(projectRoot, "tsconfig.json", tsconfig());

			switch (library) {
				case "pandwind":
				case "pandwind-generated":
					writeFile(
						projectRoot,
						"src/preset.ts",
						generatePandwindPresetSource(options.catalogCount),
					);
					writeFile(
						projectRoot,
						"src/styles.ts",
						library === "pandwind" ? pandwindStyles() : pandwindGeneratedStyles(),
					);
					writeFile(projectRoot, "src/app.ts", pandwindApp(options.componentCount));
					break;
				case "panda":
					writeFile(projectRoot, "panda.config.ts", pandaTokens(options.catalogCount));
					writeFile(projectRoot, "src/app.ts", pandaApp(options.componentCount));
					break;
				case "stylex":
					writeFile(
						projectRoot,
						"src/app.ts",
						stylexApp(options.componentCount, options.catalogCount),
					);
					break;
				case "sprinkles":
					writeFile(
						projectRoot,
						"src/sprinkles.css.ts",
						`import { createSprinkles, defineProperties } from "@vanilla-extract/sprinkles";\n\n${sprinklesSetup(options.catalogCount)}`,
					);
					writeFile(projectRoot, "src/app.ts", sprinklesApp(options.componentCount));
					break;
				case "emotion":
					writeFile(
						projectRoot,
						"src/app.ts",
						emotionApp(options.componentCount, options.catalogCount),
					);
					break;
				case "styled-components":
					writeFile(
						projectRoot,
						"src/app.ts",
						styledComponentsApp(options.componentCount, options.catalogCount),
					);
					break;
				case "goober":
					writeFile(
						projectRoot,
						"src/app.ts",
						gooberApp(options.componentCount, options.catalogCount),
					);
					break;
				case "griffel":
					writeFile(
						projectRoot,
						"src/app.ts",
						griffelApp(options.componentCount, options.catalogCount),
					);
					break;
				case "linaria":
					writeFile(
						projectRoot,
						"src/app.ts",
						linariaApp(options.componentCount, options.catalogCount),
					);
					break;
				case "compiled":
					writeFile(
						projectRoot,
						"src/app.ts",
						compiledApp(options.componentCount, options.catalogCount),
					);
					break;
				case "vanilla-extract":
					writeFile(
						projectRoot,
						"src/app.ts",
						vanillaExtractApp(options.componentCount, options.catalogCount),
					);
					break;
				case "stitches":
					writeFile(
						projectRoot,
						"src/app.ts",
						stitchesApp(options.componentCount, options.catalogCount),
					);
					break;
				case "jss":
					writeFile(
						projectRoot,
						"src/app.ts",
						jssApp(options.componentCount, options.catalogCount),
					);
					break;
				case "react-jss":
					writeFile(
						projectRoot,
						"src/app.ts",
						reactJssApp(options.componentCount, options.catalogCount),
					);
					break;
				case "fela":
					writeFile(
						projectRoot,
						"src/app.ts",
						felaApp(options.componentCount, options.catalogCount),
					);
					break;
				case "aphrodite":
					writeFile(
						projectRoot,
						"src/app.ts",
						aphroditeApp(options.componentCount, options.catalogCount),
					);
					break;
				case "style9":
					writeFile(
						projectRoot,
						"src/app.ts",
						style9App(options.componentCount, options.catalogCount),
					);
					break;
				case "treat":
					writeFile(
						projectRoot,
						"src/app.ts",
						treatApp(options.componentCount, options.catalogCount),
					);
					break;
				case "typestyle":
					writeFile(
						projectRoot,
						"src/app.ts",
						typestyleApp(options.componentCount, options.catalogCount),
					);
					break;
				case "next-yak":
					writeFile(
						projectRoot,
						"src/app.ts",
						nextYakApp(options.componentCount, options.catalogCount),
					);
					break;
				case "react-strict-dom":
					writeFile(
						projectRoot,
						"src/app.ts",
						reactStrictDomApp(options.componentCount, options.catalogCount),
					);
					break;
			}
		}
	}
};

if (process.argv[1] === import.meta.filename) generateFixtures();
