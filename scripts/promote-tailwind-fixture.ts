/**
 * Prove a small Tailwind project migration with the real CLI and installed
 * project dependencies. This is intentionally a bounded fixture: it checks
 * the complete project lifecycle without claiming that one button proves the
 * whole Tailwind language.
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
	"@tailwindcss/vite": "4.3.3",
	"@tailwindcss/node": "4.3.3",
	"@types/react": "19.2.18",
	"@types/react-dom": "19.2.7",
	"@types/node": "26.4.1",
	"@vitejs/plugin-react-swc": "4.3.3",
	"oxc-parser": "0.148.0",
	pandwind: `file:${pandwindPackageRoot}`,
	react: "19.2.8",
	"react-dom": "19.2.8",
	tailwindcss: "4.3.3",
	typescript: "7.0.2",
	vite: "8.2.2",
} as const;

const sourceApp = `import "../styles.css";
import { Badge } from "./Badge";

export const App = () => (
	<div data-proof className="bg-brand px-4 py-2 text-white hover:bg-blue-600">
		<Badge />
		Proof
	</div>
);
`;

const sourceBadge = `export const Badge = () => (
	<span data-proof-badge className="ml-2 rounded bg-brand px-2 text-white hover:bg-blue-600">
		Badge
	</span>
);
`;

const sourceViteConfig = `import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [tailwindcss(), react()] });
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

interface TailwindInstalledProof {
	readonly schema: typeof proofSchema;
	readonly route: {
		readonly from: CodemodAdapterId.Tailwind;
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
		readonly customThemeTokenPreserved: boolean;
		readonly sourceStylesheetImportRemoved: boolean;
		readonly generatedVitePresetImportIsExplicit: boolean;
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

function proofIsComplete(report: TailwindInstalledProof): boolean {
	return (
		report.migration.skipped === 0 &&
		report.migration.residuals === 0 &&
		report.migration.canonical.checked &&
		report.migration.canonical.equal &&
		report.migration.targetUsesPandwind &&
		report.migration.customThemeTokenPreserved &&
		report.migration.sourceStylesheetImportRemoved &&
		report.migration.generatedVitePresetImportIsExplicit &&
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
			tailwindcss: versions.tailwindcss,
		},
		devDependencies: {
			"@tailwindcss/node": versions["@tailwindcss/node"],
			"@tailwindcss/vite": versions["@tailwindcss/vite"],
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
	writeFileSync(
		join(root, "styles.css"),
		['@import "tailwindcss";', "", "@theme { --color-brand: #123456; }"].join("\n") + "\n",
	);
	writeFileSync(join(root, "vite.config.ts"), sourceViteConfig);
	writeFileSync(join(root, "src/App.tsx"), sourceApp);
	writeFileSync(join(root, "src/Badge.tsx"), sourceBadge);
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

export async function runTailwindInstalledProof(): Promise<TailwindInstalledProof> {
	run("pnpm", ["--filter", "pandwind", "run", "build"], repositoryRoot);
	return withInstalledProofProject(
		"pandwind-tailwind-installed-proof-",
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
						"tailwindcss",
						"--to",
						"pandwind",
						"--root",
						targetRoot,
						"--no-install",
						"src/**/*.tsx",
						"--report",
						"--report-format=json",
					],
					repositoryRoot,
				),
				"Tailwind",
			);
			const migratedApp = readFileSync(join(targetRoot, "src/App.tsx"), "utf8");
			const generatedSupportFiles = allFiles(join(targetRoot, "pandwind")).map((file) =>
				relative(targetRoot, file).replaceAll("\\", "/"),
			);
			const installedTargetPackage = JSON.parse(
				readFileSync(join(targetRoot, "package.json"), "utf8"),
			) as { dependencies?: Record<string, string> };
			const targetViteConfig = readFileSync(join(targetRoot, "vite.config.ts"), "utf8");
			const sourceMarkup = (await renderInstalledServer(sourceRoot, { renderer: "static" })).markup;
			writeIndex(sourceRoot, sourceMarkup);
			run("pnpm", ["run", "build"], sourceRoot);
			const sourceCss = generatedCss(sourceRoot);
			const targetMarkup = (await renderInstalledServer(targetRoot, { renderer: "static" })).markup;
			writeIndex(targetRoot, targetMarkup);
			run("pnpm", ["run", "typecheck"], targetRoot);
			run("pnpm", ["run", "build"], targetRoot);
			const targetCss = generatedCss(targetRoot);
			const browser = await browserProof({
				repositoryRoot,
				sourceRoot,
				targetRoot,
				resetStyles:
					"html, body, #root { margin: 0; padding: 0; } #root { width: 640px; } [data-proof] { box-sizing: border-box; display: block; font: 16px/24px Arial, sans-serif; height: 56px; margin: 0; width: 160px; }",
				computedProperties: ["background-color", "color", "padding-left", "padding-top"],
			});
			const normalizeMarkup = (markup: string): string =>
				markup.replace(/class="[^"]*"/gu, 'class="CLASS"');
			return {
				schema: proofSchema,
				route: { from: CodemodAdapterId.Tailwind, to: CodemodAdapterId.Pandwind },
				fixture: {
					files: ["src/App.tsx", "src/Badge.tsx", "styles.css", "vite.config.ts"],
					isolated: true,
				},
				dependencies: {
					installed: true,
					targetPackage: installedTargetPackage.dependencies?.pandwind ?? "",
					targetNodeModule: existsSync(join(targetRoot, "node_modules/pandwind/package.json")),
				},
				migration: {
					converted: migration.converted,
					skipped: migration.skipped,
					residuals: migration.residuals,
					canonical: migration.canonical,
					generatedSupportFiles: generatedSupportFiles.length,
					targetUsesPandwind: migratedApp.includes("pandwind"),
					customThemeTokenPreserved:
						migratedApp.includes('backgroundColor: "$brand"') ||
						migratedApp.includes('backgroundColor: "brand"'),
					sourceStylesheetImportRemoved: !migratedApp.includes("../styles.css"),
					generatedVitePresetImportIsExplicit: targetViteConfig.includes("./pandwind/preset.ts"),
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
					markupEquivalent: normalizeMarkup(sourceMarkup) === normalizeMarkup(targetMarkup),
					sourceMarkup,
					targetMarkup,
				},
				browser,
				css: {
					sourceBytes: Buffer.byteLength(sourceCss),
					targetBytes: Buffer.byteLength(targetCss),
					targetNotLarger: Buffer.byteLength(targetCss) <= Buffer.byteLength(sourceCss),
				},
			};
		},
		{ retain: (report) => !proofIsComplete(report), retainOnError: true },
	);
}

if (import.meta.main) {
	const report = await runTailwindInstalledProof();
	const output = join(repositoryRoot, "plans/evidence/tailwind-installed-proof.json");
	mkdirSync(dirname(output), { recursive: true });
	writeJson(output, report);
	console.log(JSON.stringify(report, null, 2));
	console.error(`wrote installed Tailwind proof: ${output}`);
	if (!proofIsComplete(report)) process.exitCode = 1;
}
