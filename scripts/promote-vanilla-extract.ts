import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { CodemodAdapterId } from "pandwind-codemod/swap";
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
const pandwindPackageRoot = join(repositoryRoot, "packages/pandwind");
const referenceRoot = createReferenceWorkspace().path("vanilla-extract");
const referenceCommit = "881c256a867f55386f96a7fe95068300bac720e6";
const referenceStylePath = "examples/next/components/HelloWorld.css.ts";
const referenceComponentPath = "examples/next/components/HelloWorld.tsx";
const proofSchema = "pandwind.installed-project-proof/1" as const;

const versions = {
	"@types/node": "26.4.1",
	"@types/react": "19.2.18",
	"@types/react-dom": "19.2.7",
	"@vanilla-extract/css": "1.21.2",
	"@vanilla-extract/vite-plugin": "5.2.6",
	"@vitejs/plugin-react-swc": "4.3.3",
	"oxc-parser": "0.148.0",
	pandwind: `file:${pandwindPackageRoot}`,
	react: "19.2.8",
	"react-dom": "19.2.8",
	typescript: "7.0.2",
	vite: "8.2.2",
} as const;

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

interface VanillaExtractInstalledProof {
	readonly schema: typeof proofSchema;
	readonly route: {
		readonly from: CodemodAdapterId.VanillaExtract;
		readonly to: CodemodAdapterId.Pandwind;
	};
	readonly referenceCommit: string;
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
		readonly targetUsesPandwind: boolean;
		readonly sourceImportRemoved: boolean;
		readonly typedVariableLowered: boolean;
		readonly propertyRegistrationPreserved: boolean;
		readonly keyframesPreserved: boolean;
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
		readonly note: string;
	};
}

const pinnedReferenceFile = (path: string): string => {
	if (!existsSync(join(referenceRoot, ".git")))
		throw new Error("Vanilla Extract reference is missing; run pnpm run references:prepare first");
	const actual = execFileSync("git", ["-C", referenceRoot, "rev-parse", "HEAD"], {
		encoding: "utf8",
	}).trim();
	if (actual !== referenceCommit)
		throw new Error(`Vanilla Extract reference moved: expected ${referenceCommit}, got ${actual}`);
	return execFileSync("git", ["-C", referenceRoot, "show", `${referenceCommit}:${path}`], {
		encoding: "utf8",
	});
};

const packageJson = (target: boolean): Record<string, unknown> => ({
	name: target ? "pandwind-vanilla-extract-target" : "vanilla-extract-installed-source",
	private: true,
	type: "module",
	scripts: {
		build: "vite build",
		ssr: "vite build --ssr src/entry-server.tsx",
		typecheck: "tsc --noEmit",
	},
	dependencies: {
		...(target
			? { pandwind: versions.pandwind }
			: {
					"@vanilla-extract/css": versions["@vanilla-extract/css"],
				}),
		react: versions.react,
		"react-dom": versions["react-dom"],
	},
	devDependencies: {
		"@types/node": versions["@types/node"],
		"@types/react": versions["@types/react"],
		"@types/react-dom": versions["@types/react-dom"],
		"@vitejs/plugin-react-swc": versions["@vitejs/plugin-react-swc"],
		...(target ? { "oxc-parser": versions["oxc-parser"] } : {}),
		...(target
			? {}
			: {
					"@vanilla-extract/vite-plugin": versions["@vanilla-extract/vite-plugin"],
				}),
		typescript: versions.typescript,
		vite: versions.vite,
	},
});

const writeFixture = (root: string, target: boolean): void => {
	const style = pinnedReferenceFile(referenceStylePath);
	const component = pinnedReferenceFile(referenceComponentPath);
	mkdirSync(join(root, "src"), { recursive: true });
	writeJson(join(root, "package.json"), packageJson(target));
	writeJson(join(root, "tsconfig.json"), tsConfig);
	writeFileSync(join(root, "src/HelloWorld.css.ts"), style);
	writeFileSync(
		join(root, "src/HelloWorld.tsx"),
		component.replace("className={styles.root}", "className={styles.root} data-proof"),
	);
	writeFileSync(
		join(root, "src/App.tsx"),
		'import { HelloWorld } from "./HelloWorld";\n\nexport const App = () => <HelloWorld />;\n',
	);
	writeFileSync(
		join(root, "src/entry-server.tsx"),
		target
			? 'import { runtimeCss } from "../pandwind/runtime";\nexport { App } from "./App";\nexport const pandwindCss = () => runtimeCss.sheet.css();\n'
			: 'export { App } from "./App";\n',
	);
	writeFileSync(
		join(root, "src/main.tsx"),
		[
			...(target ? ['import "pandwind:css";'] : []),
			'import { hydrateRoot } from "react-dom/client";',
			'import { App } from "./App";',
			"",
			'hydrateRoot(document.getElementById("root")!, <App />);',
		].join("\n"),
	);
	writeFileSync(
		join(root, "src/vite-env.d.ts"),
		'/// <reference types="vite/client" />\ndeclare module "pandwind:css";\n',
	);
	writeFileSync(
		join(root, "index.html"),
		'<div id="root"></div><script type="module" src="/src/main.tsx"></script>\n',
	);
	writeFileSync(
		join(root, "vite.config.ts"),
		target
			? [
					'import react from "@vitejs/plugin-react-swc";',
					'import { pandwindCssVite } from "pandwind/vite";',
					'import { defaultPreset } from "pandwind/preset/default";',
					'import { defineConfig } from "vite";',
					"",
					"export default defineConfig({ plugins: [pandwindCssVite(defaultPreset), react()] });",
				].join("\n")
			: [
					'import react from "@vitejs/plugin-react-swc";',
					'import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";',
					'import { defineConfig } from "vite";',
					"",
					"export default defineConfig({ plugins: [...vanillaExtractPlugin(), react()] });",
				].join("\n"),
	);
};

const proofIsComplete = (report: VanillaExtractInstalledProof): boolean =>
	report.migration.converted > 0 &&
	report.migration.skipped === 0 &&
	report.migration.residuals === 0 &&
	report.migration.canonical.checked &&
	report.migration.canonical.equal &&
	report.migration.targetUsesPandwind &&
	report.migration.sourceImportRemoved &&
	report.migration.typedVariableLowered &&
	report.migration.propertyRegistrationPreserved &&
	report.migration.keyframesPreserved &&
	report.migration.generatedVitePresetImportIsExplicit &&
	report.migration.generatedVitePluginPresent &&
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

export async function runVanillaExtractInstalledProof(): Promise<VanillaExtractInstalledProof> {
	return withInstalledProofProject(
		"pandwind-vanilla-extract-installed-",
		async ({ sourceRoot, targetRoot }) => {
			writeFixture(sourceRoot, false);
			run("pnpm", ["install", "--ignore-scripts"], sourceRoot);
			run("pnpm", ["run", "typecheck"], sourceRoot);
			run("pnpm", ["run", "build"], sourceRoot);
			const sourceCss = generatedCss(sourceRoot);
			cpSync(sourceRoot, targetRoot, { recursive: true });
			rmSync(join(targetRoot, "node_modules"), { recursive: true, force: true });
			rmSync(join(targetRoot, "dist"), { recursive: true, force: true });
			writeFixture(targetRoot, true);
			run("pnpm", ["install", "--ignore-scripts"], targetRoot);
			const migration = parseInstalledProofMigration(
				runCaptured(
					"nub",
					[
						"--conditions",
						"pandwind",
						"packages/codemod/src/cli.ts",
						"migrate",
						"--from",
						CodemodAdapterId.VanillaExtract,
						"--to",
						CodemodAdapterId.Pandwind,
						"--root",
						targetRoot,
						"--no-install",
						"src/HelloWorld.css.ts",
						"--report",
						"--report-format=json",
					],
					repositoryRoot,
				),
				"Vanilla Extract",
			);
			const migratedStyle = readFileSync(join(targetRoot, "src/HelloWorld.css.ts"), "utf8");
			const targetViteConfig = readFileSync(join(targetRoot, "vite.config.ts"), "utf8");
			run("pnpm", ["run", "typecheck"], targetRoot);
			run("pnpm", ["run", "build"], targetRoot);
			const sourceSsr = await renderInstalledServer(sourceRoot);
			writeIndex(sourceRoot, sourceSsr.markup, sourceCss);
			run("pnpm", ["run", "build"], sourceRoot);
			const targetSsr = await renderInstalledServer(targetRoot);
			const targetCss = targetSsr.css;
			writeIndex(targetRoot, targetSsr.markup, targetCss);
			run("pnpm", ["run", "build"], targetRoot);
			const browser = await browserProof({
				repositoryRoot,
				sourceRoot,
				targetRoot,
				resetStyles:
					"html, body, #root { margin: 0; padding: 0; } #root { width: 640px; } [data-proof] { box-sizing: border-box; display: block; font: 16px/24px Arial, sans-serif; margin: 0; width: 320px; } *, *::before, *::after { animation: none !important; transition: none !important; }",
				computedProperties: ["background-color", "color", "padding", "opacity"],
			});
			const report: VanillaExtractInstalledProof = {
				schema: proofSchema,
				route: { from: CodemodAdapterId.VanillaExtract, to: CodemodAdapterId.Pandwind },
				referenceCommit,
				fixture: {
					files: ["src/HelloWorld.css.ts", "src/HelloWorld.tsx", "src/App.tsx"],
					isolated: true,
				},
				dependencies: {
					installed: packageInstalled(sourceRoot, "@vanilla-extract/css"),
					targetPackage: "pandwind",
					targetNodeModule: packageInstalled(targetRoot, "pandwind"),
				},
				migration: {
					...migration,
					targetUsesPandwind: migratedStyle.includes("pandwind/"),
					sourceImportRemoved: !migratedStyle.includes("@vanilla-extract"),
					typedVariableLowered:
						migratedStyle.includes('const color = "--pw-color";') &&
						migratedStyle.includes('const angle = "--pw-angle";') &&
						!migratedStyle.includes("createVar("),
					propertyRegistrationPreserved:
						migratedStyle.includes('kind: "property"') &&
						migratedStyle.includes('name: "--pw-angle"'),
					keyframesPreserved:
						migratedStyle.includes('kind: "keyframes"') && migratedStyle.includes("angleKeyframes"),
					generatedVitePresetImportIsExplicit: targetViteConfig.includes("pandwindCssVite"),
					generatedVitePluginPresent: targetViteConfig.includes("pandwind/vite"),
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
					markupEquivalent:
						sourceSsr.markup.replace(/class="[^"]*"/u, 'class="CLASS"') ===
						targetSsr.markup.replace(/class="[^"]*"/u, 'class="CLASS"'),
				},
				browser,
				css: {
					sourceBytes: Buffer.byteLength(sourceCss),
					targetBytes: Buffer.byteLength(targetCss),
					note: "The tiny fixture compares fused Vanilla Extract CSS with Pandwind's atomic runtime CSS. Browser and canonical CSS parity are required, but this representation difference is not a meaningful non-growth budget.",
				},
			};
			if (!proofIsComplete(report))
				throw new Error(`Vanilla Extract installed proof is incomplete: ${JSON.stringify(report)}`);
			return report;
		},
		{ retainOnError: true },
	);
}

if (import.meta.main) {
	const report = await runVanillaExtractInstalledProof();
	const output = resolve(repositoryRoot, "plans/evidence/vanilla-extract-installed-proof.json");
	writeJson(output, report);
	console.log(JSON.stringify(report, null, 2));
}
