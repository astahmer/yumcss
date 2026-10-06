import {
	normalizeInstalledTargetPackage,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { CodemodAdapterId } from "@yumcss/codemod/swap";
import {
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
import { readPinnedSource } from "./adapter-proof-harness.ts";

const repositoryRoot = resolve(import.meta.dirname, "..");
const yumcssPackageRoot = join(repositoryRoot, "packages/yumcss");
const proofSchema = "yumcss.installed-project-proof/1" as const;

type ScenarioId = "jss" | "fela" | "aphrodite" | "compiled" | "style9" | "next-yak";

interface Scenario {
	readonly id: ScenarioId;
	readonly adapter: CodemodAdapterId;
	readonly reference: {
		readonly clone: string;
		readonly repository: string;
		readonly commit: string;
		readonly path: string;
	};
	readonly sourceDependencies: Readonly<Record<string, string>>;
	readonly sourceDevDependencies?: Readonly<Record<string, string>>;
	readonly packageOverrides?: Readonly<Record<string, string>>;
	readonly sourceApp: string;
	readonly sourceMain: string;
	readonly sourceEntryServer: string;
	readonly sourceViteConfig: string;
	readonly computedProperties: readonly string[];
	readonly allowEmptyTargetCss?: boolean;
}

interface CssInJsInstalledProof {
	readonly schema: typeof proofSchema;
	readonly reference: {
		readonly repository: string;
		readonly commit: string;
		readonly sourceEntry: string;
	};
	readonly route: { readonly from: CodemodAdapterId; readonly to: CodemodAdapterId.YumCSS };
	readonly fixture: { readonly files: readonly string[]; readonly isolated: true };
	readonly dependencies: {
		readonly installed: true;
		readonly targetPackage: string;
		readonly targetNodeModule: boolean;
	};
	readonly migration: InstalledProofMigrationSummary & {
		readonly targetUsesYumCSS: boolean;
	};
	readonly checks: {
		readonly sourceTypecheck: true;
		readonly targetTypecheck: true;
		readonly sourceBuild: true;
		readonly targetBuild: true;
		readonly sourceSsr: true;
		readonly targetSsr: true;
		readonly hydration: boolean;
	};
	readonly ssr: { readonly markupEquivalent: boolean };
	readonly browser: InstalledProofBrowserEvidence;
	readonly css: {
		readonly sourceBytes: number;
		readonly targetBytes: number;
		readonly targetNotLarger: boolean;
		readonly comparison: "comparable" | "diagnostic";
	};
}

type InstalledProofMigrationSummary = {
	readonly converted: number;
	readonly skipped: number;
	readonly residuals: number;
	readonly canonical: InstalledProofCanonicalEvidence;
};

const versions = {
	"@compiled/react": "2.0.0",
	"@compiled/vite-plugin": "2.0.3",
	"@types/node": "26.4.1",
	"@types/react": "19.2.18",
	"@types/react-dom": "19.2.7",
	"@vitejs/plugin-react-swc": "4.3.3",
	aphrodite: "2.4.0",
	"fela-dom": "12.2.1",
	fela: "12.2.1",
	jss: "10.10.0",
	"jss-plugin-camel-case": "10.10.0",
	"jss-plugin-nested": "10.10.0",
	"oxc-parser": "0.148.0",
	yumcss: `file:${yumcssPackageRoot}`,
	"react-dom": "19.2.8",
	react: "19.2.8",
	rollup: "4.63.1",
	style9: "0.18.2",
	"next-yak": "9.6.0",
	typescript: "7.0.2",
	vite: "8.2.2",
} as const;

const reactViteConfig = `import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [react()], ssr: { noExternal: true } });
`;

const reactExternalViteConfig = `import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [react()] });
`;

const scenarios: Readonly<Record<ScenarioId, Scenario>> = {
	aphrodite: {
		id: "aphrodite",
		adapter: CodemodAdapterId.Aphrodite,
		reference: {
			clone: "aphrodite",
			repository: "https://github.com/Khan/aphrodite",
			commit: "225f43c5802259a9e042b384a1f4f2e5b48094ea",
			path: "tests/index_test.js",
		},
		sourceDependencies: { aphrodite: versions.aphrodite },
		sourceApp: `import { StyleSheet, css } from "aphrodite";

const styles = StyleSheet.create({
	button: {
		backgroundColor: "#123456",
		color: "white",
		padding: "16px",
		borderRadius: "8px",
		":hover": { backgroundColor: "#234567" },
	},
});

export const App = () => <button data-proof className={css(styles.button)}>Aphrodite</button>;
`,
		sourceMain: `import { hydrateRoot } from "react-dom/client";
import { App } from "./App";

hydrateRoot(document.getElementById("root")!, <App />);
`,
		sourceEntryServer: `import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { StyleSheetServer } from "aphrodite";
import { App } from "./App";

export { App };
export const sourceCss = () =>
	StyleSheetServer.renderStatic(() => renderToString(createElement(App))).css.content;
`,
		sourceViteConfig: reactExternalViteConfig,
		computedProperties: ["background-color", "color", "padding-left", "border-radius"],
	},
	compiled: {
		id: "compiled",
		adapter: CodemodAdapterId.Compiled,
		reference: {
			clone: "compiled",
			repository: "https://github.com/atlassian-labs/compiled",
			commit: "0f5d2b606471b9fb92c2402d5367c3c23efd1a29",
			path: "fixtures/parcel-optimizer-test-app/src/index.jsx",
		},
		sourceDependencies: { "@compiled/react": versions["@compiled/react"] },
		sourceDevDependencies: { "@compiled/vite-plugin": versions["@compiled/vite-plugin"] },
		sourceApp: (() => {
			const source = readPinnedSource({
				clone: "compiled",
				commit: "0f5d2b606471b9fb92c2402d5367c3c23efd1a29",
				path: "fixtures/parcel-optimizer-test-app/src/index.jsx",
			});
			return source
				.replace(
					"// eslint-disable-next-line import/named -- cssMapScoped is not in public types\nimport",
					"/** @jsxImportSource @compiled/react */\n// @ts-expect-error -- cssMapScoped is runtime-exported but intentionally omitted from the public root types\nimport",
				)
				.replaceAll("// @ts-expect-error -- cssMapScoped is not in public types\n", "")
				.replace("const App = () =>", "export const App = () =>")
				.replace("<ComponentA />", "<ComponentA data-proof />");
		})(),
		sourceMain: `import { hydrateRoot } from "react-dom/client";
import { App } from "./App";

hydrateRoot(document.getElementById("root")!, <App />);
`,
		sourceEntryServer: `export { App } from "./App";
`,
		sourceViteConfig: `import compiledModule from "@compiled/vite-plugin";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

const compiled = (compiledModule as any).default || compiledModule;

export default defineConfig({
	plugins: [compiled({ importReact: false, extensions: [".js", ".jsx", ".ts", ".tsx"] }), react()],
	ssr: { noExternal: ["yumcss"] },
});
`,
		computedProperties: ["background-color", "color", "padding-left", "border-radius"],
	},
	fela: {
		id: "fela",
		adapter: CodemodAdapterId.Fela,
		reference: {
			clone: "fela",
			repository: "https://github.com/rofrischmann/fela",
			commit: "6883525fa44c2c47d0d93768eb26f072fee3c439",
			path: "packages/fela-dom/src/dom/__tests__/render-test.js",
		},
		sourceDependencies: { fela: versions.fela, "fela-dom": versions["fela-dom"] },
		sourceApp: `import { createRenderer } from "fela";

export const renderer = createRenderer();
const buttonClass = renderer.renderRule(() => ({
	backgroundColor: "#123456",
	color: "white",
	padding: "16px",
	borderRadius: "8px",
	":hover": { backgroundColor: "#234567" },
}), {});

export const App = () => <button data-proof className={buttonClass}>Fela</button>;
`,
		sourceMain: `import { hydrateRoot } from "react-dom/client";
import { render } from "fela-dom";
import { App, renderer } from "./App";

render(renderer);
hydrateRoot(document.getElementById("root")!, <App />);
`,
		sourceEntryServer: `import { renderToMarkup } from "fela-dom";
import { App, renderer } from "./App";

export { App };
export const sourceCss = () => renderToMarkup(renderer).replace(/<style[^>]*>|<\\/style>/gu, "");
`,
		sourceViteConfig: reactViteConfig,
		computedProperties: ["background-color", "color", "padding-left", "border-radius"],
	},
	jss: {
		id: "jss",
		adapter: CodemodAdapterId.Jss,
		reference: {
			clone: "jss",
			repository: "https://github.com/cssinjs/jss",
			commit: "901882a894c7e802450696ebe2ea633ae63c5977",
			path: "examples/inline/app.js",
		},
		sourceDependencies: {
			jss: versions.jss,
			"jss-plugin-camel-case": versions["jss-plugin-camel-case"],
			"jss-plugin-nested": versions["jss-plugin-nested"],
		},
		sourceApp: `import { create } from "jss";
import * as camelCaseModule from "jss-plugin-camel-case";
import * as nestedModule from "jss-plugin-nested";

const jss = create();
const camelCase = camelCaseModule.default;
const nested = nestedModule.default;
jss.use(camelCase(), nested());

export const sheet = jss.createStyleSheet({
	button: {
		backgroundColor: "#123456",
		color: "white",
		padding: "16px",
		borderRadius: "8px",
		"&:hover": { backgroundColor: "#234567" },
	},
}).attach();

export const App = () => <button data-proof className={sheet.classes.button}>JSS</button>;
`,
		sourceMain: `import { hydrateRoot } from "react-dom/client";
import { App } from "./App";

hydrateRoot(document.getElementById("root")!, <App />);
`,
		sourceEntryServer: `import { sheet } from "./App";

export { App } from "./App";
export const sourceCss = () => sheet.toString();
`,
		sourceViteConfig: reactViteConfig,
		computedProperties: ["background-color", "color", "padding-left", "border-radius"],
	},
	style9: {
		id: "style9",
		adapter: CodemodAdapterId.Style9,
		reference: {
			clone: "style9",
			repository: "https://github.com/johanholmerin/style9",
			commit: "b0657ddb3cd24434a6a59db9c2e22cbedf5e6f42",
			path: "examples/nextjs/shared/styles.js",
		},
		sourceDependencies: { style9: versions.style9 },
		packageOverrides: { "sort-css-media-queries": "2.2.0" },
		sourceApp: `import style9 from "style9";

const layout = style9.create({
	center: {
		display: "flex",
		flexDirection: "column",
		justifyContent: "center",
		alignItems: "center",
	},
});

const styles = style9.create({
	container: {
		minHeight: "100vh",
		padding: "16px",
	},
	title: {
		margin: 0,
		fontSize: "32px",
		lineHeight: 1.2,
	},
	proof: {
		color: "rebeccapurple",
		":hover": { color: "purple" },
	},
});

// @ts-expect-error -- style9's Vite compiler replaces named style maps with class strings
const titleClass: string = styles.title;
// @ts-expect-error -- style9's Vite compiler replaces named style maps with class strings
const proofClass: string = styles.proof;

export const App = () => (
	<main data-proof className={style9(styles.container, layout.center)}>
		<h1 className={titleClass}>Style9</h1>
		<span className={proofClass}>compiled design tokens</span>
	</main>
);
`,
		sourceMain: `import { hydrateRoot } from "react-dom/client";
import { App } from "./App";

hydrateRoot(document.getElementById("root")!, <App />);
`,
		sourceEntryServer: `export { App } from "./App";
`,
		sourceViteConfig: `import react from "@vitejs/plugin-react-swc";
import style9Vite from "style9/vite";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [style9Vite(), react()], ssr: { noExternal: ["yumcss"] } });
`,
		computedProperties: ["color", "font-size", "padding-left", "min-height"],
	},
	"next-yak": {
		id: "next-yak",
		adapter: CodemodAdapterId.NextYak,
		reference: {
			clone: "css-in-js-bench",
			repository: "https://github.com/jantimon/css-in-js-bench",
			commit: "3dee1bc32e651ace01c5e4d9306c541337d0c1ce",
			path: "techs/next-yak/case/dyn-fair/index.tsx",
		},
		sourceDependencies: { "next-yak": versions["next-yak"] },
		sourceApp: (() => {
			const source = readPinnedSource({
				clone: "css-in-js-bench",
				commit: "3dee1bc32e651ace01c5e4d9306c541337d0c1ce",
				path: "techs/next-yak/case/dyn-fair/index.tsx",
			});
			return source
				.replace("export default (i: number) => {", "export const App = () => {\n  const i = 1;")
				.replace("<TranslatedDot $translateX", "<TranslatedDot data-proof $translateX");
		})(),
		sourceMain: `import { hydrateRoot } from "react-dom/client";
import { App } from "./App";

hydrateRoot(document.getElementById("root")!, <App />);
`,
		sourceEntryServer: `export { App } from "./App";
`,
		sourceViteConfig: `import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react-swc";
import { viteYak } from "next-yak/vite";
import { defineConfig } from "vite";

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig(async () => ({
	plugins: [await viteYak({ basePath: resolve(here) }), react()],
	define: { "process.env.NODE_ENV": '"production"' },
	resolve: { dedupe: ["react", "react-dom"] },
	ssr: { noExternal: ["yumcss"] },
}));
`,
		computedProperties: ["transform", "width", "height", "display"],
		allowEmptyTargetCss: true,
	},
};

const packageJson = (scenario: Scenario, includeYumCSS: boolean): Record<string, unknown> => ({
	private: true,
	type: "module",
	scripts: {
		build: "vite build",
		ssr: "vite build --ssr src/entry-server.tsx",
		typecheck: "tsc --noEmit",
	},
	dependencies: {
		...scenario.sourceDependencies,
		...(includeYumCSS ? { yumcss: versions.yumcss } : {}),
		react: versions.react,
		"react-dom": versions["react-dom"],
	},
	devDependencies: {
		"@types/node": versions["@types/node"],
		"@types/react": versions["@types/react"],
		"@types/react-dom": versions["@types/react-dom"],
		"@vitejs/plugin-react-swc": versions["@vitejs/plugin-react-swc"],
		rollup: versions.rollup,
		...(includeYumCSS ? { "oxc-parser": versions["oxc-parser"] } : {}),
		...scenario.sourceDevDependencies,
		typescript: versions.typescript,
		vite: versions.vite,
	},
});

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

const targetMain = `import { hydrateRoot } from "react-dom/client";
import { App } from "./App";

hydrateRoot(document.getElementById("root")!, <App />);
`;

const createFixture = (root: string, scenario: Scenario, includeYumCSS: boolean): void => {
	mkdirSync(join(root, "src"), { recursive: true });
	writeJson(join(root, "package.json"), packageJson(scenario, includeYumCSS));
	if (scenario.packageOverrides !== undefined) {
		writeFileSync(
			join(root, "pnpm-workspace.yaml"),
			`packages: []\noverrides:\n${Object.entries(scenario.packageOverrides)
				.map(([name, version]) => `  ${name}: ${version}`)
				.join("\n")}\n`,
		);
	}
	writeJson(join(root, "tsconfig.json"), tsConfig);
	writeFileSync(join(root, "vite.config.ts"), scenario.sourceViteConfig);
	writeFileSync(join(root, "src/App.tsx"), scenario.sourceApp);
	writeFileSync(join(root, "src/main.tsx"), scenario.sourceMain);
	writeFileSync(join(root, "src/entry-server.tsx"), scenario.sourceEntryServer);
	writeFileSync(
		join(root, "index.html"),
		'<div id="root"></div><script type="module" src="/src/main.tsx"></script>\n',
	);
};

const normalizeMarkup = (markup: string): string =>
	markup
		.replace(/<style[^>]*>[\s\S]*?<\/style>/gu, "")
		.replace(/\sstyle="[^"]*"/gu, "")
		.replace(/class="[^"]*"/gu, 'class="CLASS"');

const inlineStyleBytes = (markup: string): number =>
	Buffer.byteLength(
		[...markup.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gu)].map((match) => match[1]).join(""),
	);

const proofIsComplete = (report: CssInJsInstalledProof, scenario: Scenario): boolean =>
	report.migration.converted > 0 &&
	report.migration.skipped === 0 &&
	report.migration.residuals === 0 &&
	report.migration.canonical.checked &&
	report.migration.canonical.equal &&
	report.migration.targetUsesYumCSS &&
	report.dependencies.targetNodeModule &&
	report.checks.hydration &&
	report.ssr.markupEquivalent &&
	report.browser.equivalent &&
	report.css.sourceBytes > 0 &&
	(scenario.allowEmptyTargetCss === true || report.css.targetBytes > 0);

const runScenario = async (scenario: Scenario): Promise<CssInJsInstalledProof> => {
	run("pnpm", ["--filter", "yumcss", "run", "build"], repositoryRoot);
	return withInstalledProofProject(
		`yumcss-${scenario.id}-installed-proof-`,
		async ({ sourceRoot, targetRoot }) => {
			createFixture(sourceRoot, scenario, false);
			createFixture(targetRoot, scenario, true);
			run("pnpm", ["install", "--ignore-scripts", "--no-frozen-lockfile"], sourceRoot);
			run("pnpm", ["install", "--ignore-scripts", "--no-frozen-lockfile"], targetRoot);
			run("pnpm", ["run", "typecheck"], sourceRoot);
			const sourceSsr = await renderInstalledServer(sourceRoot, {
				collectAphrodite: scenario.id === "aphrodite",
			});
			writeIndex(sourceRoot, sourceSsr.markup, sourceSsr.css);
			run("pnpm", ["run", "build"], sourceRoot);
			const migration = parseInstalledProofMigration(
				runCaptured(
					"nub",
					[
						"--conditions",
						"yumcss",
						join(repositoryRoot, "packages/codemod/src/cli.ts"),
						"migrate",
						"--from",
						scenario.adapter,
						"--to",
						"yumcss",
						"--root",
						targetRoot,
						"--no-install",
						"src/App.tsx",
						"--report",
						"--report-format=json",
					],
					repositoryRoot,
				),
				scenario.id,
			);
			writeFileSync(join(targetRoot, "src/main.tsx"), targetMain);
			writeFileSync(join(targetRoot, "src/entry-server.tsx"), 'export { App } from "./App";\n');
			const migratedApp = readFileSync(join(targetRoot, "src/App.tsx"), "utf8");
			const targetSsr = await renderInstalledServer(targetRoot);
			writeIndex(targetRoot, targetSsr.markup, targetSsr.css);
			run("pnpm", ["run", "typecheck"], targetRoot);
			run("pnpm", ["run", "build"], targetRoot);
			const sourceBytes = Math.max(
				Buffer.byteLength(sourceSsr.css),
				inlineStyleBytes(sourceSsr.markup),
				Buffer.byteLength(generatedCss(sourceRoot)),
			);
			const targetBytes = Buffer.byteLength(generatedCss(targetRoot));
			const browser = await browserProof({
				repositoryRoot,
				sourceRoot,
				targetRoot,
				resetStyles:
					"html, body, #root { margin: 0; padding: 0; } #root { width: 640px; } [data-proof] { appearance: none; border: 0; box-sizing: border-box; display: block; font: 16px/24px Arial, sans-serif; height: 56px; margin: 0; width: 160px; }",
				computedProperties: scenario.computedProperties,
			});
			const report: CssInJsInstalledProof = {
				schema: proofSchema,
				reference: {
					repository: scenario.reference.repository,
					commit: scenario.reference.commit,
					sourceEntry: scenario.reference.path,
				},
				route: { from: scenario.adapter, to: CodemodAdapterId.YumCSS },
				fixture: {
					files: ["src/App.tsx", "src/main.tsx", "src/entry-server.tsx", "vite.config.ts"],
					isolated: true,
				},
				dependencies: {
					installed: true,
					targetPackage: normalizeInstalledTargetPackage(versions.yumcss, repositoryRoot),
					targetNodeModule: existsSync(join(targetRoot, "node_modules/yumcss/package.json")),
				},
				migration: {
					...migration,
					targetUsesYumCSS: migratedApp.includes("yumcss"),
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
					sourceBytes,
					targetBytes,
					targetNotLarger: targetBytes <= sourceBytes,
					comparison: targetBytes <= sourceBytes ? "comparable" : "diagnostic",
				},
			};
			return report;
		},
		{ retain: (report) => !proofIsComplete(report, scenario), retainOnError: true },
	);
};

const main = async (): Promise<void> => {
	const id = process.argv[2] as ScenarioId | undefined;
	if (id === undefined || scenarios[id] === undefined)
		throw new Error(`expected one of ${Object.keys(scenarios).join(", ")}`);
	const report = await runScenario(scenarios[id]);
	const output = join(repositoryRoot, "plans/evidence", `${id}-installed-proof.json`);
	mkdirSync(resolve(output, ".."), { recursive: true });
	writeJson(output, report);
	console.log(JSON.stringify(report, null, 2));
	console.error(`wrote installed ${id} proof: ${relative(repositoryRoot, output)}`);
	if (!proofIsComplete(report, scenarios[id])) process.exitCode = 1;
};

if (import.meta.main) await main();
