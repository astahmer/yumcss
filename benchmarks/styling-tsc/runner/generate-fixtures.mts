import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const benchmarkRoot = resolve(import.meta.dirname, "..");
const generatedRoot = resolve(benchmarkRoot, ".generated");

export const libraries = ["pandwind", "panda", "stylex", "sprinkles"] as const;
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

const entries = (items: readonly (readonly [string, string])[]): string =>
	items.map(([key, value]) => `\t\t${quote(key)}: ${quote(value)},`).join("\n");

const objectEntries = (items: readonly (readonly [string, string])[]): string =>
	items.map(([key, value]) => `\t${quote(key)}: ${quote(value)},`).join("\n");

const pandwindPreset = (catalogCount: number): string => {
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

const pandwindApp = (componentCount: number): string => {
	const styles = Array.from({ length: componentCount }, (_, index) => {
		const padding = ["1", "2", "4", "6", "8"][index % 5]!;
		const color = index % 2 === 0 ? "$blue-500" : "$gray-900";
		const backgroundColor = index % 3 === 0 ? "$gray-50" : "$white";
		return `\tcss.class({
\t\tdisplay: ${quote(index % 2 === 0 ? "flex" : "grid")},
\t\tcolor: ${quote(color)},
\t\tbackgroundColor: ${quote(backgroundColor)},
\t\tpadding: ${quote(padding)},
\t\tgap: ${quote(padding)},
\t\tborderRadius: ${quote(index % 2 === 0 ? "md" : "lg")},
\t\t_hover: { color: ${quote("$blue-600")} },
\t\t_dark: { backgroundColor: ${quote("$gray-900")} },
\t\tsm: { padding: ${quote("4")} },
\t}),`;
	}).join("\n");

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
const cx = createCx({ css });
const composed = cx(css.class({ color: "$blue-500" }), "external-class");

export const componentStyles = [
${styles}
];

export const workload = {
\tdeclarationProps,
\tvariableProps,
\tdynamicProps,
\tcomposed,
\tcomponentStyles,
};
`;
};

const pandwindStyles = (): string => `import { createCss } from "pandwind/css";
import { preset } from "./preset.ts";

export const css = createCss(preset);
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

const tsconfig = (): string =>
	JSON.stringify(
		{
			extends: "../../../tsconfig.base.json",
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
					writeFile(projectRoot, "src/preset.ts", pandwindPreset(options.catalogCount));
					writeFile(projectRoot, "src/styles.ts", pandwindStyles());
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
			}
		}
	}
};

if (process.argv[1] === import.meta.filename) generateFixtures();
