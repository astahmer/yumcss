import {
	normalizeInstalledTargetPackage, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CodemodAdapterId } from "@yumcss/codemod/swap";
import {
	browserProof,
	generatedCss,
	parseInstalledProofMigration,
	run,
	runCaptured,
	withInstalledProofProject,
	writeJson,
} from "./installed-proof.ts";
import { readPinnedSource } from "./adapter-proof-harness.ts";

const repositoryRoot = resolve(import.meta.dirname, "..");
const yumcssPackageRoot = join(repositoryRoot, "packages/yumcss");
const proofSchema = "yumcss.installed-project-proof/1" as const;

const reference = {
	clone: "treat",
	repository: "https://github.com/seek-oss/treat",
	commit: "1cc001170ee6b66b1d960ac4097fb84597163d1c",
	path: "examples/gatsby-plugin-treat-example/src/components/Button.treat.js",
} as const;

const versions = {
	"@types/node": "26.4.1",
	"@vitejs/plugin-react-swc": "4.3.3",
	"css-loader": "5.2.7",
	"mini-css-extract-plugin": "1.6.2",
	oxcParser: "0.148.0",
	yumcss: `file:${yumcssPackageRoot}`,
	react: "19.2.8",
	"react-dom": "19.2.8",
	treat: "2.0.4",
	typescript: "7.0.2",
	"virtual-resource-loader": "1.0.0",
	vite: "8.2.2",
	webpack: "5.110.3",
	"webpack-cli": "6.0.1",
} as const;

const fontStack = readPinnedSource({
	...reference,
	path: "examples/gatsby-plugin-treat-example/src/components/fontStack.js",
});
const treatStyles = readPinnedSource(reference).replace("./fontStack';", "./fontStack.js';");

const buttonSource = `import React from "react";
import { button } from "./Button.treat.js";

export const Button = ({ children, ...otherProps }) =>
	React.createElement("button", { ...otherProps, className: button }, children);
`;

const appSource = `import React, { useState } from "react";
import { Button } from "./Button.js";

export const App = () => {
	const [shown, setShown] = useState(false);
	return React.createElement(
		Button,
		{ "data-proof": true, disabled: shown, onClick: () => setShown(true) },
		shown ? "Enjoy a treat!" : "Show the secret message 🤫",
	);
};
`;

const mainSource = `import { hydrateRoot } from "react-dom/client";
import { App } from "./App.js";

hydrateRoot(document.getElementById("root"), React.createElement(App));
`;

const mainSourceWithReact = `import React from "react";
${mainSource}`;

const entryServerSource = `import React from "react";
import { renderToString } from "react-dom/server";
import { App } from "./App.js";

export const render = () => renderToString(React.createElement(App));
`;

const webpackConfig = `const path = require("node:path");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const { TreatPlugin } = require("treat/webpack-plugin");

const server = process.env.TREAT_TARGET === "server";

module.exports = {
	mode: "production",
	target: server ? "node" : "web",
	entry: path.resolve(__dirname, server ? "src/entry-server.js" : "src/main.js"),
	output: {
		path: path.resolve(__dirname, "dist"),
		filename: server ? "entry-server.cjs" : "main.js",
		...(server ? { library: { type: "commonjs2" } } : {}),
	},
	module: { rules: [] },
	plugins: [
		new TreatPlugin({
			outputCSS: !server,
			outputLoaders: server ? [] : [MiniCssExtractPlugin.loader],
		}),
		...(server ? [] : [new MiniCssExtractPlugin({ filename: "main.css" })]),
	],
	resolve: { extensions: [".js", ".json"] },
};
`;

const targetViteConfig = `import react from "@vitejs/plugin-react-swc";
import { yumcssExtractVite } from "yumcss/vite";
import { preset } from "./yumcss/preset";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react(), yumcssExtractVite(preset, { root: "." })],
	ssr: { noExternal: ["yumcss"] },
});
`;

const tsConfig = {
	compilerOptions: {
		allowJs: true,
		checkJs: false,
		lib: ["ESNext", "DOM", "DOM.Iterable"],
		module: "ESNext",
		moduleResolution: "Bundler",
		noEmit: true,
		target: "ES2022",
		strict: true,
		skipLibCheck: true,
		types: ["node"],
	},
	include: ["src", "vite.config.ts", "webpack.config.cjs"],
};

const packageJson = (target: boolean): Record<string, unknown> => ({
	name: target ? "yumcss-treat-target-proof" : "yumcss-treat-source-proof",
	private: true,
	type: "module",
	scripts: target
		? {
				build: "vite build",
				ssr: "vite build --ssr src/entry-server.js",
				typecheck: "tsc --noEmit",
			}
		: {
				build: "webpack --config webpack.config.cjs",
				ssr: "TREAT_TARGET=server webpack --config webpack.config.cjs",
				typecheck: "tsc --noEmit",
			},
	dependencies: {
		...(target ? { yumcss: versions.yumcss } : { treat: versions.treat }),
		react: versions.react,
		"react-dom": versions["react-dom"],
	},
	devDependencies: target
		? {
				"@types/node": versions["@types/node"],
				"@vitejs/plugin-react-swc": versions["@vitejs/plugin-react-swc"],
				"oxc-parser": versions.oxcParser,
				typescript: versions.typescript,
				vite: versions.vite,
			}
		: {
				"@types/node": versions["@types/node"],
				"css-loader": versions["css-loader"],
				"mini-css-extract-plugin": versions["mini-css-extract-plugin"],
				typescript: versions.typescript,
				"virtual-resource-loader": versions["virtual-resource-loader"],
				webpack: versions.webpack,
				"webpack-cli": versions["webpack-cli"],
			},
});

const writeIndex = (root: string, markup: string, target: boolean): void => {
	const entry = target ? "/src/main.js" : "/main.js";
	const stylesheet = target ? "" : '<link rel="stylesheet" href="/main.css">';
	writeFileSync(
		join(root, target ? "index.html" : "dist/index.html"),
		`${stylesheet}<div id="root">${markup}</div><script type="module" src="${entry}"></script>\n`,
	);
};

const createFixture = (root: string, target: boolean): void => {
	mkdirSync(join(root, "src"), { recursive: true });
	writeFileSync(join(root, "package.json"), `${JSON.stringify(packageJson(target), null, "\t")}\n`);
	writeFileSync(join(root, "tsconfig.json"), `${JSON.stringify(tsConfig, null, "\t")}\n`);
	if (target) writeFileSync(join(root, "vite.config.ts"), targetViteConfig);
	else writeFileSync(join(root, "webpack.config.cjs"), webpackConfig);
	writeFileSync(join(root, "index.html"), '<div id="root"></div>\n');
	writeFileSync(join(root, "src/fontStack.js"), fontStack);
	writeFileSync(join(root, "src/Button.treat.js"), treatStyles);
	writeFileSync(join(root, "src/Button.js"), buttonSource);
	writeFileSync(join(root, "src/App.js"), appSource);
	writeFileSync(join(root, "src/main.js"), mainSourceWithReact);
	writeFileSync(join(root, "src/entry-server.js"), entryServerSource);
};

const normalizeMarkup = (markup: string): string =>
	markup
		.replace(/\s(?:class|style|data-reactroot)=(?:"[^"]*"|'[^']*'|[^\s>]+)/gu, "")
		.replace(/<!--[^>]*-->/gu, "")
		.replace(/\s+/gu, " ")
		.trim();

const proofIsComplete = (report: Record<string, any>): boolean =>
	report.migration.converted > 0 &&
	report.migration.skipped === 0 &&
	report.migration.residuals === 0 &&
	report.migration.canonical.checked &&
	report.migration.canonical.equal &&
	report.migration.targetUsesYumCSS &&
	report.dependencies.targetNodeModule &&
	report.checks.hydration &&
	report.ssr.markupEquivalent &&
	report.browser.equivalent &&
	report.css.sourceBytes > 0 &&
	report.css.targetBytes > 0 &&
	(report.css.targetNotLarger || report.css.comparison === "diagnostic");

const runProof = async (): Promise<void> => {
	run("pnpm", ["--filter", "yumcss", "run", "build"], repositoryRoot);
	await withInstalledProofProject(
		"yumcss-treat-installed-proof-",
		async ({ sourceRoot, targetRoot }) => {
			createFixture(sourceRoot, false);
			createFixture(targetRoot, true);
			run("pnpm", ["install", "--ignore-scripts", "--no-frozen-lockfile"], sourceRoot);
			run("pnpm", ["install", "--ignore-scripts", "--no-frozen-lockfile"], targetRoot);
			run("pnpm", ["run", "typecheck"], sourceRoot);
			run("pnpm", ["run", "ssr"], sourceRoot);
			const loadedSourceModule = await import(
				pathToFileURL(join(sourceRoot, "dist/entry-server.cjs")).href
			);
			const sourceModule = (
				"render" in loadedSourceModule ? loadedSourceModule : loadedSourceModule.default
			) as { render: () => string };
			const sourceMarkup = sourceModule.render();
			writeIndex(sourceRoot, sourceMarkup, false);
			run("pnpm", ["run", "build"], sourceRoot);
			const migration = parseInstalledProofMigration(
				runCaptured(
					"nub",
					[
						"--conditions",
						"yumcss",
						join(repositoryRoot, "packages/codemod/src/cli.ts"),
						"migrate",
						"--from",
						CodemodAdapterId.Treat,
						"--to",
						CodemodAdapterId.YumCSS,
						"--root",
						targetRoot,
						"--no-install",
						"src/Button.treat.js",
						"--report",
						"--report-format=json",
					],
					repositoryRoot,
				),
				"treat",
			);
			writeFileSync(join(targetRoot, "src/main.js"), `import React from "react";\n${mainSource}`);
			writeFileSync(
				join(targetRoot, "src/entry-server.js"),
				`import React from "react";
import { renderToString } from "react-dom/server";
import { App } from "./App.js";

export const render = () => renderToString(React.createElement(App));
`,
			);
			run("pnpm", ["run", "typecheck"], targetRoot);
			run("pnpm", ["run", "ssr"], targetRoot);
			const targetEntry = readFileSync(join(targetRoot, "dist/entry-server.js"), "utf8");
			if (!targetEntry.includes("render")) throw new Error("target SSR bundle did not emit render");
			const targetSsr = runCaptured(
				"node",
				[
					"-e",
					`import(${JSON.stringify(pathToFileURL(join(targetRoot, "dist/entry-server.js")).href)}).then(async (module) => process.stdout.write(JSON.stringify({ markup: await module.render() })))`,
				],
				targetRoot,
			);
			const targetMarkup = (JSON.parse(targetSsr) as { markup: string }).markup;
			writeIndex(targetRoot, targetMarkup, true);
			run("pnpm", ["run", "build"], targetRoot);
			const browser = await browserProof({
				repositoryRoot,
				sourceRoot,
				targetRoot,
				collectRuntimeStyleBytes: true,
				resetStyles:
					"html, body, #root { margin: 0; padding: 0; } #root { width: 640px; } [data-proof] { appearance: none; border: 0; box-sizing: border-box; display: block; font: 16px/24px Arial, sans-serif; height: 56px; margin: 0; width: 260px; }",
				computedProperties: [
					"background-color",
					"color",
					"padding-left",
					"border-radius",
					"opacity",
				],
			});
			const sourceBytes = Math.max(
				Buffer.byteLength(generatedCss(sourceRoot)),
				browser.runtimeStyleBytes?.source ?? 0,
			);
			const targetBytes = Math.max(
				Buffer.byteLength(generatedCss(targetRoot)),
				browser.runtimeStyleBytes?.target ?? 0,
			);
			const report = {
				schema: proofSchema,
				reference: {
					repository: reference.repository,
					commit: reference.commit,
					sourceEntry: reference.path,
				},
				route: { from: CodemodAdapterId.Treat, to: CodemodAdapterId.YumCSS },
				fixture: {
					files: [
						"src/Button.treat.js",
						"src/Button.js",
						"src/App.js",
						"webpack.config.cjs",
						"vite.config.ts",
					],
					isolated: true,
				},
				dependencies: {
					installed: true,
					targetPackage: normalizeInstalledTargetPackage(versions.yumcss, repositoryRoot),
					targetNodeModule: existsSync(join(targetRoot, "node_modules/yumcss/package.json")),
				},
				migration: {
					...migration,
					targetUsesYumCSS: readFileSync(
						join(targetRoot, "src/Button.treat.js"),
						"utf8",
					).includes("yumcss"),
				},
				checks: {
					sourceTypecheck: true,
					targetTypecheck: true,
					sourceBuild: true,
					targetBuild: true,
					sourceSsr: true,
					targetSsr: true,
					hydration: browser.hydrationErrors.length === 0,
				},
				ssr: { markupEquivalent: normalizeMarkup(sourceMarkup) === normalizeMarkup(targetMarkup) },
				browser,
				css: {
					sourceBytes,
					targetBytes,
					targetNotLarger: targetBytes <= sourceBytes,
					comparison: targetBytes <= sourceBytes ? "comparable" : "diagnostic",
				},
			};
			writeJson(join(repositoryRoot, "plans/evidence/treat-installed-proof.json"), report);
			console.log(JSON.stringify(report, null, 2));
			console.error("wrote installed treat proof: plans/evidence/treat-installed-proof.json");
			if (!proofIsComplete(report)) process.exitCode = 1;
			return report;
		},
		{ retain: (report) => !proofIsComplete(report as Record<string, any>), retainOnError: true },
	);
};

if (import.meta.main) await runProof();
