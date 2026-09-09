/**
 * Prove a bounded styled-components -> Pandwind project migration with the
 * real CLI and installed project dependencies. The fixture covers a styled
 * object, a pseudo-condition, the generated Pandwind Vite integration, SSR,
 * hydration, and browser base/hover behavior.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { CodemodAdapterId } from "pandwind-codemod/swap";
import {
	allFiles,
	browserProof,
	generatedCss,
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
const pandwindPackageRoot = join(repositoryRoot, "packages/pandwind");
const proofSchema = "pandwind.installed-project-proof/1" as const;
const versions = {
	"@types/node": "26.4.1",
	"@types/react": "19.2.18",
	"@types/react-dom": "19.2.7",
	"@vitejs/plugin-react-swc": "4.3.3",
	"oxc-parser": "0.148.0",
	pandwind: `file:${pandwindPackageRoot}`,
	react: "19.2.8",
	"react-dom": "19.2.8",
	"styled-components": "6.1.19",
	typescript: "7.0.2",
	vite: "8.2.2",
} as const;

const sourceApp = `import { styled } from "styled-components";

export const Card = styled.button({
\tbackground: "#123456",
\tcolor: "white",
\tpadding: "16px",
\tborderRadius: "8px",
\t"&:hover": { background: "#234567" },
});

export const App = () => <Card data-proof>Proof</Card>;
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
		target: "ES2022",
		strict: true,
		types: ["vite/client", "node"],
	},
	include: ["src", "vite.config.ts"],
};

interface StyledComponentsInstalledProof {
	readonly schema: typeof proofSchema;
	readonly route: {
		readonly from: CodemodAdapterId.StyledComponents;
		readonly to: CodemodAdapterId.Pandwind;
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
		readonly generatedSupportFiles: number;
		readonly targetUsesPandwind: boolean;
		readonly sourceImportRemoved: boolean;
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
	readonly ssr: {
		readonly markupEquivalent: boolean;
		readonly sourceMarkup: string;
		readonly targetMarkup: string;
	};
	readonly browser: InstalledProofBrowserEvidence;
	readonly css: {
		readonly sourceBytes: number;
		readonly targetBytes: number;
		readonly targetNotLarger: boolean;
	};
}

function proofIsComplete(report: StyledComponentsInstalledProof): boolean {
	return (
		report.migration.converted > 0 &&
		report.migration.skipped === 0 &&
		report.migration.residuals === 0 &&
		report.migration.canonical.checked &&
		report.migration.canonical.equal &&
		report.migration.targetUsesPandwind &&
		report.migration.sourceImportRemoved &&
		report.migration.generatedVitePresetImportIsExplicit &&
		report.migration.generatedVitePluginPresent &&
		report.dependencies.targetNodeModule &&
		report.ssr.markupEquivalent &&
		report.browser.equivalent &&
		report.css.sourceBytes > 0 &&
		report.css.targetBytes > 0
	);
}

function packageJson(includePandwind: boolean): Record<string, unknown> {
	return {
		private: true,
		type: "module",
		scripts: {
			build: "vite build",
			ssr: "vite build --ssr src/entry-server.tsx",
			typecheck: "tsc --noEmit",
		},
		dependencies: {
			...(includePandwind ? { pandwind: versions.pandwind } : {}),
			react: versions.react,
			"react-dom": versions["react-dom"],
			...(includePandwind ? {} : { "styled-components": versions["styled-components"] }),
		},
		devDependencies: {
			"@types/node": versions["@types/node"],
			"@types/react": versions["@types/react"],
			"@types/react-dom": versions["@types/react-dom"],
			"@vitejs/plugin-react-swc": versions["@vitejs/plugin-react-swc"],
			...(includePandwind ? { "oxc-parser": versions["oxc-parser"] } : {}),
			typescript: versions.typescript,
			vite: versions.vite,
		},
	};
}

function createFixture(root: string, includePandwind: boolean): void {
	mkdirSync(join(root, "src"), { recursive: true });
	writeJson(join(root, "package.json"), packageJson(includePandwind));
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
	writeFileSync(join(root, "src/entry-server.tsx"), 'export { App } from "./App";\n');
	writeFileSync(
		join(root, "index.html"),
		'<div id="root"></div><script type="module" src="/src/main.tsx"></script>\n',
	);
}

export async function runStyledComponentsInstalledProof(): Promise<StyledComponentsInstalledProof> {
	run("pnpm", ["--filter", "pandwind", "run", "build"], repositoryRoot);
	return withInstalledProofProject(
		"pandwind-styled-components-installed-proof-",
		async ({ sourceRoot, targetRoot }) => {
			createFixture(sourceRoot, false);
			createFixture(targetRoot, true);
			run("pnpm", ["install", "--ignore-scripts", "--no-frozen-lockfile"], sourceRoot);
			run("pnpm", ["install", "--ignore-scripts", "--no-frozen-lockfile"], targetRoot);
			run("pnpm", ["run", "typecheck"], sourceRoot);
			const migration = parseInstalledProofMigration(
				runCaptured(
					"nub",
					[
						"--conditions",
						"pandwind",
						join(repositoryRoot, "packages/codemod/src/cli.ts"),
						"migrate",
						"--from",
						"styled-components",
						"--to",
						"pandwind",
						"--root",
						targetRoot,
						"--no-install",
						"src/App.tsx",
						"--report",
						"--report-format=json",
					],
					repositoryRoot,
				),
				"styled-components",
			);
			const migratedApp = readFileSync(join(targetRoot, "src/App.tsx"), "utf8");
			const generatedSupportFiles = allFiles(join(targetRoot, "pandwind")).map((file) =>
				relative(targetRoot, file).replaceAll("\\", "/"),
			);
			const installedTargetPackage = JSON.parse(
				readFileSync(join(targetRoot, "package.json"), "utf8"),
			) as { dependencies?: Record<string, string> };
			const targetViteConfig = readFileSync(join(targetRoot, "vite.config.ts"), "utf8");
			const sourceSsr = await renderInstalledServer(sourceRoot, {
				collectStyledComponents: true,
			});
			writeIndex(sourceRoot, sourceSsr.markup, sourceSsr.css);
			run("pnpm", ["run", "build"], sourceRoot);
			const targetSsr = await renderInstalledServer(targetRoot);
			writeIndex(targetRoot, targetSsr.markup);
			run("pnpm", ["run", "typecheck"], targetRoot);
			run("pnpm", ["run", "build"], targetRoot);
			const targetCss = generatedCss(targetRoot);
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
			const result: StyledComponentsInstalledProof = {
				schema: proofSchema,
				route: { from: CodemodAdapterId.StyledComponents, to: CodemodAdapterId.Pandwind },
				fixture: { files: ["src/App.tsx", "vite.config.ts"], isolated: true },
				dependencies: {
					installed: true,
					targetPackage: installedTargetPackage.dependencies?.pandwind ?? "",
					targetNodeModule: existsSync(join(targetRoot, "node_modules/pandwind/package.json")),
				},
				migration: {
					...migration,
					generatedSupportFiles: generatedSupportFiles.length,
					targetUsesPandwind: migratedApp.includes("pandwind"),
					sourceImportRemoved: !migratedApp.includes("styled-components"),
					generatedVitePresetImportIsExplicit: targetViteConfig.includes(
						'import { pandwindPreset } from "./pandwind/preset.ts";',
					),
					generatedVitePluginPresent: targetViteConfig.includes(
						'pandwindCssVite(pandwindPreset, { root: "." })',
					),
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
					sourceMarkup: sourceSsr.markup,
					targetMarkup: targetSsr.markup,
				},
				browser,
				css: {
					sourceBytes: Buffer.byteLength(sourceSsr.css),
					targetBytes: Buffer.byteLength(targetCss),
					targetNotLarger: Buffer.byteLength(targetCss) <= Buffer.byteLength(sourceSsr.css),
				},
			};
			return result;
		},
		{ retain: (report) => !proofIsComplete(report), retainOnError: true },
	);
}

if (import.meta.main) {
	const report = await runStyledComponentsInstalledProof();
	const output = join(repositoryRoot, "plans/evidence/styled-components-installed-proof.json");
	mkdirSync(dirname(output), { recursive: true });
	writeJson(output, report);
	console.log(JSON.stringify(report, null, 2));
	console.error(`wrote installed styled-components proof: ${output}`);
	if (!proofIsComplete(report)) process.exitCode = 1;
}
