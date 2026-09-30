import { proofSourceFingerprint } from "./proof-source-fingerprint.ts";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { CodemodAdapterId, runAdapterMigrationAsync } from "pandwind-codemod/swap";
import {
	browserProof,
	generatedCss,
	renderInstalledServer,
	run,
	withInstalledProofProject,
	writeIndex,
	writeJson,
} from "./installed-proof.ts";

const repositoryRoot = resolve(import.meta.dirname, "..");
const styles =
	'{ backgroundColor: "#123456", color: "white", padding: "16px", borderRadius: "6px", "&:hover": { backgroundColor: "#2563eb" } }';
const pandwindSource = `import { createUnsafeCss } from "pandwind/unsafe/css";
const css = createUnsafeCss();
const card = css.class(${styles});
export const App = () => <button data-proof className={card}>Proof</button>;
`;
const styledSource = `import { styled } from "styled-components";
export const Card = styled.button.attrs({ type: "button" })(${styles});
export const App = () => <Card data-proof>Proof</Card>;
`;
const chakraSource = `import { Box, ChakraProvider, defaultSystem } from "@chakra-ui/react";
export const App = () => <ChakraProvider value={defaultSystem}><Box data-proof flex="1" alignSelf="stretch" order={2} backgroundColor="#123456" color="white" padding="16px" borderRadius="6px" _hover={{ backgroundColor: "#2563eb" }}>Proof</Box></ChakraProvider>;
`;
const routes = [
	{ from: CodemodAdapterId.Pandwind, to: CodemodAdapterId.Mui, source: pandwindSource },
	{ from: CodemodAdapterId.ChakraUi, to: CodemodAdapterId.Emotion, source: chakraSource },
	{ from: CodemodAdapterId.Pandwind, to: CodemodAdapterId.Emotion, source: pandwindSource },
	{ from: CodemodAdapterId.Pandwind, to: CodemodAdapterId.CssModules, source: pandwindSource },
	{ from: CodemodAdapterId.Pandwind, to: CodemodAdapterId.UnoCSS, source: pandwindSource },
	{ from: CodemodAdapterId.StyledComponents, to: CodemodAdapterId.Emotion, source: styledSource },
	{
		from: CodemodAdapterId.StyledComponents,
		to: CodemodAdapterId.CssModules,
		source: styledSource,
	},
	{
		from: CodemodAdapterId.StyledComponents,
		to: CodemodAdapterId.AuthoredCss,
		source: styledSource,
	},
	{
		from: CodemodAdapterId.StyledComponents,
		to: CodemodAdapterId.VanillaExtract,
		source: styledSource,
	},
];
const versions = {
	"@emotion/css": "11.13.5",
	"@emotion/react": "11.14.0",
	"@mui/material": "9.4.0",
	"@chakra-ui/react": "3.37.0",
	"@emotion/styled": "11.14.1",
	"@types/react": "19.2.18",
	"@types/react-dom": "19.2.7",
	"@vanilla-extract/css": "1.21.2",
	"@vanilla-extract/vite-plugin": "5.2.6",
	"@vitejs/plugin-react-swc": "4.3.3",
	"styled-components": "6.5.3",
	react: "19.2.8",
	"react-dom": "19.2.8",
	typescript: "7.0.2",
	vite: "8.2.2",
	"oxc-parser": "0.148.0",
	unocss: "66.10.0",
	"@unocss/core": "66.10.0",
	"@unocss/config": "66.10.0",
	pandwind: `file:${join(repositoryRoot, "packages/pandwind")}`,
};
const digest = (content: string) => createHash("sha256").update(content).digest("hex");
const sourceRevision = execFileSync("jj", ["log", "-r", "@", "--no-graph", "-T", "commit_id"], {
	cwd: repositoryRoot,
	encoding: "utf8",
}).trim();

const writeFixture = ({
	root,
	source,
	from,
	to,
}: {
	readonly root: string;
	readonly source: string;
	readonly from: CodemodAdapterId;
	readonly to?: CodemodAdapterId;
}) => {
	mkdirSync(join(root, "src"), { recursive: true });
	writeJson(join(root, "package.json"), {
		name: "pandwind-installed-target-proof",
		private: true,
		type: "module",
		packageManager: "pnpm@12.3.4",
		dependencies: versions,
		scripts: {
			build: "vite build",
			ssr: "vite build --ssr src/entry-server.tsx",
			typecheck: "tsc --noEmit",
		},
	});
	writeFileSync(
		join(root, "pnpm-workspace.yaml"),
		'verifyDepsBeforeRun: false\nallowBuilds:\n  "@swc/core": false\n  esbuild: false\n',
	);
	writeJson(join(root, "tsconfig.json"), {
		compilerOptions: {
			jsx: "react-jsx",
			target: "ESNext",
			module: "ESNext",
			moduleResolution: "Bundler",
			lib: ["ESNext", "DOM"],
			types: ["vite/client"],
			strict: true,
			skipLibCheck: true,
			noEmit: true,
			allowImportingTsExtensions: true,
		},
		include: ["src"],
	});
	const pandwind = to === undefined && from === CodemodAdapterId.Pandwind;
	const vanillaExtract = to === CodemodAdapterId.VanillaExtract;
	const unoCss = to === CodemodAdapterId.UnoCSS;
	if (unoCss)
		writeFileSync(
			join(root, "uno.config.ts"),
			'import { defineConfig } from "unocss"; import { presetWind3 } from "unocss/preset-wind3"; export default defineConfig({ presets: [presetWind3()] });\n',
		);
	writeFileSync(
		join(root, "vite.config.ts"),
		`import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";
${pandwind ? 'import { pandwindCssVite } from "pandwind/vite";\nimport { defaultPreset } from "pandwind/preset/default";' : ""}
${vanillaExtract ? 'import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";' : ""}
${unoCss ? 'import unoCss from "unocss/vite";' : ""}
export default defineConfig({ plugins: [${pandwind ? 'pandwindCssVite(defaultPreset, { root: "." }),' : ""}${vanillaExtract ? "vanillaExtractPlugin()," : ""}${unoCss ? "unoCss()," : ""}react()] });
`,
	);
	writeFileSync(join(root, "src/App.tsx"), source);
	writeFileSync(join(root, "src/virtual.d.ts"), 'declare module "pandwind:css";\n');
	writeFileSync(
		join(root, "src/main.tsx"),
		`${pandwind ? 'import "pandwind:css";\n' : ""}${unoCss ? 'import "virtual:uno.css";\n' : ""}import { hydrateRoot } from "react-dom/client";
import { App } from "./App";
hydrateRoot(document.getElementById("root")!, <App />);
`,
	);
	writeFileSync(join(root, "src/entry-server.tsx"), 'export { App } from "./App";\n');
	writeFileSync(
		join(root, "index.html"),
		'<div id="root"></div><script type="module" src="/src/main.tsx"></script>\n',
	);
};

const reports = await withInstalledProofProject(
	"pandwind-outbound-proof-",
	async ({ sourceRoot, targetRoot }) => {
		writeFixture({ root: sourceRoot, source: pandwindSource, from: CodemodAdapterId.Pandwind });
		run("pnpm", ["install", "--ignore-scripts"], sourceRoot);
		const reports = [];
		for (const route of routes) {
			writeFixture({ root: sourceRoot, source: route.source, from: route.from });
			run("pnpm", ["run", "typecheck"], sourceRoot);
			const sourceSsr = await renderInstalledServer(sourceRoot, {
				collectStyledComponents: route.from === CodemodAdapterId.StyledComponents,
			});
			writeIndex(sourceRoot, sourceSsr.markup, sourceSsr.css);
			run("pnpm", ["run", "build"], sourceRoot);
			const sourceCss = generatedCss(sourceRoot) + sourceSsr.css;
			const target = join(targetRoot, `${route.from}-to-${route.to}`);
			mkdirSync(target, { recursive: true });
			symlinkSync(join(sourceRoot, "node_modules"), join(target, "node_modules"), "dir");
			writeFixture({ root: target, source: route.source, from: route.from, to: route.to });
			const migration = await runAdapterMigrationAsync(route.source, {
				from: route.from,
				to: route.to,
				root: target,
				file: "src/App.tsx",
				mode: "safe",
				readFile: (file) => (existsSync(file) ? readFileSync(file, "utf8") : undefined),
				listFiles: () =>
					route.to === CodemodAdapterId.UnoCSS ? [join(target, "uno.config.ts")] : [],
				semantic: { source: { framework: "react" } },
			});
			if (migration.converted === 0 || migration.skipped > 0 || migration.residuals.length > 0)
				throw new Error(`${route.from} -> ${route.to}: ${JSON.stringify(migration.residuals)}`);
			if (
				migration.validations.length === 0 ||
				migration.validations.some((validation) => !validation.valid)
			)
				throw new Error(`${route.from} -> ${route.to}: canonical CSS validation failed`);
			writeFixture({ root: target, source: migration.code, from: route.from, to: route.to });
			for (const artifact of migration.generatedFiles) {
				const path = join(target, artifact.path);
				mkdirSync(resolve(path, ".."), { recursive: true });
				writeFileSync(path, artifact.content);
			}
			run("pnpm", ["run", "typecheck"], target);
			const targetSsr = await renderInstalledServer(target);
			if (route.from === CodemodAdapterId.ChakraUi && /\sflex=/.test(targetSsr.markup))
				throw new Error("Chakra flex leaked into target DOM markup");
			writeIndex(target, targetSsr.markup, targetSsr.css);
			run("pnpm", ["run", "build"], target);
			const browser = await browserProof({
				repositoryRoot,
				sourceRoot,
				targetRoot: target,
				resetStyles:
					"html, body, #root { margin: 0; padding: 0; } [data-proof] { appearance: none; border: 0; box-sizing: border-box; display: block; font: 16px/24px Arial, sans-serif; height: 56px; margin: 0; width: 160px; }",
				collectRuntimeStyleBytes: true,
				computedProperties: [
					"background-color",
					"color",
					"padding-left",
					"border-radius",
					"flex",
					"align-self",
					"order",
				],
			});
			if (!browser.equivalent)
				throw new Error(`${route.from} -> ${route.to}: ${JSON.stringify(browser)}`);
			const targetCss = generatedCss(target) + targetSsr.css;
			reports.push({
				route: { from: route.from, to: route.to },
				versions,
				fixture: {
					sourceHash: digest(route.source),
					outputHash: digest(migration.code),
					artifacts: migration.generatedFiles.map((file) => ({
						path: file.path,
						hash: digest(file.content),
					})),
				},
				migration: {
					converted: migration.converted,
					skipped: migration.skipped,
					residuals: migration.residuals.length,
					canonical: migration.validations.map(({ canonicalSource, canonicalTarget }) => ({
						source: canonicalSource,
						target: canonicalTarget,
					})),
				},
				checks: {
					sourceTypecheck: true,
					targetTypecheck: true,
					sourceBuild: true,
					targetBuild: true,
					sourceSsr: true,
					targetSsr: true,
				},
				browser,
				css: {
					measurement:
						"Emitted asset/collected SSR bytes. Runtime stylesheet bytes are measured separately in browser.runtimeStyleBytes.",
					sourceBytes: Buffer.byteLength(sourceCss),
					targetBytes: Buffer.byteLength(targetCss),
				},
			});
		}
		return reports;
	},
	{ retainOnError: true },
);
writeJson(join(repositoryRoot, "plans/evidence/codemod-installed-targets.json"), {
	schema: "pandwind.codemod-installed-targets/1",
	sourceRevision,
	sourceFingerprint: proofSourceFingerprint(repositoryRoot),
	proofImplementationHash: digest(readFileSync(import.meta.filename, "utf8")),
	scope:
		"Nine exact static React route scenarios; no route maturity promotion or universal framework claim.",
	reports,
});
console.log(JSON.stringify({ passed: reports.length, sourceRevision }));
