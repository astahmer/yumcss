/**
 * Prove the pinned Tokenami button API through an installed project boundary.
 * The source uses Tokenami's published css.compose runtime and generated sheet;
 * the target is the normal YumCSS atomic carrier.
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
const tokenamiReferenceRoot = createReferenceWorkspace().path("tokenami");
const referenceCommit = "29cf3b97ef14b22421734113f37b7b29e73f35e0";
const referencePath = "examples/nextjs/src/components/button.tsx";
const yumcssPackageRoot = join(repositoryRoot, "packages/yumcss");
const proofSchema = "yumcss.installed-project-proof/1" as const;
const versions = {
	"@radix-ui/colors": "3.0.0",
	"@tokenami/config": "0.0.101",
	"@tokenami/css": "0.0.101",
	"@tokenami/ds": "0.0.101",
	"@types/node": "26.4.1",
	"@types/react": "19.2.18",
	"@types/react-dom": "19.2.7",
	"@vitejs/plugin-react-swc": "4.3.3",
	"oxc-parser": "0.148.0",
	yumcss: `file:${yumcssPackageRoot}`,
	react: "19.2.8",
	"react-dom": "19.2.8",
	tokenami: "0.0.101",
	typescript: "7.0.2",
	vite: "8.2.2",
} as const;

const sourceApp = `import { css } from "@tokenami/css";

const button = css.compose({
  '--white-space': 'nowrap',
  '--display': 'flex',
  '--align-items': 'center',
  '--justify-content': 'center',
  '--gap': 0.5,
  '--py': 1,
  '--px': 3,
  '--border-radius': 'var(--radii_full)',
	'--background-color': 'var(--color_white)',
	'--color': 'var(--color_black)',
  '--transition': 'var(--morph_colors)',
	'--hover_background-color': 'var(--color_black)',
	'--hover_color': 'var(--color_white)',
  '--font': 'var(--text_sm)',
});

export const App = () => {
  const [className, style] = button();
  return (
    <button data-proof type="button" className={className()} style={style()}>
      Tokenami proof
    </button>
  );
};
`;

const sourceViteConfig = `import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [react()] });
`;

const targetViteConfig = `import react from "@vitejs/plugin-react-swc";
import { yumcssExtractVite } from "yumcss/vite";
import { defaultPreset } from "yumcss/preset/default";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [yumcssExtractVite(defaultPreset, { root: "." }), react()] });
`;

const tokenamiConfig = `import designSystemConfig from "@tokenami/ds";
import { createConfig } from "@tokenami/css";

export default createConfig({
  ...designSystemConfig,
  include: ["./src/**/*.{ts,tsx}"],
});
`;

const tokenamiEnv = `import config from "./tokenami.config";

export type Config = typeof config;

declare module "tokenami" {
  interface TokenamiConfig extends Config {}
}
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
	include: ["src", "vite.config.ts", ".tokenami/tokenami.config.ts", ".tokenami/tokenami.env.d.ts"],
};

interface TokenamiInstalledProof {
	readonly schema: typeof proofSchema;
	readonly route: {
		readonly from: CodemodAdapterId.Tokenami;
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
		["-C", tokenamiReferenceRoot, "rev-parse", "HEAD"],
		repositoryRoot,
	);
	if (actual.trim() !== referenceCommit)
		throw new Error(`Tokenami reference moved: expected ${referenceCommit}, got ${actual.trim()}`);
	const source = runCaptured(
		"git",
		["-C", tokenamiReferenceRoot, "show", `${referenceCommit}:${referencePath}`],
		repositoryRoot,
	);
	if (
		!source.includes("css.compose({") ||
		!source.includes("--hover_background-color") ||
		!source.includes("className={cn(props.className)}")
	)
		throw new Error(
			`Tokenami pinned example no longer contains the expected API: ${referencePath}`,
		);
};

const packageJson = (target: boolean): Record<string, unknown> => ({
	name: target ? "yumcss-tokenami-target" : "tokenami-installed-source",
	private: true,
	type: "module",
	scripts: {
		build: "vite build",
		buildCss: "tokenami --config .tokenami/tokenami.config.ts --output ./src/tokenami.css",
		ssr: "vite build --ssr src/entry-server.tsx",
		typecheck: target
			? "tsc --noEmit"
			: "tokenami check --config .tokenami/tokenami.config.ts; tsc --noEmit",
	},
	dependencies: target
		? {
				"@radix-ui/colors": versions["@radix-ui/colors"],
				"@tokenami/config": versions["@tokenami/config"],
				"@tokenami/css": versions["@tokenami/css"],
				"@tokenami/ds": versions["@tokenami/ds"],
				yumcss: versions.yumcss,
				react: versions.react,
				"react-dom": versions["react-dom"],
			}
		: {
				"@radix-ui/colors": versions["@radix-ui/colors"],
				"@tokenami/config": versions["@tokenami/config"],
				"@tokenami/css": versions["@tokenami/css"],
				"@tokenami/ds": versions["@tokenami/ds"],
				react: versions.react,
				"react-dom": versions["react-dom"],
			},
	devDependencies: {
		"@types/node": versions["@types/node"],
		"@types/react": versions["@types/react"],
		"@types/react-dom": versions["@types/react-dom"],
		"@vitejs/plugin-react-swc": versions["@vitejs/plugin-react-swc"],
		...(target ? { "oxc-parser": versions["oxc-parser"] } : {}),
		...(target ? {} : { tokenami: versions.tokenami }),
		typescript: versions.typescript,
		vite: versions.vite,
	},
});

const writeFixture = (root: string, target: boolean): void => {
	mkdirSync(join(root, "src"), { recursive: true });
	mkdirSync(join(root, ".tokenami"), { recursive: true });
	writeJson(join(root, "package.json"), packageJson(target));
	writeJson(join(root, "tsconfig.json"), tsConfig);
	writeFileSync(join(root, "vite.config.ts"), target ? targetViteConfig : sourceViteConfig);
	writeFileSync(join(root, ".tokenami/tokenami.config.ts"), tokenamiConfig);
	writeFileSync(join(root, ".tokenami/tokenami.env.d.ts"), tokenamiEnv);
	writeFileSync(join(root, "src/App.tsx"), sourceApp);
	writeFileSync(
		join(root, "src/main.tsx"),
		[
			...(target ? [] : ['import "./tokenami.css";']),
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
};

const proofIsComplete = (report: TokenamiInstalledProof): boolean =>
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

export async function runTokenamiInstalledProof(): Promise<TokenamiInstalledProof> {
	assertPinnedReference();
	return withInstalledProofProject(
		"yumcss-tokenami-installed-",
		async ({ sourceRoot, targetRoot }) => {
			writeFixture(sourceRoot, false);
			run("pnpm", ["install", "--ignore-scripts"], sourceRoot);
			run("pnpm", ["run", "buildCss"], sourceRoot);
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
						CodemodAdapterId.Tokenami,
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
				"Tokenami",
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
					"html, body, #root { margin: 0; padding: 0; } #root { width: 640px; } [data-proof] { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; appearance: none; border: 0; box-sizing: border-box; display: flex; font-family: Arial, sans-serif; font-size: 16px; line-height: 24px; margin: 0; width: 220px; }",
				computedProperties: [
					"background-color",
					"color",
					"padding-top",
					"padding-right",
					"padding-bottom",
					"padding-left",
					"border-radius",
					"gap",
				],
			});
			const normalizeMarkup = (markup: string): string =>
				markup.replace(/\s+class="[^"]*"/gu, "").replace(/\s+style="[^"]*"/gu, "");
			const report: TokenamiInstalledProof = {
				schema: proofSchema,
				route: { from: CodemodAdapterId.Tokenami, to: CodemodAdapterId.YumCSS },
				referenceCommit,
				referencePath,
				fixture: {
					files: ["src/App.tsx", "src/main.tsx", "src/entry-server.tsx", "tokenami.config.ts"],
					isolated: true,
				},
				dependencies: {
					installed: packageInstalled(sourceRoot, "@tokenami/css"),
					targetPackage: normalizeInstalledTargetPackage(versions.yumcss, repositoryRoot),
					targetNodeModule: packageInstalled(targetRoot, "yumcss"),
				},
				migration: {
					...migration,
					sourceImportRemoved: !migratedApp.includes("@tokenami/"),
					classCarrier:
						migratedApp.includes("css.class({") && migratedApp.includes("className={className()}"),
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
					targetBytes: Buffer.byteLength(generatedCss(targetRoot)),
					note: "Tokenami source bytes are generated by the official Tokenami CLI from the pinned css.compose API; the target uses YumCSS atomic CSS. The values are diagnostic output-size measurements, not a universal stylesheet budget.",
				},
			};
			if (!proofIsComplete(report))
				throw new Error(`Tokenami installed proof is incomplete: ${JSON.stringify(report)}`);
			return report;
		},
		{ retainOnError: true },
	);
}

if (import.meta.main) {
	const report = await runTokenamiInstalledProof();
	const output = join(repositoryRoot, "plans/evidence/tokenami-installed-proof.json");
	mkdirSync(join(repositoryRoot, "plans/evidence"), { recursive: true });
	writeJson(output, report);
	console.log(JSON.stringify(report, null, 2));
}
