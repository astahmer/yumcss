/**
 * Prove a bounded Panda -> YumCSS project migration with the real CLI and
 * installed Panda generated-system output. The fixture covers a custom token,
 * a spacing token, a pseudo-condition, generated project support, and the
 * source/target build boundary, SSR, hydration, and browser base/hover
 * behavior.
 */
import {
	normalizeInstalledTargetPackage, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { CodemodAdapterId, runAdapterMigrationAsync } from "@yumcss/codemod/swap";
import { z } from "zod";
import {
	browserProof,
	generatedCss,
	packageInstalled,
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
	"@pandacss/dev": "1.12.1",
	"@types/node": "26.4.1",
	"@types/react": "19.2.18",
	"@types/react-dom": "19.2.7",
	"@vitejs/plugin-react-swc": "4.3.3",
	"oxc-parser": "0.148.0",
	yumcss: `file:${yumcssPackageRoot}`,
	react: "19.2.8",
	"react-dom": "19.2.8",
	// Panda 1.12.1 publishes declarations that predate this repository's
	// experimental TypeScript 7 pin. The isolated consumer uses the compatible
	// stable compiler so this proof tests Panda itself rather than a workspace
	// compiler mismatch.
	typescript: "5.9.3",
	vite: "8.2.2",
} as const;

const pandaConfig = `import { defineConfig } from "@pandacss/dev";

export default defineConfig({
	include: ["./src/**/*.{js,jsx,ts,tsx}"],
	theme: {
		extend: {
			tokens: {
				colors: { brand: { value: "#123456" } },
			},
		},
	},
	outdir: "styled-system",
});
`;

const sourceApp = `import { css } from "../styled-system/css";

export const App = () => (
	<button
		className={css({
			bg: "brand",
			color: "white",
			px: "4",
			borderRadius: "md",
			_hover: { bg: "blue.600" },
		})}
		data-proof
	>
		Proof
	</button>
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
		// @pandacss/types@1.12.1 has duplicate star-export declarations; keep
		// dependency declaration checking at the package boundary while checking
		// the fixture and generated migration source strictly.
		skipLibCheck: true,
		target: "ES2022",
		strict: true,
		types: ["vite/client", "node"],
	},
	include: ["src", "vite.config.ts", "panda.config.ts"],
};

const pandaProjectMigrationSchema = z.object({
	from: z.literal(CodemodAdapterId.Panda),
	to: z.literal(CodemodAdapterId.YumCSS),
	report: z.object({
		filesScanned: z.number().int().nonnegative(),
		filesChanged: z.number().int().nonnegative(),
		cssCallsConverted: z.number().int().nonnegative(),
		cssCallsFlagged: z.number().int().nonnegative(),
		factoryElementsConverted: z.number().int().nonnegative(),
		factoryElementsFlagged: z.number().int().nonnegative(),
		residualsByKind: z.record(z.string(), z.number().int().nonnegative()),
	}),
});

const parsePandaProjectMigration = (output: string) => {
	const { report } = pandaProjectMigrationSchema.parse(JSON.parse(output.trim()));
	return {
		filesScanned: report.filesScanned,
		filesChanged: report.filesChanged,
		converted: report.cssCallsConverted + report.factoryElementsConverted,
		skipped: report.cssCallsFlagged + report.factoryElementsFlagged,
		residuals: Object.values(report.residualsByKind).reduce((total, count) => total + count, 0),
		residualsByKind: report.residualsByKind,
	};
};

interface PandaInstalledProof {
	readonly schema: typeof proofSchema;
	readonly route: {
		readonly from: CodemodAdapterId.Panda;
		readonly to: CodemodAdapterId.YumCSS;
	};
	readonly fixture: { readonly files: readonly string[]; readonly isolated: true };
	readonly dependencies: {
		readonly installed: boolean;
		readonly targetPackage: string;
		readonly targetNodeModule: boolean;
	};
	readonly migration: {
		readonly canonical: InstalledProofCanonicalEvidence;
		readonly filesScanned: number;
		readonly filesChanged: number;
		readonly converted: number;
		readonly skipped: number;
		readonly residuals: number;
		readonly residualsByKind: Readonly<Record<string, number>>;
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

function proofIsComplete(report: PandaInstalledProof): boolean {
	return (
		report.migration.filesScanned > 0 &&
		report.migration.filesChanged > 0 &&
		report.migration.converted > 0 &&
		report.migration.canonical.checked &&
		report.migration.canonical.equal &&
		report.migration.skipped === 0 &&
		report.migration.residuals === 0 &&
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
			"@pandacss/dev": versions["@pandacss/dev"],
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
	writeFileSync(join(root, "panda.config.ts"), pandaConfig);
	writeFileSync(join(root, "vite.config.ts"), sourceViteConfig);
	writeFileSync(join(root, "src/App.tsx"), sourceApp);
	writeFileSync(
		join(root, "src/main.tsx"),
		[
			'import "./global.css";',
			'import { hydrateRoot } from "react-dom/client";',
			'import { App } from "./App";',
			"",
			'hydrateRoot(document.getElementById("root")!, <App />);',
		].join("\n"),
	);
	writeFileSync(join(root, "src/global.css"), '@import "../styled-system/styles.css";\n');
	writeFileSync(join(root, "src/entry-server.tsx"), 'export { App } from "./App";\n');
	writeFileSync(
		join(root, "index.html"),
		'<div id="root"></div><script type="module" src="/src/main.tsx"></script>\n',
	);
}

async function main(): Promise<void> {
	await withInstalledProofProject(
		"yumcss-panda-installed-",
		async ({ sourceRoot, targetRoot }) => {
			createFixture(sourceRoot, false);
			run("pnpm", ["install", "--ignore-scripts"], sourceRoot);
			run("pnpm", ["exec", "panda", "codegen"], sourceRoot);
			run("pnpm", ["exec", "panda", "cssgen", "--silent"], sourceRoot);
			run("pnpm", ["run", "typecheck"], sourceRoot);
			run("pnpm", ["run", "build"], sourceRoot);
			const adapterProof = await runAdapterMigrationAsync(sourceApp, {
				from: CodemodAdapterId.Panda,
				to: CodemodAdapterId.YumCSS,
				root: sourceRoot,
				file: "src/App.tsx",
				mode: "safe",
				readFile: (file) => (existsSync(file) ? readFileSync(file, "utf8") : undefined),
				listFiles: () => [join(sourceRoot, "panda.config.ts"), join(sourceRoot, "src/App.tsx")],
			});
			const canonical: InstalledProofCanonicalEvidence = {
				checked: adapterProof.validations.length > 0,
				equal:
					adapterProof.validations.length > 0 &&
					adapterProof.validations.every((validation) => validation.valid),
				sourceBytes: adapterProof.validations.reduce(
					(total, validation) => total + Buffer.byteLength(validation.canonicalSource),
					0,
				),
				targetBytes: adapterProof.validations.reduce(
					(total, validation) => total + Buffer.byteLength(validation.canonicalTarget),
					0,
				),
				differences: adapterProof.validations.flatMap((validation) => validation.differences),
			};
			createTargetFixture(sourceRoot, targetRoot);
			run("pnpm", ["install", "--ignore-scripts"], targetRoot);
			const migration = parsePandaProjectMigration(
				runCaptured(
					"nub",
					[
						"--conditions",
						"yumcss",
						"packages/codemod/src/cli.ts",
						"migrate",
						"--from",
						CodemodAdapterId.Panda,
						"--to",
						CodemodAdapterId.YumCSS,
						"--root",
						targetRoot,
						"--no-install",
						"src",
						"--report",
						"--report-format=json",
					],
					repositoryRoot,
				),
				"Panda",
			);
			run("pnpm", ["run", "typecheck"], targetRoot);
			const migratedApp = readFileSync(join(targetRoot, "src/App.tsx"), "utf8");
			const targetMain = readFileSync(join(targetRoot, "src/main.tsx"), "utf8");
			const targetGlobalStyles = readFileSync(join(targetRoot, "src/global.css"), "utf8");
			const viteConfig = readFileSync(join(targetRoot, "vite.config.ts"), "utf8");
			const preset = readFileSync(join(targetRoot, "yumcss/preset.ts"), "utf8");
			const sourceSsr = await renderInstalledServer(sourceRoot);
			const sourceCss = readFileSync(join(sourceRoot, "styled-system/styles.css"), "utf8");
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
				markup.replace(/class="[^"]*"/u, 'class="CLASS"');
			const targetCss = generatedCss(targetRoot);
			const report: PandaInstalledProof = {
				schema: proofSchema,
				route: { from: CodemodAdapterId.Panda, to: CodemodAdapterId.YumCSS },
				fixture: {
					files: ["panda.config.ts", "src/App.tsx", "src/global.css", "vite.config.ts"],
					isolated: true,
				},
				dependencies: {
					installed: packageInstalled(sourceRoot, "@pandacss/dev"),
					targetPackage: normalizeInstalledTargetPackage(`file:${yumcssPackageRoot}`, repositoryRoot),
					targetNodeModule: packageInstalled(targetRoot, "yumcss"),
				},
				migration: {
					...migration,
					canonical,
					targetUsesYumCSS: migratedApp.includes("yumcss"),
					customTokenPreserved:
						preset.includes("123456") &&
						(migratedApp.includes('"$brand"') || migratedApp.includes('"brand"')),
					sourceStylesheetImportRemoved:
						!targetGlobalStyles.includes("styled-system/styles.css") &&
						targetMain.includes('import "yumcss:css";'),
					generatedVitePresetImportIsExplicit: viteConfig.includes('./yumcss/preset.ts"'),
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
				console.error("incomplete Panda proof:", JSON.stringify(report, null, 2));
				throw new Error(`Panda migration did not preserve the target contract: ${migratedApp}`);
			}
			writeJson(join(repositoryRoot, "plans/evidence/panda-installed-proof.json"), report);
			console.log(JSON.stringify(report, null, 2));
		},
		{ retainOnError: true },
	);
}

function createTargetFixture(source: string, target: string): void {
	createFixture(target, true);
	for (const file of ["panda.config.ts", "vite.config.ts", "tsconfig.json", "index.html"]) {
		run("cp", [join(source, file), join(target, file)], repositoryRoot);
	}
	run("cp", ["-R", join(source, "src"), target], repositoryRoot);
	run("cp", ["-R", join(source, "styled-system"), target], repositoryRoot);
}

if (import.meta.main) await main();
