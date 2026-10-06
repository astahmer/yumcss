/**
 * Prove a real MUI Box `sx` example through the installed project boundary.
 *
 * The pinned MUI demo uses the same object-system and pseudo-condition that
 * this fixture exercises. The provider is intentionally left out here because
 * provider-owned runtime theme callbacks remain an explicit adapter residual;
 * this proof covers the static Box/sx lane that can be lowered losslessly.
 */
import {
	normalizeInstalledTargetPackage, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { CodemodAdapterId } from "@yumcss/codemod/swap";
import {
	browserProof,
	generatedCss,
	packageInstalled,
	parseInstalledProofMigration,
	renderInstalledServer,
	run,
	runCaptured,
	withInstalledProofProject,
	writeIndex,
	writeJson,
	type InstalledProofBrowserEvidence,
	type InstalledProofCanonicalEvidence,
} from "./installed-proof.ts";
import { createReferenceWorkspace } from "./reference-workspace.ts";

const repositoryRoot = resolve(import.meta.dirname, "..");
const muiReferenceRoot = createReferenceWorkspace().path("mui");
const referenceCommit = "fc3a3a0a8b7c8f20274eca4758ea07a33e25c1b4";
const referencePath = "docs/data/material/components/box/BoxSx.tsx";
const yumcssPackageRoot = join(repositoryRoot, "packages/yumcss");
const proofSchema = "yumcss.installed-project-proof/1" as const;
const versions = {
	"@emotion/cache": "11.14.0",
	"@emotion/react": "11.14.0",
	"@emotion/server": "11.11.0",
	"@emotion/styled": "11.14.0",
	"@mui/material": "9.4.0",
	"@types/node": "26.4.1",
	"@types/react": "19.2.18",
	"@types/react-dom": "19.2.7",
	"@vitejs/plugin-react-swc": "4.3.3",
	"oxc-parser": "0.148.0",
	yumcss: `file:${yumcssPackageRoot}`,
	react: "19.2.8",
	"react-dom": "19.2.8",
	typescript: "7.0.2",
	vite: "8.2.2",
} as const;

const sourceApp = `import Box from "@mui/material/Box";

export const App = () => (
	<Box
		data-proof
		sx={{
			width: 100,
			height: 100,
			borderRadius: 1,
			bgcolor: "#007FFF",
			"&:hover": { bgcolor: "#0066CC" },
		}}
	/>
);
`;

const sourceViteConfig = `import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [react()] });
`;

const tsConfig = {
	compilerOptions: {
		jsx: "react-jsx",
		lib: ["ESNext", "DOM", "DOM.Iterable"],
		module: "ESNext",
		moduleResolution: "Bundler",
		noEmit: true,
		skipLibCheck: true,
		target: "ES2022",
		strict: true,
		types: ["vite/client", "node"],
	},
	include: ["src", "vite.config.ts"],
};

interface MuiInstalledProof {
	readonly schema: typeof proofSchema;
	readonly route: {
		readonly from: CodemodAdapterId.Mui;
		readonly to: CodemodAdapterId.YumCSS;
	};
	readonly referenceCommit: string;
	readonly referencePath: string;
	readonly fixture: { readonly files: readonly string[]; readonly isolated: true };
	readonly dependencies: {
		readonly installed: boolean;
		readonly targetPackage: string;
		readonly targetNodeModule: boolean;
	};
	readonly migration: {
		readonly converted: number;
		readonly skipped: number;
		readonly residuals: number;
		readonly canonical: InstalledProofCanonicalEvidence;
		readonly targetUsesYumCSS: boolean;
		readonly sourceImportRemoved: boolean;
		readonly yumcssClassCarrier: boolean;
	};
	readonly checks: {
		readonly sourceTypecheck: boolean;
		readonly targetTypecheck: boolean;
		readonly sourceBuild: boolean;
		readonly targetBuild: boolean;
		readonly sourceSsr: boolean;
		readonly targetSsr: boolean;
		readonly hydration: boolean;
	};
	readonly ssr: { readonly markupEquivalent: boolean };
	readonly browser: InstalledProofBrowserEvidence;
	readonly css: {
		readonly sourceBytes: number;
		readonly targetBytes: number;
		readonly note: string;
	};
}

const assertPinnedReference = (): void => {
	const actual = runCaptured("git", ["-C", muiReferenceRoot, "rev-parse", "HEAD"], repositoryRoot);
	if (!actual.trim().startsWith(referenceCommit))
		throw new Error(`MUI reference moved: expected ${referenceCommit}, got ${actual.trim()}`);
	const source = runCaptured(
		"git",
		["-C", muiReferenceRoot, "show", `${referenceCommit}:${referencePath}`],
		repositoryRoot,
	);
	if (!source.includes("<Box") || !source.includes("borderRadius"))
		throw new Error(
			`MUI pinned example no longer contains the expected Box sx API: ${referencePath}`,
		);
};

const packageJson = (target: boolean): Record<string, unknown> => ({
	name: target ? "yumcss-mui-target" : "mui-installed-source",
	private: true,
	type: "module",
	scripts: {
		build: "vite build",
		ssr: "vite build --ssr src/entry-server.tsx",
		typecheck: "tsc --noEmit",
	},
	dependencies: target
		? { yumcss: versions.yumcss, react: versions.react, "react-dom": versions["react-dom"] }
		: {
				"@emotion/cache": versions["@emotion/cache"],
				"@emotion/react": versions["@emotion/react"],
				"@emotion/server": versions["@emotion/server"],
				"@emotion/styled": versions["@emotion/styled"],
				"@mui/material": versions["@mui/material"],
				react: versions.react,
				"react-dom": versions["react-dom"],
			},
	devDependencies: {
		"@types/node": versions["@types/node"],
		"@types/react": versions["@types/react"],
		"@types/react-dom": versions["@types/react-dom"],
		"@vitejs/plugin-react-swc": versions["@vitejs/plugin-react-swc"],
		...(target ? { "oxc-parser": versions["oxc-parser"] } : {}),
		typescript: versions.typescript,
		vite: versions.vite,
	},
});

const writeFixture = (root: string, target: boolean): void => {
	mkdirSync(join(root, "src"), { recursive: true });
	writeJson(join(root, "package.json"), packageJson(target));
	writeJson(join(root, "tsconfig.json"), tsConfig);
	writeFileSync(join(root, "vite.config.ts"), sourceViteConfig);
	writeFileSync(join(root, "src/App.tsx"), sourceApp);
	writeFileSync(
		join(root, "src/main.tsx"),
		[
			'import { hydrateRoot } from "react-dom/client";',
			'import { App } from "./App";',
			"",
			'hydrateRoot(document.getElementById("root")!, <App />);',
		].join("\n"),
	);
	writeFileSync(
		join(root, "src/entry-server.tsx"),
		target
			? 'export { App } from "./App";\n'
			: [
					'import { CacheProvider } from "@emotion/react";',
					'import createCache from "@emotion/cache";',
					'import createEmotionServer from "@emotion/server/create-instance";',
					'import { renderToString } from "react-dom/server";',
					'import { App as SourceApp } from "./App";',
					"",
					'const cache = createCache({ key: "proof" });',
					"const emotionServer = createEmotionServer(cache);",
					"export const App = () => <CacheProvider value={cache}><SourceApp /></CacheProvider>;",
					"export const sourceCss = () => {",
					"  const markup = renderToString(<App />);",
					'  return emotionServer.constructStyleTagsFromChunks(emotionServer.extractCriticalToChunks(markup)).replace(/<style[^>]*>|<\\/style>/gu, "");',
					"};",
				].join("\n"),
	);
	writeFileSync(
		join(root, "index.html"),
		'<div id="root"></div><script type="module" src="/src/main.tsx"></script>\n',
	);
};

const proofIsComplete = (report: MuiInstalledProof): boolean =>
	report.migration.converted > 0 &&
	report.migration.skipped === 0 &&
	report.migration.residuals === 0 &&
	report.migration.canonical.checked &&
	report.migration.canonical.equal &&
	report.migration.sourceImportRemoved &&
	report.migration.yumcssClassCarrier &&
	report.dependencies.installed &&
	report.dependencies.targetNodeModule &&
	report.checks.sourceTypecheck &&
	report.checks.targetTypecheck &&
	report.checks.sourceBuild &&
	report.checks.targetBuild &&
	report.checks.sourceSsr &&
	report.checks.targetSsr &&
	report.checks.hydration &&
	report.ssr.markupEquivalent &&
	report.browser.equivalent &&
	report.browser.hydrationErrors.length === 0 &&
	report.css.sourceBytes > 0 &&
	report.css.targetBytes > 0;

export async function runMuiInstalledProof(): Promise<MuiInstalledProof> {
	assertPinnedReference();
	return withInstalledProofProject(
		"yumcss-mui-installed-",
		async ({ sourceRoot, targetRoot }) => {
			writeFixture(sourceRoot, false);
			run("pnpm", ["install", "--ignore-scripts"], sourceRoot);
			run("pnpm", ["run", "typecheck"], sourceRoot);
			run("pnpm", ["run", "build"], sourceRoot);
			const sourceSsr = await renderInstalledServer(sourceRoot);
			writeIndex(sourceRoot, sourceSsr.markup, sourceSsr.css);
			run("pnpm", ["run", "build"], sourceRoot);

			writeFixture(targetRoot, true);
			run("pnpm", ["install", "--ignore-scripts"], targetRoot);
			const migration = parseInstalledProofMigration(
				runCaptured(
					"nub",
					[
						"--conditions",
						"yumcss",
						join(repositoryRoot, "packages/codemod/src/cli.ts"),
						"migrate",
						"--from",
						CodemodAdapterId.Mui,
						"--to",
						CodemodAdapterId.YumCSS,
						"--root",
						targetRoot,
						"--no-install",
						"src/App.tsx",
						"--report",
						"--report-format=json",
					],
					repositoryRoot,
				),
				"MUI",
			);
			const migratedApp = readFileSync(join(targetRoot, "src/App.tsx"), "utf8");
			run("pnpm", ["run", "typecheck"], targetRoot);
			run("pnpm", ["run", "build"], targetRoot);
			const targetSsr = await renderInstalledServer(targetRoot);
			writeIndex(targetRoot, targetSsr.markup);
			run("pnpm", ["run", "build"], targetRoot);
			const browser = await browserProof({
				repositoryRoot,
				sourceRoot,
				targetRoot,
				resetStyles:
					"html, body, #root { margin: 0; padding: 0; } #root { width: 640px; } [data-proof] { appearance: none; border: 0; box-sizing: border-box; display: block; font: 16px/16px Arial, sans-serif; margin: 0; }",
				computedProperties: ["background-color", "width", "height", "border-radius"],
			});
			const normalizeMarkup = (markup: string): string =>
				markup.replace(/\s+(?:class|style)="[^"]*"/gu, "");
			const targetCss = generatedCss(targetRoot);
			const report: MuiInstalledProof = {
				schema: proofSchema,
				route: { from: CodemodAdapterId.Mui, to: CodemodAdapterId.YumCSS },
				referenceCommit,
				referencePath,
				fixture: { files: ["src/App.tsx", "src/entry-server.tsx"], isolated: true },
				dependencies: {
					installed: packageInstalled(sourceRoot, "@mui/material"),
					targetPackage: normalizeInstalledTargetPackage(versions.yumcss, repositoryRoot),
					targetNodeModule: packageInstalled(targetRoot, "yumcss"),
				},
				migration: {
					...migration,
					targetUsesYumCSS: migratedApp.includes("yumcss"),
					sourceImportRemoved: !migratedApp.includes("@mui/material"),
					yumcssClassCarrier: migratedApp.includes("css.class("),
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
				ssr: {
					markupEquivalent: normalizeMarkup(sourceSsr.markup) === normalizeMarkup(targetSsr.markup),
				},
				browser,
				css: {
					sourceBytes: Buffer.byteLength(sourceSsr.css),
					targetBytes: Buffer.byteLength(targetCss),
					note: "MUI source bytes are Emotion SSR stylesheet bytes while the static YumCSS projection uses YumCSS's generated atomic stylesheet. The values are diagnostic output-size measurements, not a like-for-like stylesheet budget.",
				},
			};
			if (!proofIsComplete(report))
				throw new Error(`MUI installed proof is incomplete: ${JSON.stringify(report)}`);
			return report;
		},
		{ retainOnError: true },
	);
}

if (import.meta.main) {
	const report = await runMuiInstalledProof();
	const output = join(repositoryRoot, "plans/evidence/mui-installed-proof.json");
	mkdirSync(join(repositoryRoot, "plans/evidence"), { recursive: true });
	writeJson(output, report);
	console.log(JSON.stringify(report, null, 2));
}
