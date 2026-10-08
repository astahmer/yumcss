import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { CodemodAdapterId } from "@yumcss/codemod/swap";
import {
	normalizeInstalledTargetPackage,
	browserProof,
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
const stitchesReferenceRoot = createReferenceWorkspace().path("stitches");
const referenceCommit = "50fd8a1adc6360340fe348a8b3ebc8b06d38e230";
const referencePath = "packages/react/tests/basic.js";
const yumcssPackageRoot = join(repositoryRoot, "packages/yumcss");
const proofSchema = "yumcss.installed-project-proof/1" as const;
const versions = {
	"@stitches/react": "1.3.1-1",
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

const tsConfig = {
	compilerOptions: {
		jsx: "react-jsx",
		lib: ["ESNext", "DOM", "DOM.Iterable"],
		module: "ESNext",
		moduleResolution: "Bundler",
		noEmit: true,
		target: "ES2022",
		strict: true,
		skipLibCheck: true,
		types: ["vite/client", "node"],
	},
	include: ["src", "vite.config.ts"],
};

interface StitchesInstalledProof {
	readonly schema: typeof proofSchema;
	readonly route: {
		readonly from: CodemodAdapterId.Stitches;
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
		readonly variantLowered: boolean;
		readonly recipeRuntimeGenerated: boolean;
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

const referenceSource = (): string => {
	const actual = runCaptured(
		"git",
		["-C", stitchesReferenceRoot, "rev-parse", "HEAD"],
		repositoryRoot,
	);
	if (actual.trim() !== referenceCommit)
		throw new Error(`Stitches reference moved: expected ${referenceCommit}, got ${actual.trim()}`);
	return runCaptured(
		"git",
		["-C", stitchesReferenceRoot, "show", `${referenceCommit}:${referencePath}`],
		repositoryRoot,
	);
};

const sourceStyles = `import { createStitches } from "@stitches/react";

export const { css, getCssText } = createStitches({
  theme: {
    colors: {
      base: "#123456",
      hover: "#234567",
      danger: "#9c2c2c",
    },
    space: { 4: "16px" },
    radii: { sm: "8px" },
  },
});

export const card = css({
  backgroundColor: "$colors$base",
  color: "white",
  padding: "$space$4",
  borderRadius: "$radii$sm",
  "&:hover": { backgroundColor: "$colors$hover" },
  variants: {
    tone: {
      danger: { backgroundColor: "$colors$danger" },
    },
  },
});
`;

const sourceApp = `import { card } from "./styles";

export const App = () => (
  <button data-proof className={card({ tone: "danger" })}>
    Stitches proof
  </button>
);
`;

const sourceViteConfig = `import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [react()] });
`;

const packageJson = (target: boolean): Record<string, unknown> => ({
	name: target ? "yumcss-stitches-target" : "stitches-installed-source",
	private: true,
	type: "module",
	scripts: {
		build: "vite build",
		ssr: "vite build --ssr src/entry-server.tsx",
		typecheck: "tsc --noEmit",
	},
	dependencies: {
		...(target ? { yumcss: versions.yumcss } : { "@stitches/react": versions["@stitches/react"] }),
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
	writeFileSync(join(root, "src/styles.ts"), sourceStyles);
	writeFileSync(join(root, "src/App.tsx"), sourceApp);
	writeFileSync(
		join(root, "src/entry-server.tsx"),
		target
			? 'import { runtimeCss } from "../yumcss/runtime";\nexport { App } from "./App";\nexport const yumcssCss = () => runtimeCss.sheet.css();\n'
			: 'import { getCssText } from "./styles";\nexport { App } from "./App";\nexport const stitchesCss = () => getCssText();\n',
	);
	writeFileSync(
		join(root, "src/main.tsx"),
		[
			...(target ? ['import "yumcss:css";'] : []),
			'import { hydrateRoot } from "react-dom/client";',
			'import { App } from "./App";',
			"",
			'hydrateRoot(document.getElementById("root")!, <App />);',
		].join("\n"),
	);
	writeFileSync(
		join(root, "src/vite-env.d.ts"),
		'/// <reference types="vite/client" />\ndeclare module "yumcss:css";\n',
	);
	writeFileSync(
		join(root, "index.html"),
		'<div id="root"></div><script type="module" src="/src/main.tsx"></script>\n',
	);
};

const proofIsComplete = (report: StitchesInstalledProof): boolean =>
	report.migration.converted > 0 &&
	report.migration.skipped === 0 &&
	report.migration.residuals === 0 &&
	report.migration.canonical.checked &&
	report.migration.canonical.equal &&
	report.migration.targetUsesYumCSS &&
	report.migration.sourceImportRemoved &&
	report.migration.variantLowered &&
	report.migration.recipeRuntimeGenerated &&
	report.migration.generatedVitePresetImportIsExplicit &&
	report.migration.generatedVitePluginPresent &&
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

export async function runStitchesInstalledProof(): Promise<StitchesInstalledProof> {
	const pinnedSource = referenceSource();
	return withInstalledProofProject(
		"yumcss-stitches-installed-",
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
						CodemodAdapterId.Stitches,
						"--to",
						CodemodAdapterId.YumCSS,
						"--root",
						targetRoot,
						"--no-install",
						"src/styles.ts",
						"--report",
						"--report-format=json",
					],
					repositoryRoot,
				),
				"Stitches",
			);
			const migratedStyles = readFileSync(join(targetRoot, "src/styles.ts"), "utf8");
			const targetViteConfig = readFileSync(join(targetRoot, "vite.config.ts"), "utf8");
			const targetPackage = JSON.parse(readFileSync(join(targetRoot, "package.json"), "utf8")) as {
				dependencies?: Record<string, string>;
			};
			writeFileSync(
				join(targetRoot, "src/entry-server.tsx"),
				'import { runtimeCss } from "../yumcss/runtime";\nexport { App } from "./App";\nexport const yumcssCss = () => runtimeCss.sheet.css();\n',
			);
			run("pnpm", ["run", "typecheck"], targetRoot);
			run("pnpm", ["run", "build"], targetRoot);
			const targetSsr = await renderInstalledServer(targetRoot);
			writeIndex(targetRoot, targetSsr.markup, targetSsr.css);
			run("pnpm", ["run", "build"], targetRoot);
			const browser = await browserProof({
				repositoryRoot,
				sourceRoot,
				targetRoot,
				resetStyles:
					"html, body, #root { margin: 0; padding: 0; } #root { width: 640px; } [data-proof] { appearance: none; border: 0; box-sizing: border-box; display: block; font: 16px/24px Arial, sans-serif; height: 56px; margin: 0; width: 220px; }",
				computedProperties: ["background-color", "color", "padding", "border-radius"],
			});
			const report: StitchesInstalledProof = {
				schema: proofSchema,
				route: { from: CodemodAdapterId.Stitches, to: CodemodAdapterId.YumCSS },
				referenceCommit,
				referencePath,
				fixture: {
					files: ["src/styles.ts", "src/App.tsx", "src/entry-server.tsx"],
					isolated: true,
				},
				dependencies: {
					installed: packageInstalled(sourceRoot, "@stitches/react"),
					targetPackage: normalizeInstalledTargetPackage(
						targetPackage.dependencies?.yumcss ?? "",
						repositoryRoot,
					),
					targetNodeModule: existsSync(join(targetRoot, "node_modules/yumcss/package.json")),
				},
				migration: {
					...migration,
					targetUsesYumCSS: migratedStyles.includes("yumcss"),
					sourceImportRemoved: !migratedStyles.includes("@stitches/react"),
					variantLowered:
						migratedStyles.includes("createRecipe") && migratedStyles.includes('"tone"'),
					recipeRuntimeGenerated: existsSync(join(targetRoot, "__yumcss/recipe.ts")),
					generatedVitePresetImportIsExplicit: targetViteConfig.includes("yumcss/preset"),
					generatedVitePluginPresent: targetViteConfig.includes("yumcssExtractVite"),
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
					sourceBytes: Buffer.byteLength(sourceSsr.css),
					targetBytes: Buffer.byteLength(targetSsr.css),
					note: "The tiny fixture compares Stitches' fused SSR sheet with YumCSS's atomic runtime sheet. Browser and canonical CSS parity are required, but this representation difference is not a meaningful non-growth budget.",
				},
			};
			if (!proofIsComplete(report))
				throw new Error(
					`Stitches installed proof is incomplete: ${JSON.stringify({ report, pinnedSourceBytes: pinnedSource.length })}`,
				);
			return report;
		},
		{ retainOnError: true },
	);
}

if (import.meta.main) {
	const report = await runStitchesInstalledProof();
	const output = join(repositoryRoot, "plans/evidence/stitches-installed-proof.json");
	mkdirSync(join(repositoryRoot, "plans/evidence"), { recursive: true });
	writeJson(output, report);
	console.log(JSON.stringify(report, null, 2));
}
