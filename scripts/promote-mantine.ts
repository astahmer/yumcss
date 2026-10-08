/**
 * Prove a real Mantine style-prop example through the installed project
 * boundary. Mantine provider/theme APIs remain separate residual territory;
 * this runner covers the static Box style-prop lane.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { CodemodAdapterId } from "@yumcss/codemod/swap";
import {
	normalizeInstalledTargetPackage,
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
const mantineReferenceRoot = createReferenceWorkspace().path("mantine");
const referenceCommit = "8a284e2c2c53a9cb6f39f5dc389bf41b7a2073f8";
const referencePath = "apps/help.mantine.dev/src/components/MdxLayout/MdxLayout.tsx";
const yumcssPackageRoot = join(repositoryRoot, "packages/yumcss");
const proofSchema = "yumcss.installed-project-proof/1" as const;
const versions = {
	"@mantine/core": "9.5.2",
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

const sourceApp = `import { Box } from "@mantine/core";

export const App = () => (
  <Box data-proof c="#123456" bg="#ffffff" p="16px" bdrs="8px" fw={700}>
    Mantine proof
  </Box>
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

interface MantineInstalledProof {
	readonly schema: typeof proofSchema;
	readonly route: {
		readonly from: CodemodAdapterId.Mantine;
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
		readonly sourceImportRemoved: boolean;
		readonly classCarrier: boolean;
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
	const actual = runCaptured(
		"git",
		["-C", mantineReferenceRoot, "rev-parse", "HEAD"],
		repositoryRoot,
	);
	if (actual.trim() !== referenceCommit)
		throw new Error(`Mantine reference moved: expected ${referenceCommit}, got ${actual.trim()}`);
	const source = runCaptured(
		"git",
		["-C", mantineReferenceRoot, "show", `${referenceCommit}:${referencePath}`],
		repositoryRoot,
	);
	if (
		!source.includes("<Container") ||
		!source.includes('fz="sm"') ||
		!source.includes('c="dimmed"')
	)
		throw new Error(
			`Mantine pinned example no longer contains the expected style-prop API: ${referencePath}`,
		);
};

const packageJson = (target: boolean): Record<string, unknown> => ({
	name: target ? "yumcss-mantine-target" : "mantine-installed-source",
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
				"@mantine/core": versions["@mantine/core"],
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
			...(target ? [] : ['import "@mantine/core/styles.css";']),
			...(target ? [] : ['import { MantineProvider } from "@mantine/core";']),
			'import { hydrateRoot } from "react-dom/client";',
			'import { App } from "./App";',
			"",
			...(target
				? ['hydrateRoot(document.getElementById("root")!, <App />);']
				: [
						'hydrateRoot(document.getElementById("root")!, <MantineProvider><App /></MantineProvider>);',
					]),
		].join("\n"),
	);
	writeFileSync(
		join(root, "src/entry-server.tsx"),
		target
			? 'export { App } from "./App";\n'
			: [
					'import { MantineProvider } from "@mantine/core";',
					'import { App as Content } from "./App";',
					"",
					"export const App = () => (",
					"  <MantineProvider><Content /></MantineProvider>",
					");",
					"",
				].join("\n"),
	);
	writeFileSync(
		join(root, "index.html"),
		'<div id="root"></div><script type="module" src="/src/main.tsx"></script>\n',
	);
};

const proofIsComplete = (report: MantineInstalledProof): boolean =>
	report.migration.converted > 0 &&
	report.migration.skipped === 0 &&
	report.migration.residuals === 0 &&
	report.migration.canonical.checked &&
	report.migration.canonical.equal &&
	report.migration.sourceImportRemoved &&
	report.migration.classCarrier &&
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

export async function runMantineInstalledProof(): Promise<MantineInstalledProof> {
	assertPinnedReference();
	return withInstalledProofProject(
		"yumcss-mantine-installed-",
		async ({ sourceRoot, targetRoot }) => {
			writeFixture(sourceRoot, false);
			run("pnpm", ["install", "--ignore-scripts"], sourceRoot);
			run("pnpm", ["run", "typecheck"], sourceRoot);
			run("pnpm", ["run", "build"], sourceRoot);
			const sourceCss = generatedCss(sourceRoot);
			const sourceSsr = await renderInstalledServer(sourceRoot);
			writeIndex(sourceRoot, sourceSsr.markup, sourceCss);
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
						CodemodAdapterId.Mantine,
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
				"Mantine",
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
					"html, body, #root { margin: 0; padding: 0; } #root { width: 640px; } [data-proof] { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; box-sizing: border-box; display: block; font-family: Arial, sans-serif; font-size: 16px; line-height: 24px; margin: 0; width: 220px; }",
				computedProperties: [
					"background-color",
					"color",
					"padding",
					"border-radius",
					"font-weight",
				],
			});
			const normalizeMarkup = (markup: string): string =>
				markup
					.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gu, "")
					.replace(/\s+(?:class|style)="[^"]*"/gu, "");
			const targetCss = generatedCss(targetRoot);
			const report: MantineInstalledProof = {
				schema: proofSchema,
				route: { from: CodemodAdapterId.Mantine, to: CodemodAdapterId.YumCSS },
				referenceCommit,
				referencePath,
				fixture: {
					files: ["src/App.tsx", "src/main.tsx", "src/entry-server.tsx"],
					isolated: true,
				},
				dependencies: {
					installed: packageInstalled(sourceRoot, "@mantine/core"),
					targetPackage: normalizeInstalledTargetPackage(versions.yumcss, repositoryRoot),
					targetNodeModule: packageInstalled(targetRoot, "yumcss"),
				},
				migration: {
					...migration,
					sourceImportRemoved: !migratedApp.includes("@mantine/core"),
					classCarrier: migratedApp.includes("className={css.class("),
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
					note: "Mantine source bytes are its bundled stylesheet while the static YumCSS projection uses atomic class CSS. The values are diagnostic output-size measurements, not a like-for-like stylesheet budget.",
				},
			};
			if (!proofIsComplete(report))
				throw new Error(`Mantine installed proof is incomplete: ${JSON.stringify(report)}`);
			return report;
		},
		{ retainOnError: true },
	);
}

if (import.meta.main) {
	const report = await runMantineInstalledProof();
	const output = join(repositoryRoot, "plans/evidence/mantine-installed-proof.json");
	mkdirSync(join(repositoryRoot, "plans/evidence"), { recursive: true });
	writeJson(output, report);
	console.log(JSON.stringify(report, null, 2));
}
