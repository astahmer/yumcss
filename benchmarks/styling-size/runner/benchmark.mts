import { transformSync } from "@babel/core";
import stylexBabelPlugin from "@stylexjs/babel-plugin";
import { presetWind3 } from "@unocss/preset-wind3";
import UnoCSS from "@unocss/vite";
import wyw from "@wyw-in-js/vite";
import tailwindcss from "@tailwindcss/vite";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import { build, type PluginOption } from "vite";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { pandwindCssVite } from "pandwind/vite";
import { writePerformanceSummary } from "../../../scripts/render-performance-summary.mts";

const libraries = [
	"pandwind",
	"tailwind",
	"panda",
	"stylex",
	"vanilla-extract",
	"sprinkles",
	"unocss",
	"linaria",
	"pandwind-css",
	"pandwind-runtime",
	"pandwind-unsafe",
	"emotion",
	"styled-components",
	"goober",
] as const;

type Library = (typeof libraries)[number];
type Category = "static" | "runtime";
type Variant = "baseline" | "styled";

const staticLibraries = new Set<Library>([
	"pandwind",
	"tailwind",
	"panda",
	"stylex",
	"vanilla-extract",
	"sprinkles",
	"unocss",
	"linaria",
]);

type SizeMetric = { readonly min: number; readonly gz: number };
type BuildMetrics = {
	readonly js: SizeMetric;
	readonly css: SizeMetric;
	readonly total: SizeMetric;
};
type WorkloadResult = {
	readonly library: Library;
	readonly category: Category;
	readonly buildMode: string;
	readonly cssDelivery: "extracted" | "injected" | "none";
	readonly arbitraryRuntimeValues: boolean;
	readonly samples: number;
	readonly baseline: BuildMetrics;
	readonly styled: BuildMetrics;
	readonly delta: BuildMetrics;
};
type Snapshot = {
	readonly schema: "pandwind.styling-size/1";
	readonly source: "runner/benchmark.mts";
	readonly updatedAt: string;
	readonly samples: number;
	readonly environment: {
		readonly platform: string;
		readonly arch: string;
		readonly node: string;
		readonly vite: string;
		readonly esbuild: string;
	};
	readonly packages: Readonly<Record<string, string>>;
	readonly workloads: readonly WorkloadResult[];
	readonly tolerances: {
		readonly pandwind: { readonly relative: number; readonly absoluteBytes: number };
	};
};
type Options = {
	readonly update: boolean;
	readonly runs: number;
	readonly library?: Library;
	readonly category?: Category;
};
type StyleIntent = {
	readonly display: "flex" | "grid";
	readonly colorName: "blue-500" | "gray-900";
	readonly colorValue: string;
	readonly backgroundName: "gray-50" | "white";
	readonly backgroundValue: string;
	readonly paddingName: "1" | "2" | "4" | "6" | "8";
	readonly paddingValue: string;
	readonly paddingPixels: number;
	readonly gapName: "1" | "2" | "4" | "6" | "8";
	readonly gapValue: string;
	readonly radiusName: "md" | "lg";
	readonly radiusValue: string;
	readonly radiusPixels: number;
};

const root = resolve(import.meta.dirname, "../../..");
const benchmarkRoot = resolve(root, "benchmarks/styling-size");
const generatedRoot = resolve(benchmarkRoot, ".generated");
const snapshotPath = resolve(benchmarkRoot, "snapshots/bundle-size.json");
const reportPath = resolve(benchmarkRoot, "snapshots/bundle-size.md");
const benchmarkPackageName = "pandwind-styling-size-benchmark";
const stylesCount = 12;

const quote = (value: string): string => JSON.stringify(value);

const intents: readonly StyleIntent[] = Array.from({ length: stylesCount }, (_, index) => {
	const padding = (["1", "2", "4", "6", "8"] as const)[index % 5]!;
	const gap = (["1", "2", "4", "6", "8"] as const)[(index + 1) % 5]!;
	const paddingValues: Record<StyleIntent["paddingName"], readonly [string, number]> = {
		"1": ["0.25rem", 4],
		"2": ["0.5rem", 8],
		"4": ["1rem", 16],
		"6": ["1.5rem", 24],
		"8": ["2rem", 32],
	};
	const gapValues = paddingValues;
	const radius = index % 2 === 0 ? ("md" as const) : ("lg" as const);
	return {
		display: index % 2 === 0 ? "flex" : "grid",
		colorName: index % 2 === 0 ? "blue-500" : "gray-900",
		colorValue: index % 2 === 0 ? "#2563eb" : "#111827",
		backgroundName: index % 3 === 0 ? "gray-50" : "white",
		backgroundValue: index % 3 === 0 ? "#f9fafb" : "#ffffff",
		paddingName: padding,
		paddingValue: paddingValues[padding][0],
		paddingPixels: paddingValues[padding][1],
		gapName: gap,
		gapValue: gapValues[gap][0],
		radiusName: radius,
		radiusValue: radius === "md" ? "0.375rem" : "0.5rem",
		radiusPixels: radius === "md" ? 6 : 8,
	};
});

const tokenEntries = (entries: readonly (readonly [string, string])[]): string =>
	entries.map(([key, value]) => `\t\t${quote(key)}: ${quote(value)},`).join("\n");

const pandwindPresetSource = (): string => {
	const colors: readonly (readonly [string, string])[] = [
		["$blue-500", "#2563eb"],
		["$blue-600", "#1d4ed8"],
		["$gray-50", "#f9fafb"],
		["$gray-900", "#111827"],
		["$white", "#ffffff"],
		...Array.from(
			{ length: 32 },
			(_, index) =>
				[`$catalog-${String(index).padStart(3, "0")}`, `hsl(${index} 60% 50%)`] as const,
		),
	];
	const spacing: readonly (readonly [string, string])[] = [
		["1", "0.25rem"],
		["2", "0.5rem"],
		["4", "1rem"],
		["6", "1.5rem"],
		["8", "2rem"],
		...Array.from(
			{ length: 32 },
			(_, index) => [`catalog-${String(index).padStart(3, "0")}`, `${index + 1}px`] as const,
		),
	];
	return `import { define } from "pandwind/preset";

const conditions = define.conditions({
\tbase: "",
\t_hover: "&:hover",
\t_dark: ".dark &",
\tmd: "@media (min-width: 768px)",
});

const tokens = define.tokens({
\tcolors: {
${tokenEntries(colors)}
\t},
\tspacing: {
${tokenEntries(spacing)}
\t},
\tradii: {
\t\tmd: "0.375rem",
\t\tlg: "0.5rem",
\t},
});

const properties = define.properties({
\t$all: true,
\tcolor: { $tokens: "colors", $strictness: "inherits" },
\tbackgroundColor: { $tokens: "colors", $strictness: "inherits" },
\tpadding: { $tokens: "spacing", $strictness: "inherits" },
\tgap: { $tokens: "spacing", $strictness: "inherits" },
\tborderRadius: { $tokens: "radii", $strictness: "inherits" },
});

const theme = define.theme({ config: {}, tokens });

export const preset = define.preset(theme, {
\tstrict: true,
\tconditions,
\tproperties,
});
`;
};

const pandwindStyleObject = (intent: StyleIntent): Record<string, unknown> => ({
	display: intent.display,
	color: `$${intent.colorName}`,
	backgroundColor: `$${intent.backgroundName}`,
	padding: intent.paddingName,
	gap: intent.gapName,
	borderRadius: intent.radiusName,
	_hover: { color: "$blue-600" },
	md: { padding: "6" },
});

const pandaStyleObject = (intent: StyleIntent): Record<string, unknown> => ({
	display: intent.display,
	color: intent.colorName.replace("-", "."),
	backgroundColor: intent.backgroundName.replace("-", "."),
	padding: intent.paddingName,
	gap: intent.gapName,
	borderRadius: intent.radiusName,
	_hover: { color: "blue.600" },
	_md: { padding: "6" },
});

const sprinklesStyleObject = (intent: StyleIntent): Record<string, unknown> => ({
	display: intent.display,
	color: { mobile: intent.colorName, desktop: "blue-600" },
	backgroundColor: { mobile: intent.backgroundName, desktop: "white" },
	padding: { mobile: intent.paddingName, tablet: "6", desktop: "8" },
	gap: intent.gapName,
	borderRadius: intent.radiusName,
});

const stylexStyleObject = (intent: StyleIntent): Record<string, unknown> => ({
	display: intent.display,
	color: { default: intent.colorValue, ":hover": "#1d4ed8" },
	backgroundColor: {
		default: intent.backgroundValue,
		"@media (prefers-color-scheme: dark)": "#111827",
	},
	padding: { default: intent.paddingPixels, "@media (min-width: 768px)": 24 },
	gap: intent.gapName === "1" ? 4 : intent.gapName === "2" ? 8 : intent.gapName === "4" ? 16 : 24,
	borderRadius: intent.radiusPixels,
});

const vanillaStyleObject = (intent: StyleIntent): Record<string, unknown> => ({
	display: intent.display,
	color: intent.colorValue,
	backgroundColor: intent.backgroundValue,
	padding: intent.paddingValue,
	gap: intent.gapValue,
	borderRadius: intent.radiusValue,
	selectors: { "&:hover": { color: "#1d4ed8" } },
	"@media": { "screen and (min-width: 768px)": { padding: "1.5rem" } },
});

const tailwindClass = (intent: StyleIntent): string =>
	[
		intent.display,
		"items-center",
		`text-${intent.colorName}`,
		`bg-${intent.backgroundName}`,
		`p-${intent.paddingName}`,
		`gap-${intent.gapName}`,
		`rounded-${intent.radiusName}`,
		"hover:text-blue-600",
		"md:p-6",
	].join(" ");

const commonMount = (componentStyles: string): string => `${componentStyles}

const mount = (classNames) => {
\tconst root = document.createElement("main");
\troot.dataset.benchmark = "styling-size";
\tfor (const className of classNames) {
\t\tconst element = document.createElement("div");
\t\telement.className = className;
\t\troot.append(element);
\t}
\tdocument.body.append(root);
};

mount(componentStyles);
`;

const baselineStyles = (): string => `const componentStyles = [
${Array.from({ length: stylesCount }, () => '\t"",').join("\n")}
];`;

const staticMain = (library: Library, variant: Variant): string => {
	if (variant === "baseline") {
		const imports =
			library === "pandwind"
				? 'import "pandwind:css";\n'
				: library === "tailwind"
					? 'import "./styles.css";\n'
					: library === "panda"
						? 'import "./panda.css";\n'
						: library === "unocss"
							? 'import "virtual:uno.css";\n'
							: "";
		return `${imports}${baselineStyles()}${commonMount("")}`;
	}

	if (library === "pandwind") {
		return `import { css } from "./css.ts";
import "pandwind:css";

const componentStyles = [
${intents.map((intent) => `\tcss.class(${JSON.stringify(pandwindStyleObject(intent))}),`).join("\n")}
];
${commonMount("")}`;
	}
	if (library === "tailwind" || library === "unocss") {
		const stylesheet =
			library === "tailwind" ? 'import "./styles.css";' : 'import "virtual:uno.css";';
		return `${stylesheet}
const componentStyles = [
${intents.map((intent) => `\t${quote(tailwindClass(intent))},`).join("\n")}
];
${commonMount("")}`;
	}
	if (library === "panda") {
		return `import { css } from "../styled-system/css";
import "./panda.css";

const componentStyles = [
${intents.map((intent) => `\tcss(${JSON.stringify(pandaStyleObject(intent))}),`).join("\n")}
];
${commonMount("")}`;
	}
	if (library === "stylex") {
		return `import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
${intents.map((intent, index) => `\tstyle${index}: ${JSON.stringify(stylexStyleObject(intent))},`).join("\n")}
});

const componentStyles = [
${intents.map((_, index) => `\tstylex.props(styles.style${index}).className,`).join("\n")}
];
${commonMount("")}`;
	}
	if (library === "vanilla-extract") {
		return `import {
${intents.map((_, index) => `\tstyle${index},`).join("\n")}
} from "./styles.css.ts";

const componentStyles = [
${intents.map((_, index) => `\tstyle${index},`).join("\n")}
];
${commonMount("")}`;
	}
	if (library === "sprinkles") {
		return `import { sprinkles } from "./sprinkles.css.ts";

const componentStyles = [
${intents.map((intent) => `\tsprinkles(${JSON.stringify(sprinklesStyleObject(intent))}),`).join("\n")}
];
${commonMount("")}`;
	}
	if (library === "linaria") {
		return `import { css } from "@linaria/core";

const componentStyles = [
${intents
	.map(
		(intent) => `\tcss\`
\t\tdisplay: ${intent.display};
\t\tcolor: ${intent.colorValue};
\t\tbackground-color: ${intent.backgroundValue};
\t\tpadding: ${intent.paddingValue};
\t\tgap: ${intent.gapValue};
\t\tborder-radius: ${intent.radiusValue};
\t\t&:hover { color: #1d4ed8; }
\t\t@media (min-width: 768px) { padding: 1.5rem; }
\t\`,`,
	)
	.join("\n")}
];
${commonMount("")}`;
	}
	throw new Error("Unsupported static library: " + library);
};

const runtimeStyle = (intent: StyleIntent): string => `{
\tdisplay: ${quote(intent.display)},
\tcolor: runtimeColor,
\tbackgroundColor: ${quote(intent.backgroundValue)},
\tpadding: runtimePadding,
\tgap: ${quote(intent.gapValue)},
\tborderRadius: ${quote(intent.radiusValue)},
\t"&:hover": { color: "#1d4ed8" },
\t"@media (min-width: 768px)": { padding: "1.5rem" },
}`;

const runtimeMount = (): string => `
const mount = (classNames) => {
\tconst root = document.createElement("main");
\troot.dataset.benchmark = "styling-size";
\tfor (const className of classNames) {
\t\tconst element = document.createElement("div");
\t\telement.className = className;
\t\troot.append(element);
\t}
\tdocument.body.append(root);
};

mount(componentStyles);
`;

const runtimeMain = (library: Library, variant: Variant): string => {
	if (variant === "baseline") return `${baselineStyles()}${runtimeMount()}`;
	const declarations = intents.map((intent) => `\tcss.class(${runtimeStyle(intent)}),`).join("\n");
	if (library === "pandwind-css") {
		return `import { createCss } from "pandwind/css";
import { preset } from "./preset.ts";

const css = createCss(preset);
const runtimeColor = document.documentElement.dataset.color ?? "#2563eb";
const runtimePadding = document.documentElement.dataset.padding ?? "1rem";
const componentStyles = [
${declarations}
];
${runtimeMount()}`;
	}
	if (library === "pandwind-runtime") {
		return `import { createRuntimeCss } from "pandwind/css/runtime";
import { preset } from "./preset.ts";

const css = createRuntimeCss(preset);
const runtimeColor = document.documentElement.dataset.color ?? "#2563eb";
const runtimePadding = document.documentElement.dataset.padding ?? "1rem";
const componentStyles = [
${declarations}
];
${runtimeMount()}`;
	}
	if (library === "pandwind-unsafe") {
		return `import { createUnsafeCss } from "pandwind/unsafe/css";

const css = createUnsafeCss();
const runtimeColor = document.documentElement.dataset.color ?? "#2563eb";
const runtimePadding = document.documentElement.dataset.padding ?? "1rem";
const componentStyles = [
${declarations}
];
${runtimeMount()}`;
	}
	if (library === "emotion") {
		return `import { css } from "@emotion/css";

const runtimeColor = document.documentElement.dataset.color ?? "#2563eb";
const runtimePadding = document.documentElement.dataset.padding ?? "1rem";
const componentStyles = [
${intents.map((intent) => `\tcss(${runtimeStyle(intent)}),`).join("\n")}
];
${runtimeMount()}`;
	}
	if (library === "goober") {
		return `import { css } from "goober";

const runtimeColor = document.documentElement.dataset.color ?? "#2563eb";
const runtimePadding = document.documentElement.dataset.padding ?? "1rem";
const componentStyles = [
${intents.map((intent) => `\tcss(${runtimeStyle(intent)}),`).join("\n")}
];
${runtimeMount()}`;
	}
	if (library === "styled-components") {
		return `import styled from "styled-components";

const runtimeColor = document.documentElement.dataset.color ?? "#2563eb";
const runtimePadding = document.documentElement.dataset.padding ?? "1rem";
const Card = styled.div\`
\tdisplay: flex;
\tcolor: \${runtimeColor};
\tbackground-color: #ffffff;
\tpadding: \${runtimePadding};
\tgap: 0.5rem;
\tborder-radius: 0.375rem;
\t&:hover { color: #1d4ed8; }
\t@media (min-width: 768px) { padding: 1.5rem; }
\`;
const componentStyles = [Card, Card, Card, Card, Card, Card, Card, Card, Card, Card, Card, Card];
document.body.dataset.benchmark = String(componentStyles.length) + Card.toString();
`;
	}
	throw new Error("Unsupported runtime library: " + library);
};

const pandaConfigSource = (): string => `import { defineConfig } from "@pandacss/dev";

export default defineConfig({
\tpreflight: false,
\tinclude: ["src/**/*.ts"],
\tconditions: {
\t\textend: {
\t\tdark: ".dark &",
\t\tmd: "@media (min-width: 768px)",
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
\t\t\t\t},
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
\t},
\t},
});
`;

const vanillaStylesSource = (): string => `import { style } from "@vanilla-extract/css";

${intents.map((intent, index) => `export const style${index} = style(${JSON.stringify(vanillaStyleObject(intent))});`).join("\n")}
`;

const sprinklesSource =
	(): string => `import { createSprinkles, defineProperties } from "@vanilla-extract/sprinkles";

const colors = {
\t"blue-500": "#2563eb",
\t"blue-600": "#1d4ed8",
\t"gray-50": "#f9fafb",
\t"gray-900": "#111827",
\twhite: "#ffffff",
};
const spacing = { "1": "0.25rem", "2": "0.5rem", "4": "1rem", "6": "1.5rem", "8": "2rem" };
const radii = { md: "0.375rem", lg: "0.5rem" };

const properties = defineProperties({
\tconditions: {
\t\tmobile: {},
\t\ttablet: { "@media": "screen and (min-width: 640px)" },
\t\tdesktop: { "@media": "screen and (min-width: 1024px)" },
\t},
\tdefaultCondition: "mobile",
\tproperties: {
\t\tdisplay: ["flex", "grid"],
\t\tcolor: colors,
\t\tbackgroundColor: colors,
\t\tpadding: spacing,
\t\tgap: spacing,
\t\tborderRadius: radii,
\t},
});

export const sprinkles = createSprinkles(properties);
`;

const sharedStylesheetSource = (): string => `@import "tailwindcss";
@source "./main.js";
`;

const indexSource = (entryFile: string): string => `<!doctype html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body><script type="module" src="/src/${entryFile}"></script></body></html>
`;

const writeProject = (library: Library, variant: Variant): string => {
	const projectRoot = resolve(generatedRoot, library, variant);
	rmSync(projectRoot, { recursive: true, force: true });
	mkdirSync(resolve(projectRoot, "src"), { recursive: true });
	const entryFile = library === "panda" ? "main.ts" : "main.js";
	const files = new Map<string, string>([
		["index.html", indexSource(entryFile)],
		[
			`src/${entryFile}`,
			staticLibraries.has(library) ? staticMain(library, variant) : runtimeMain(library, variant),
		],
	]);
	if (staticLibraries.has(library) && library === "pandwind") {
		files.set("src/preset.ts", pandwindPresetSource());
		files.set(
			"src/css.ts",
			'import { createCss } from "pandwind/css";\nimport { preset } from "./preset.ts";\n\nexport const css = /* @__PURE__ */ createCss(preset);\n',
		);
	}
	if (library === "pandwind-css" || library === "pandwind-runtime") {
		files.set("src/preset.ts", pandwindPresetSource());
	}
	if (library === "tailwind") files.set("src/styles.css", sharedStylesheetSource());
	if (library === "panda") files.set("panda.config.ts", pandaConfigSource());
	if (library === "vanilla-extract") files.set("src/styles.css.ts", vanillaStylesSource());
	if (library === "sprinkles") files.set("src/sprinkles.css.ts", sprinklesSource());
	for (const [relativePath, content] of files) {
		const path = resolve(projectRoot, relativePath);
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, content);
	}
	return projectRoot;
};

const runCommand = (argumentsList: readonly string[], cwd = root): string => {
	const result = spawnSync("pnpm", argumentsList, {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	const output = (result.stdout ?? "") + "\n" + (result.stderr ?? "");
	if (result.status !== 0) {
		throw new Error(
			`Command failed (${String(result.status)}): pnpm ${argumentsList.join(" ")}\n${output}`,
		);
	}
	return output;
};

const preparePanda = (projectRoot: string): void => {
	const configPath = resolve(projectRoot, "panda.config.ts");
	runCommand([
		"--filter",
		benchmarkPackageName,
		"exec",
		"panda",
		"codegen",
		"--clean",
		"--silent",
		"--cwd",
		projectRoot,
		"--config",
		configPath,
	]);
	runCommand([
		"--filter",
		benchmarkPackageName,
		"exec",
		"panda",
		"cssgen",
		"src/main.ts",
		"--clean",
		"--minimal",
		"--minify",
		"--silent",
		"--cwd",
		projectRoot,
		"--config",
		configPath,
		"--outfile",
		resolve(projectRoot, "src/panda.css"),
	]);
	const outputPath = resolve(projectRoot, "src/panda.css");
	if (!existsSync(outputPath)) writeFileSync(outputPath, "");
};

const stylexPlugin = (): PluginOption => {
	const rules: Parameters<typeof stylexBabelPlugin.processStylexRules>[0] = [];
	return {
		name: "pandwind-benchmark-stylex",
		enforce: "pre",
		transform(code, id) {
			if (!id.endsWith("/src/main.js")) return null;
			const result = transformSync(code, {
				filename: id,
				plugins: [[stylexBabelPlugin, { dev: false, treeshakeCompensation: false }]],
			});
			const metadata = result?.metadata as { readonly stylex?: typeof rules } | undefined;
			if (metadata?.stylex !== undefined) rules.push(...metadata.stylex);
			return result?.code === undefined || result.code === null ? null : { code: result.code };
		},
		generateBundle() {
			const css = stylexBabelPlugin.processStylexRules(rules, { useLayers: false });
			if (css.length > 0) this.emitFile({ type: "asset", fileName: "stylex.css", source: css });
		},
	};
};

const loadPandwindPreset = async (
	projectRoot: string,
): Promise<Parameters<typeof pandwindCssVite>[0]> => {
	const url = pathToFileURL(resolve(projectRoot, "src/preset.ts"));
	url.search = projectRoot;
	const module = await import(url.href);
	return module.preset;
};

const createPlugins = async (library: Library, projectRoot: string): Promise<PluginOption[]> => {
	if (library === "pandwind") {
		return [
			pandwindCssVite(await loadPandwindPreset(projectRoot), {
				root: projectRoot,
			}) as unknown as PluginOption,
		];
	}
	if (library === "tailwind") return [tailwindcss()];
	if (library === "stylex") return [stylexPlugin()];
	if (library === "vanilla-extract" || library === "sprinkles") {
		return [vanillaExtractPlugin({ identifiers: "short" })];
	}
	if (library === "unocss") {
		return [
			UnoCSS({
				presets: [presetWind3()],
				content: { pipeline: { include: /\/src\/main\.js$/u } },
			}),
		];
	}
	if (library === "linaria") return [wyw()];
	return [];
};

const readOutput = (outputRoot: string): BuildMetrics => {
	const totals = { js: { min: 0, gz: 0 }, css: { min: 0, gz: 0 } };
	const visit = (directory: string): void => {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const path = resolve(directory, entry.name);
			if (entry.isDirectory()) {
				visit(path);
				continue;
			}
			const kind = entry.name.endsWith(".js")
				? "js"
				: entry.name.endsWith(".css")
					? "css"
					: undefined;
			if (kind === undefined) continue;
			const bytes = readFileSync(path);
			totals[kind].min += bytes.byteLength;
			totals[kind].gz += gzipSync(bytes, { level: 6 }).byteLength;
		}
	};
	visit(outputRoot);
	return {
		js: totals.js,
		css: totals.css,
		total: {
			min: totals.js.min + totals.css.min,
			gz: totals.js.gz + totals.css.gz,
		},
	};
};

const subtractMetric = (styled: SizeMetric, baseline: SizeMetric): SizeMetric => ({
	min: styled.min - baseline.min,
	gz: styled.gz - baseline.gz,
});

const subtractMetrics = (styled: BuildMetrics, baseline: BuildMetrics): BuildMetrics => ({
	js: subtractMetric(styled.js, baseline.js),
	css: subtractMetric(styled.css, baseline.css),
	total: subtractMetric(styled.total, baseline.total),
});

const measureBuild = async (library: Library, projectRoot: string): Promise<BuildMetrics> => {
	const outputRoot = resolve(projectRoot, "dist");
	rmSync(outputRoot, { recursive: true, force: true });
	await build({
		root: projectRoot,
		configFile: false,
		logLevel: "error",
		plugins: await createPlugins(library, projectRoot),
		build: {
			outDir: "dist",
			emptyOutDir: true,
			minify: "esbuild",
			sourcemap: false,
			reportCompressedSize: false,
			rollupOptions: { input: resolve(projectRoot, "index.html") },
		},
	});
	return readOutput(outputRoot);
};

const laneInfo = (
	library: Library,
): Omit<WorkloadResult, "samples" | "baseline" | "styled" | "delta"> => {
	if (staticLibraries.has(library)) {
		const buildMode =
			library === "pandwind"
				? "Vite + pandwindCssVite"
				: library === "panda"
					? "Panda codegen/cssgen + Vite"
					: library === "stylex"
						? "StyleX Babel transform + Vite"
						: library === "vanilla-extract" || library === "sprinkles"
							? "Vanilla Extract Vite plugin"
							: library === "tailwind"
								? "Tailwind CSS Vite plugin"
								: library === "unocss"
									? "UnoCSS Vite plugin"
									: "Linaria Vite plugin";
		return {
			library,
			category: "static",
			buildMode,
			cssDelivery: "extracted",
			arbitraryRuntimeValues: false,
		};
	}
	const buildMode =
		library === "pandwind-css"
			? "Vite + pandwind/css"
			: library === "pandwind-runtime"
				? "Vite + pandwind/css/runtime"
				: library === "pandwind-unsafe"
					? "Vite + pandwind/unsafe/css"
					: library === "styled-components"
						? "Vite + styled.div"
						: `Vite + ${library}`;
	return {
		library,
		category: "runtime",
		buildMode,
		cssDelivery: library === "pandwind-css" || library === "pandwind-unsafe" ? "none" : "injected",
		arbitraryRuntimeValues: true,
	};
};

const measureWorkload = async (library: Library, runs: number): Promise<WorkloadResult> => {
	const baselineSizes: BuildMetrics[] = [];
	const styledSizes: BuildMetrics[] = [];
	for (let run = 0; run < runs; run += 1) {
		const baselineRoot = writeProject(library, "baseline");
		if (library === "panda") preparePanda(baselineRoot);
		baselineSizes.push(await measureBuild(library, baselineRoot));
		const styledRoot = writeProject(library, "styled");
		if (library === "panda") preparePanda(styledRoot);
		styledSizes.push(await measureBuild(library, styledRoot));
	}
	const medianMetric = (values: readonly number[]): number => {
		const sorted = values.toSorted((left, right) => left - right);
		const middle = Math.floor(sorted.length / 2);
		return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
	};
	const medianMetrics = (values: readonly BuildMetrics[]): BuildMetrics => ({
		js: {
			min: medianMetric(values.map((value) => value.js.min)),
			gz: medianMetric(values.map((value) => value.js.gz)),
		},
		css: {
			min: medianMetric(values.map((value) => value.css.min)),
			gz: medianMetric(values.map((value) => value.css.gz)),
		},
		total: {
			min: medianMetric(values.map((value) => value.total.min)),
			gz: medianMetric(values.map((value) => value.total.gz)),
		},
	});
	const baseline = medianMetrics(baselineSizes);
	const styled = medianMetrics(styledSizes);
	return {
		...laneInfo(library),
		samples: runs,
		baseline,
		styled,
		delta: subtractMetrics(styled, baseline),
	};
};

const parseOptions = (argumentsList: readonly string[]): Options => {
	let update = false;
	let runs = 1;
	let library: Library | undefined;
	let category: Category | undefined;
	for (let index = 0; index < argumentsList.length; index += 1) {
		const argument = argumentsList[index];
		if (argument === "--" || argument === "--update") {
			if (argument === "--update") update = true;
			continue;
		}
		if (argument === "--runs") {
			const value = Number(argumentsList[index + 1]);
			if (!Number.isInteger(value) || value < 1)
				throw new Error("--runs must be a positive integer");
			runs = value;
			index += 1;
			continue;
		}
		if (argument === "--library") {
			const value = argumentsList[index + 1];
			if (!libraries.includes(value as Library))
				throw new Error("--library must be one of " + libraries.join(", "));
			library = value as Library;
			index += 1;
			continue;
		}
		if (argument === "--category") {
			const value = argumentsList[index + 1];
			if (value !== "static" && value !== "runtime")
				throw new Error("--category must be static or runtime");
			category = value;
			index += 1;
			continue;
		}
		throw new Error("Unknown argument: " + argument);
	}
	return {
		update,
		runs,
		...(library === undefined ? {} : { library }),
		...(category === undefined ? {} : { category }),
	};
};

const readManifest = (): {
	readonly dependencies?: Record<string, string>;
	readonly devDependencies?: Record<string, string>;
} =>
	JSON.parse(readFileSync(resolve(benchmarkRoot, "package.json"), "utf8")) as {
		readonly dependencies?: Record<string, string>;
		readonly devDependencies?: Record<string, string>;
	};

const packageVersions = (): Readonly<Record<string, string>> => {
	const manifest = readManifest();
	const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
	const names = [
		"@babel/core",
		"@emotion/css",
		"@linaria/core",
		"@pandacss/dev",
		"@stylexjs/babel-plugin",
		"@stylexjs/stylex",
		"@tailwindcss/vite",
		"@unocss/preset-wind3",
		"@unocss/vite",
		"@vanilla-extract/css",
		"@vanilla-extract/sprinkles",
		"@vanilla-extract/vite-plugin",
		"@wyw-in-js/vite",
		"esbuild",
		"goober",
		"pandwind",
		"styled-components",
		"tailwindcss",
		"unocss",
		"vite",
	];
	return Object.fromEntries(names.map((name) => [name, dependencies[name] ?? "workspace:*"]));
};

const readSnapshot = (): Snapshot | undefined => {
	if (!existsSync(snapshotPath)) return undefined;
	return JSON.parse(readFileSync(snapshotPath, "utf8")) as Snapshot;
};

const buildSnapshot = (
	workloads: readonly WorkloadResult[],
	runs: number,
	previous: Snapshot | undefined,
): Snapshot => {
	const keys = new Set(workloads.map((workload) => workload.library));
	const preserved = previous?.workloads.filter((workload) => !keys.has(workload.library)) ?? [];
	return {
		schema: "pandwind.styling-size/1",
		source: "runner/benchmark.mts",
		updatedAt: new Date().toISOString().slice(0, 10),
		samples: runs,
		environment: {
			platform: process.platform,
			arch: process.arch,
			node: process.version,
			vite: packageVersions().vite!,
			esbuild: packageVersions().esbuild!,
		},
		packages: packageVersions(),
		workloads: [...preserved, ...workloads].toSorted(
			(left, right) =>
				left.category.localeCompare(right.category) || left.library.localeCompare(right.library),
		),
		tolerances: { pandwind: { relative: 0.1, absoluteBytes: 128 } },
	};
};

const assertNoRegression = (measured: readonly WorkloadResult[], previous: Snapshot): void => {
	const previousByLibrary = new Map(
		previous.workloads.map((workload) => [workload.library, workload]),
	);
	const failures: string[] = [];
	for (const workload of measured) {
		if (!workload.library.startsWith("pandwind")) continue;
		const baseline = previousByLibrary.get(workload.library);
		if (baseline === undefined)
			throw new Error(`Missing ${workload.library} baseline; run with --update first`);
		const checks: readonly [string, number, number][] = [
			["js.min", workload.styled.js.min, baseline.styled.js.min],
			["js.gz", workload.styled.js.gz, baseline.styled.js.gz],
			["css.min", workload.styled.css.min, baseline.styled.css.min],
			["css.gz", workload.styled.css.gz, baseline.styled.css.gz],
			["total.min", workload.styled.total.min, baseline.styled.total.min],
			["total.gz", workload.styled.total.gz, baseline.styled.total.gz],
		];
		for (const [name, actual, expected] of checks) {
			if (actual > expected + Math.max(128, expected * 0.1)) {
				failures.push(`${workload.library} ${name}: ${actual} > ${expected} baseline + 10%`);
			}
		}
	}
	if (failures.length > 0)
		throw new Error("Pandwind ecosystem bundle-size regression:\n- " + failures.join("\n- "));
};

const formatSize = (value: number): string => {
	if (value === 0) return "0.00 KB";
	const sign = value < 0 ? "-" : "+";
	return `${sign}${(Math.abs(value) / 1000).toFixed(2)} KB`;
};

const markdownTable = (
	headers: readonly string[],
	rows: readonly (readonly string[])[],
): string => {
	const widths = headers.map((header, index) =>
		Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0)),
	);
	const format = (row: readonly string[]): string =>
		`| ${row.map((value, index) => (index === 0 ? value.padEnd(widths[index]!) : value.padStart(widths[index]!))).join(" | ")} |`;
	return [
		format(headers),
		format(
			headers.map((header, index) =>
				index === 0
					? "-".repeat(widths[index]!)
					: "-".repeat(Math.max(2, widths[index]! - 1)) + ":",
			),
		),
		...rows.map(format),
	].join("\n");
};

const displayLibrary = (library: Library): string =>
	({
		pandwind: "Pandwind css() (static)",
		tailwind: "Tailwind CSS",
		panda: "Panda CSS",
		stylex: "StyleX",
		"vanilla-extract": "Vanilla Extract",
		sprinkles: "Sprinkles",
		unocss: "UnoCSS",
		linaria: "Linaria",
		"pandwind-css": "Pandwind css() (dynamic)",
		"pandwind-runtime": "Pandwind createRuntimeCss()",
		"pandwind-unsafe": "Pandwind createUnsafeCss()",
		emotion: "Emotion",
		"styled-components": "styled-components",
		goober: "Goober",
	})[library];

const renderRows = (workloads: readonly WorkloadResult[]): string => {
	const rows = workloads
		.toSorted(
			(left, right) =>
				left.delta.total.gz - right.delta.total.gz || left.library.localeCompare(right.library),
		)
		.map((workload, index) => [
			String(index + 1),
			displayLibrary(workload.library),
			workload.buildMode,
			formatSize(workload.delta.js.min),
			formatSize(workload.delta.js.gz),
			formatSize(workload.delta.css.min),
			formatSize(workload.delta.css.gz),
			formatSize(workload.delta.total.gz),
			workload.cssDelivery,
			workload.arbitraryRuntimeValues ? "yes" : "no",
		]);
	return markdownTable(
		[
			"Rank",
			"Library",
			"Build mode",
			"JS min",
			"JS gzip",
			"CSS min",
			"CSS gzip",
			"Total gzip",
			"CSS delivery",
			"Runtime values",
		],
		rows,
	);
};

const renderReport = (snapshot: Snapshot): string => {
	const staticWorkloads = snapshot.workloads.filter((workload) => workload.category === "static");
	const runtimeWorkloads = snapshot.workloads.filter((workload) => workload.category === "runtime");
	return [
		"# Ecosystem styling bundle-size comparison",
		"",
		`Generated by runner/benchmark.mts on ${snapshot.updatedAt}; each row is the styled Vite build minus the matching unstyled app baseline. Values are signed decimal KB (1 KB = 1,000 bytes).`,
		"",
		"Static lanes ship extracted CSS:",
		"",
		renderRows(staticWorkloads),
		"",
		"Runtime lanes create styles from a dynamic value. CSS asset deltas do not include browser-created rules; the CSS delivery column distinguishes libraries that inject them from Pandwind fallback lanes that only return carriers and require a host stylesheet:",
		"",
		renderRows(runtimeWorkloads),
		"",
		"The application intent is a repeated button/card workload with colors, spacing, radii, hover, and responsive styles. Competitor rows are descriptive; Pandwind rows are regression-gated.",
		"",
		"## Package versions",
		"",
		...Object.entries(snapshot.packages).map(([name, version]) => `- ${name}: ${version}`),
		"",
		`Environment: ${snapshot.environment.platform}/${snapshot.environment.arch}, ${snapshot.environment.node}, Vite ${snapshot.environment.vite}, esbuild ${snapshot.environment.esbuild}; ${snapshot.samples} run(s) per lane.`,
		"",
	].join("\n");
};

const writeSnapshot = (snapshot: Snapshot): void => {
	writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2) + "\n");
	writeFileSync(reportPath, renderReport(snapshot));
};

const printUsage = (): void => {
	console.log(
		[
			"Usage: pnpm run bench:size:ecosystem -- [options]",
			"",
			"Options:",
			"  --update             write the JSON, Markdown, and PERF.md records",
			"  --runs N             fresh Vite builds per lane (default: 1)",
			"  --library NAME       one lane: " + libraries.join(", "),
			"  --category NAME      static or runtime",
		].join("\n"),
	);
};

const main = async (): Promise<void> => {
	const argumentsList = process.argv.slice(2);
	if (argumentsList.includes("--help") || argumentsList.includes("-h")) {
		printUsage();
		return;
	}
	const options = parseOptions(argumentsList);
	const selectedLibraries = options.library === undefined ? libraries : [options.library];
	const filteredLibraries = selectedLibraries.filter(
		(library) =>
			options.category === undefined ||
			(options.category === "static") === staticLibraries.has(library),
	);
	if (filteredLibraries.length === 0) throw new Error("No libraries match the selected category");
	rmSync(generatedRoot, { recursive: true, force: true });
	mkdirSync(generatedRoot, { recursive: true });
	const workloads: WorkloadResult[] = [];
	for (const library of filteredLibraries) {
		console.log(`Measuring ${library}...`);
		workloads.push(await measureWorkload(library, options.runs));
	}
	const previous = readSnapshot();
	if (options.update) {
		const snapshot = buildSnapshot(workloads, options.runs, previous);
		writeSnapshot(snapshot);
		writePerformanceSummary();
		return;
	}
	if (previous === undefined) throw new Error(`Missing ${snapshotPath}; run with --update first`);
	assertNoRegression(workloads, previous);
};

if (process.argv[1] === import.meta.filename) await main();
