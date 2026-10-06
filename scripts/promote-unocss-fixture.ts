/**
 * Prove a bounded UnoCSS -> YumCSS project migration with the real CLI and
 * installed UnoCSS generator output. The fixture covers a custom color token,
 * spacing utilities, a pseudo-condition, generated project support, and the
 * source/target build boundary.
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

const repositoryRoot = resolve(import.meta.dirname, "..");
const yumcssPackageRoot = join(repositoryRoot, "packages/yumcss");
const proofSchema = "yumcss.installed-project-proof/1" as const;
const versions = {
	"@types/node": "26.4.1",
	"@types/react": "19.2.18",
	"@types/react-dom": "19.2.7",
	"@vitejs/plugin-react-swc": "4.3.3",
	"oxc-parser": "0.148.0",
	yumcss: `file:${yumcssPackageRoot}`,
	react: "19.2.8",
	"react-dom": "19.2.8",
	typescript: "7.0.2",
	unocss: "66.10.0",
	vite: "8.2.2",
} as const;

const unoConfig = `import { defineConfig } from "unocss";
import { presetWind3 } from "unocss/preset-wind3";

export default defineConfig({
	presets: [presetWind3()],
	theme: {
		colors: { brand: "#123456" },
	},
});
`;

const sourceApp = `export const App = () => (
	<button
		className="bg-brand px-4 py-2 text-white hover:bg-blue-600 rounded-md"
		data-proof
	>
		Proof
	</button>
);
`;

const sourceViteConfig = `import react from "@vitejs/plugin-react-swc";
import UnoCSS from "unocss/vite";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [UnoCSS(), react()] });
`;

const tsConfig = {
	compilerOptions: {
		jsx: "react-jsx",
		lib: ["ESNext", "DOM", "DOM.Iterable"],
		module: "ESNext",
		moduleResolution: "Bundler",
		noEmit: true,
		// UnoCSS 66 publishes a transitive unconfig declaration that references
		// an internal helper type; keep dependency checking at the package
		// boundary while checking the fixture and migrated source strictly.
		skipLibCheck: true,
		target: "ES2022",
		strict: true,
		types: ["vite/client", "node"],
	},
	include: ["src", "vite.config.ts", "uno.config.ts"],
};

interface UnoCssInstalledProof {
	readonly schema: typeof proofSchema;
	readonly route: {
		readonly from: CodemodAdapterId.UnoCSS;
		readonly to: CodemodAdapterId.YumCSS;
	};
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
		readonly customTokenPreserved: boolean;
		readonly sourceStylesheetImportRemoved: boolean;
		readonly generatedVitePresetImportIsExplicit: boolean;
		readonly generatedVitePluginPresent: boolean;
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
		readonly targetNotLarger: boolean;
	};
}

function proofIsComplete(report: UnoCssInstalledProof): boolean {
	return (
		report.migration.converted > 0 &&
		report.migration.skipped === 0 &&
		report.migration.residuals === 0 &&
		report.migration.canonical.checked &&
		report.migration.canonical.equal &&
		report.migration.targetUsesYumCSS &&
		report.migration.customTokenPreserved &&
		report.migration.sourceStylesheetImportRemoved &&
		report.migration.generatedVitePresetImportIsExplicit &&
		report.migration.generatedVitePluginPresent &&
		report.dependencies.targetNodeModule &&
		report.ssr.markupEquivalent &&
		report.browser.equivalent &&
		report.css.sourceBytes > 0 &&
		report.css.targetBytes > 0
	);
}

function packageJson(includeYumCSS: boolean): Record<string, unknown> {
	return {
		private: true,
		type: "module",
		scripts: {
			build: "vite build",
			ssr: "vite build --ssr src/entry-server.tsx",
			typecheck: "tsc --noEmit",
		},
		dependencies: {
			unocss: versions.unocss,
			...(includeYumCSS ? { yumcss: versions.yumcss } : {}),
			react: versions.react,
			"react-dom": versions["react-dom"],
		},
		devDependencies: {
			"@types/node": versions["@types/node"],
			"@types/react": versions["@types/react"],
			"@types/react-dom": versions["@types/react-dom"],
			"@vitejs/plugin-react-swc": versions["@vitejs/plugin-react-swc"],
			...(includeYumCSS ? { "oxc-parser": versions["oxc-parser"] } : {}),
			typescript: versions.typescript,
			vite: versions.vite,
		},
	};
}

function createFixture(root: string, includeYumCSS: boolean): void {
	mkdirSync(join(root, "src"), { recursive: true });
	writeJson(join(root, "package.json"), packageJson(includeYumCSS));
	writeJson(join(root, "tsconfig.json"), tsConfig);
	writeFileSync(join(root, "uno.config.ts"), unoConfig);
	writeFileSync(join(root, "vite.config.ts"), sourceViteConfig);
	writeFileSync(join(root, "src/App.tsx"), sourceApp);
	writeFileSync(
		join(root, "src/main.tsx"),
		[
			'import "virtual:uno.css";',
			'import { hydrateRoot } from "react-dom/client";',
			'import { App } from "./App";',
			"",
			'hydrateRoot(document.getElementById("root")!, <App />);',
		].join("\n"),
	);
	writeFileSync(join(root, "src/entry-server.tsx"), 'export { App } from "./App";\n');
	writeFileSync(
		join(root, "index.html"),
		'<div id="root"></div><script type="module" src="/src/main.tsx"></script>\n',
	);
}

async function main(): Promise<void> {
	await withInstalledProofProject(
		"yumcss-unocss-installed-",
		async ({ sourceRoot, targetRoot }) => {
			createFixture(sourceRoot, false);
			run("pnpm", ["install", "--ignore-scripts"], sourceRoot);
			run("pnpm", ["run", "typecheck"], sourceRoot);
			run("pnpm", ["run", "build"], sourceRoot);
			createTargetFixture(sourceRoot, targetRoot);
			run("pnpm", ["install", "--ignore-scripts"], targetRoot);
			const migration = parseInstalledProofMigration(
				runCaptured(
					"nub",
					[
						"--conditions",
						"yumcss",
						"packages/codemod/src/cli.ts",
						"migrate",
						"--from",
						CodemodAdapterId.UnoCSS,
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
				"UnoCSS",
			);
			run("pnpm", ["run", "typecheck"], targetRoot);
			const migratedApp = readFileSync(join(targetRoot, "src/App.tsx"), "utf8");
			const targetMain = readFileSync(join(targetRoot, "src/main.tsx"), "utf8");
			const viteConfig = readFileSync(join(targetRoot, "vite.config.ts"), "utf8");
			const preset = readFileSync(join(targetRoot, "yumcss/preset.ts"), "utf8");
			const sourceCss = generatedCss(sourceRoot);
			const sourceSsr = await renderInstalledServer(sourceRoot);
			writeIndex(sourceRoot, sourceSsr.markup, sourceCss);
			run("pnpm", ["run", "build"], sourceRoot);
			const targetSsr = await renderInstalledServer(targetRoot);
			writeIndex(targetRoot, targetSsr.markup);
			run("pnpm", ["run", "build"], targetRoot);
			const browser = await browserProof({
				repositoryRoot,
				sourceRoot,
				targetRoot,
				resetStyles:
					"html, body, #root { margin: 0; padding: 0; } #root { width: 640px; } [data-proof] { appearance: none; border: 0; box-sizing: border-box; display: block; font: 16px/24px Arial, sans-serif; height: 56px; margin: 0; width: 160px; }",
				computedProperties: ["background-color", "color", "padding-left", "border-radius"],
			});
			const normalizeMarkup = (markup: string): string =>
				markup.replace(/\s+(?:class|data-proof)="[^"]*"/gu, "");
			const targetCss = generatedCss(targetRoot);
			const report: UnoCssInstalledProof = {
				schema: proofSchema,
				route: { from: CodemodAdapterId.UnoCSS, to: CodemodAdapterId.YumCSS },
				fixture: { files: ["uno.config.ts", "src/App.tsx", "vite.config.ts"], isolated: true },
				dependencies: {
					installed: packageInstalled(sourceRoot, "unocss"),
					targetPackage: normalizeInstalledTargetPackage(`file:${yumcssPackageRoot}`, repositoryRoot),
					targetNodeModule: packageInstalled(targetRoot, "yumcss"),
				},
				migration: {
					...migration,
					targetUsesYumCSS: migratedApp.includes("yumcss"),
					customTokenPreserved:
						preset.includes("123456") &&
						(migratedApp.includes('"$brand"') || migratedApp.includes('"brand"')),
					sourceStylesheetImportRemoved: !targetMain.includes("virtual:uno.css"),
					generatedVitePresetImportIsExplicit: viteConfig.includes("./yumcss/preset.ts"),
					generatedVitePluginPresent: viteConfig.includes("yumcssExtractVite"),
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
					sourceBytes: Buffer.byteLength(sourceCss),
					targetBytes: Buffer.byteLength(targetCss),
					targetNotLarger: Buffer.byteLength(targetCss) <= Buffer.byteLength(sourceCss),
				},
			};
			if (!proofIsComplete(report)) {
				console.error("incomplete UnoCSS proof:", JSON.stringify(report, null, 2));
				throw new Error(`UnoCSS migration did not preserve the target contract: ${migratedApp}`);
			}
			writeJson(join(repositoryRoot, "plans/evidence/unocss-installed-proof.json"), report);
			console.log(JSON.stringify(report, null, 2));
		},
	);
}

function createTargetFixture(source: string, target: string): void {
	createFixture(target, true);
	for (const file of ["uno.config.ts", "vite.config.ts", "tsconfig.json", "index.html"]) {
		run("cp", [join(source, file), join(target, file)], repositoryRoot);
	}
	run("cp", ["-R", join(source, "src"), target], repositoryRoot);
}

if (import.meta.main) await main();
