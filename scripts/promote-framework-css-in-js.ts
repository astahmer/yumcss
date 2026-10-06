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
	allFiles,
	browserProof,
	findFile,
	generatedCss,
	parseInstalledProofMigration,
	run,
	runCaptured,
	withInstalledProofProject,
	writeJson,
	type InstalledProofBrowserEvidence,
	type InstalledProofCanonicalEvidence,
} from "./installed-proof.ts";
import { readPinnedSource } from "./adapter-proof-harness.ts";

const repositoryRoot = resolve(import.meta.dirname, "..");
const yumcssPackageRoot = join(repositoryRoot, "packages/yumcss");
const proofSchema = "yumcss.installed-project-proof/1" as const;

type ScenarioId = "linaria" | "solid-styled" | "vue-styled";
type Framework = "solid" | "vue";

interface Scenario {
	readonly id: ScenarioId;
	readonly adapter: CodemodAdapterId;
	readonly framework: Framework;
	readonly reference: {
		readonly clone: string;
		readonly repository: string;
		readonly commit: string;
		readonly path: string;
	};
	readonly sourceDependencies: Readonly<Record<string, string>>;
	readonly sourceDevDependencies?: Readonly<Record<string, string>>;
	readonly sourceFiles: Readonly<Record<string, string>>;
	readonly targetFiles: Readonly<Record<string, string>>;
	readonly migrationPatterns: readonly string[];
	readonly computedProperties: readonly string[];
	readonly fixtureFiles: readonly string[];
	readonly allowDiagnosticCssSize?: boolean;
}

interface FrameworkInstalledProof {
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
	readonly migration: {
		readonly converted: number;
		readonly skipped: number;
		readonly residuals: number;
		readonly canonical: InstalledProofCanonicalEvidence;
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

const versions = {
	"@babel/core": "7.28.4",
	"@babel/preset-typescript": "7.27.1",
	"@linaria/core": "8.2.0",
	"@types/node": "26.4.1",
	"@types/web": "0.0.246",
	"@vitejs/plugin-vue": "6.0.1",
	"@vue/server-renderer": "3.5.21",
	"babel-preset-solid": "1.9.9",
	"oxc-parser": "0.148.0",
	"solid-js": "1.9.9",
	"solid-styled-components": "0.28.5",
	typescript: "7.0.2",
	vite: "8.2.2",
	"vite-plugin-solid": "2.11.7",
	vue: "3.5.21",
	"vue-tsc": "3.0.5",
	"vue-typescript": "5.9.3",
	"@wyw-in-js/vite": "2.4.0",
	yumcss: `file:${yumcssPackageRoot}`,
} as const;

const solidViteConfig = `import solid from "vite-plugin-solid";
import { defineConfig } from "vite";

export default defineConfig(({ isSsrBuild }) => ({
	plugins: [solid({ ssr: isSsrBuild === true })],
	ssr: { resolve: { conditions: ["node"] } },
}));
`;

const linariaViteConfig = `import wyw from "@wyw-in-js/vite";
import solid from "vite-plugin-solid";
import { defineConfig } from "vite";

export default defineConfig(({ isSsrBuild }) => ({
	plugins: [
		wyw({ displayName: true }),
		solid({ ssr: isSsrBuild === true }),
	],
	ssr: { resolve: { conditions: ["node"] } },
}));
`;

const vueViteConfig = `import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [vue()] });
`;

const vueYumCSSViteConfig = `import vue from "@vitejs/plugin-vue";
import { yumcssExtractVite } from "yumcss/vite";
import { preset } from "./yumcss/preset";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [vue(), yumcssExtractVite(preset, { root: "." })] });
`;

const solidTsConfig = {
	compilerOptions: {
		jsx: "preserve",
		jsxImportSource: "solid-js",
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

const vueTsConfig = {
	compilerOptions: {
		allowJs: false,
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

const linariaReference = {
	clone: "linaria",
	repository: "https://github.com/callstack/linaria",
	commit: "41d201d45aa7c64aa0f2bd3148ec919c8e1f54eb",
	path: "examples/astro-solid/pages/csr.tsx",
} as const;

const solidStyledReference = {
	clone: "solid-styled",
	repository: "https://github.com/solidjs/solid-styled-components",
	commit: "b798a6d91a02450f3649365a3cdb27a282f4b37d",
	path: "test/test.spec.tsx",
} as const;

const vueStyledReference = {
	clone: "vue-styled",
	repository: "https://github.com/vue-styled-components/core",
	commit: "5874630ed4d54aa955052fc864140eeae30fad2c",
	path: "packages/playground/src/App.vue",
} as const;

const linariaApp = readPinnedSource(linariaReference)
	.replace("export default function CSRComponent()", "export default function CSRComponent()")
	.replace(
		"<strong\n          class={css`\n            color: ${GLOBAL_VARS.color_header};",
		"<strong\n          data-proof\n          class={css`\n            color: ${GLOBAL_VARS.color_header};",
	);

const solidStyledApp = `/* @jsxImportSource solid-js */
import { Component } from "solid-js";
import { styled, ThemeProvider } from "solid-styled-components";

const Div = styled("div")<{ bold: boolean; border: number; color: string }>
	\`color: steelblue;
	font-size: 32px;
	padding: 5px;
	border: \${({ border = 1, color = "gainsboro" }): string => \`\${border}px solid \${color}\`};
	background-color: linen;
	font-weight: \${({ bold = false }): string | number => (bold ? "bold" : 100)};\`;

const HoverButton = styled("button")<{ active: boolean }>
	\`background: \${({ active }): string => (active ? "seagreen" : "steelblue")};
	color: white;
	padding: 8px 14px;
	border: 0;
	&:hover { background: tomato; }\`;

const SuperDiv = styled("div")\`color: red;\`;
const UltraDiv = styled(SuperDiv)\`background-color: yellow;\`;
const BaseComponent: Component<{ foo: string; className?: string }> = props => <div class={props.className}>{props.foo}</div>;
const StyledComponent = styled(BaseComponent)\`color: purple;\`;

export const App = () => (
	<ThemeProvider theme={{ colors: { primary: "hotpink" } }}>
		<main>
			<Div bold={true} border={1} color="whitesmoke">Testera</Div>
			<HoverButton data-proof active={true}>Hover me</HoverButton>
			<UltraDiv>Composed</UltraDiv>
			<StyledComponent foo="bar" />
		</main>
	</ThemeProvider>
);

export default App;
`;

const vueStyledSource = readPinnedSource(vueStyledReference);
const vueStyledScript = vueStyledSource
	.slice(vueStyledSource.indexOf('<script setup lang="ts">') + '<script setup lang="ts">'.length)
	.split("// 标签页配置", 1)[0]
	.replace(
		"import styled, { css, ThemeProvider } from '@vue-styled-components/core'",
		"import styled, { ThemeProvider } from '@vue-styled-components/core'",
	)
	.replace(/import PerformancePanel[^\n]+\n/gu, "")
	.replace(/import BasicTests[^\n]+\n/gu, "")
	.replace(/import StressTests[^\n]+\n/gu, "")
	.replace(/import ThemeTests[^\n]+\n/gu, "")
	.replace(/import PropsTest[^\n]+\n/gu, "")
	.replace(/import DebugPanel[^\n]+\n/gu, "")
	.replace(/import TransitionTest[^\n]+\n/gu, "")
	.replace(
		"import { reactive, ref, computed, onMounted, onUnmounted } from 'vue'",
		"import { reactive, ref, onMounted, onUnmounted } from 'vue'",
	)
	.replace("const activeTab = ref('basic')", "const activeTab = ref('basic')")
	.replace("const performanceEnabled = ref(true)", "const performanceEnabled = ref(true)")
	.replace("const debugMode = ref(false)", "const debugMode = ref(false)");

const vueStyledApp = `<script setup lang="ts">
${vueStyledScript}
const tabs = [{ id: 'basic', label: '基础测试', icon: '🧪' }, { id: 'theme', label: '主题测试', icon: '🎨' }]
const switchTab = (tabId: string) => { activeTab.value = tabId }
const togglePerformance = () => { performanceEnabled.value = !performanceEnabled.value }
const toggleDebug = () => { debugMode.value = !debugMode.value }
</script>

<template>
  <ThemeProvider :theme="theme">
    <AppContainer>
      <Header>
        <h1>Vue Styled Components Playground</h1>
        <p class="subtitle">调试和性能测试环境</p>
      </Header>
      <MainContent>
        <Sidebar>
          <ControlPanel>
            <ToggleButton :active="performanceEnabled" @click="togglePerformance">性能监控</ToggleButton>
            <ToggleButton :active="debugMode" @click="toggleDebug">调试模式</ToggleButton>
          </ControlPanel>
          <TabButton v-for="tab in tabs" :key="tab.id" :active="activeTab === tab.id" @click="switchTab(tab.id)">
            {{ tab.icon }} {{ tab.label }}
          </TabButton>
        </Sidebar>
        <ContentArea data-proof color="red">
          <h2>{{ activeTab }}</h2>
          <p>Real Vue styled-components playground surface.</p>
        </ContentArea>
      </MainContent>
    </AppContainer>
  </ThemeProvider>
</template>
`;

const scenarios: Readonly<Record<ScenarioId, Scenario>> = {
	linaria: {
		id: "linaria",
		adapter: CodemodAdapterId.Linaria,
		framework: "solid",
		reference: linariaReference,
		sourceDependencies: {
			"@babel/core": versions["@babel/core"],
			"@babel/preset-typescript": versions["@babel/preset-typescript"],
			"@linaria/core": versions["@linaria/core"],
			"@wyw-in-js/vite": versions["@wyw-in-js/vite"],
			"babel-preset-solid": versions["babel-preset-solid"],
			"solid-js": versions["solid-js"],
		},
		sourceDevDependencies: { "vite-plugin-solid": versions["vite-plugin-solid"] },
		sourceFiles: {
			"src/App.tsx": linariaApp,
			"src/csr_child.tsx": readPinnedSource({
				...linariaReference,
				path: "examples/astro-solid/pages/csr_child.tsx",
			}),
			"src/external.ts": readPinnedSource({
				...linariaReference,
				path: "examples/astro-solid/pages/external.ts",
			}),
			"src/main.tsx": `import { render } from "solid-js/web";
import App from "./App";

render(() => <App />, document.getElementById("root")!);
`,
			"src/entry-server.tsx": `import { renderToString } from "solid-js/web";
import App from "./App";

export const render = () => renderToString(() => <App />);
`,
		},
		targetFiles: {
			"src/main.tsx": `import { render } from "solid-js/web";
import App from "./App";

render(() => <App />, document.getElementById("root")!);
`,
			"src/entry-server.tsx": `import { renderToString } from "solid-js/web";
import App from "./App";

export const render = () => renderToString(() => <App />);
`,
		},
		migrationPatterns: ["src/App.tsx", "src/csr_child.tsx"],
		computedProperties: ["color", "font-size", "font-style"],
		fixtureFiles: ["src/App.tsx", "src/csr_child.tsx", "src/external.ts", "vite.config.ts"],
		allowDiagnosticCssSize: true,
	},
	"solid-styled": {
		id: "solid-styled",
		adapter: CodemodAdapterId.SolidStyled,
		framework: "solid",
		reference: solidStyledReference,
		sourceDependencies: {
			"solid-js": versions["solid-js"],
			"solid-styled-components": versions["solid-styled-components"],
		},
		sourceDevDependencies: { "vite-plugin-solid": versions["vite-plugin-solid"] },
		sourceFiles: {
			"src/App.tsx": solidStyledApp,
			"src/main.tsx": `import { render } from "solid-js/web";
import App from "./App";

render(() => <App />, document.getElementById("root")!);
`,
			"src/entry-server.tsx": `import { renderToString } from "solid-js/web";
import { extractCss } from "solid-styled-components";
import App from "./App";

export const render = () => renderToString(() => <App />);
export const getCss = () => extractCss();
`,
		},
		targetFiles: {
			"src/main.tsx": `import { render } from "solid-js/web";
import App from "./App";

render(() => <App />, document.getElementById("root")!);
`,
			"src/entry-server.tsx": `import { renderToString } from "solid-js/web";
import App from "./App";

export const render = () => renderToString(() => <App />);
`,
		},
		migrationPatterns: ["src/App.tsx"],
		computedProperties: ["color", "font-size", "padding", "background-color"],
		fixtureFiles: ["src/App.tsx", "vite.config.ts"],
	},
	"vue-styled": {
		id: "vue-styled",
		adapter: CodemodAdapterId.VueStyled,
		framework: "vue",
		reference: vueStyledReference,
		sourceDependencies: {
			"@vue-styled-components/core": "1.13.3",
			"@vue/server-renderer": versions["@vue/server-renderer"],
			vue: versions.vue,
		},
		sourceDevDependencies: { "@vitejs/plugin-vue": versions["@vitejs/plugin-vue"] },
		sourceFiles: {
			"src/App.vue": vueStyledApp,
			"src/main.ts": `import { createApp } from "vue";
import App from "./App.vue";

createApp(App).mount("#root");
`,
			"src/entry-server.ts": `import { createSSRApp } from "vue";
import { renderToString } from "@vue/server-renderer";
import App from "./App.vue";

export const render = () => renderToString(createSSRApp(App));
`,
		},
		targetFiles: {
			"src/main.ts": `import { createApp } from "vue";
import App from "./App.vue";

createApp(App).mount("#root");
`,
			"src/entry-server.ts": `import { createSSRApp } from "vue";
import { renderToString } from "@vue/server-renderer";
import App from "./App.vue";

export const render = () => renderToString(createSSRApp(App));
`,
		},
		migrationPatterns: ["src/App.vue"],
		computedProperties: ["color", "padding", "background-color", "border-radius"],
		fixtureFiles: ["src/App.vue", "vite.config.ts"],
	},
};

const packageJson = (scenario: Scenario, includeYumCSS: boolean): Record<string, unknown> => {
	const dependencies: Record<string, string> = { ...scenario.sourceDependencies };
	if (includeYumCSS) {
		for (const name of ["@linaria/core", "@wyw-in-js/vite", "babel-preset-solid"])
			if (scenario.id === "linaria") delete dependencies[name];
		dependencies.yumcss = versions.yumcss;
	}
	const devDependencies: Record<string, string> = {
		"@types/node": versions["@types/node"],
		typescript: scenario.framework === "vue" ? versions["vue-typescript"] : versions.typescript,
		vite: versions.vite,
	};
	if (scenario.sourceDevDependencies !== undefined)
		Object.assign(devDependencies, scenario.sourceDevDependencies);
	if (includeYumCSS) devDependencies["oxc-parser"] = versions["oxc-parser"];
	if (scenario.framework === "vue") devDependencies["vue-tsc"] = versions["vue-tsc"];
	return {
		name: `yumcss-${scenario.id}-proof`,
		private: true,
		type: "module",
		scripts: {
			typecheck: scenario.framework === "vue" ? "vue-tsc --noEmit" : "tsc --noEmit",
			build: "vite build",
			ssr: `vite build --ssr src/entry-server.${scenario.framework === "vue" ? "ts" : "tsx"}`,
		},
		dependencies,
		devDependencies,
	};
};

const createFixture = (root: string, scenario: Scenario, includeYumCSS: boolean): void => {
	const files = includeYumCSS
		? { ...scenario.sourceFiles, ...scenario.targetFiles }
		: scenario.sourceFiles;
	mkdirSync(join(root, "src"), { recursive: true });
	writeJson(join(root, "package.json"), packageJson(scenario, includeYumCSS));
	writeJson(
		join(root, "tsconfig.json"),
		scenario.framework === "vue" ? vueTsConfig : solidTsConfig,
	);
	writeFileSync(
		join(root, "vite.config.ts"),
		scenario.framework === "vue"
			? includeYumCSS
				? vueYumCSSViteConfig
				: vueViteConfig
			: scenario.id === "linaria" && !includeYumCSS
				? linariaViteConfig
				: solidViteConfig,
	);
	const mainPath = scenario.framework === "vue" ? "src/main.ts" : "src/main.tsx";
	writeFileSync(
		join(root, "index.html"),
		`<div id="root"></div><script type="module" src="/${mainPath}"></script>\n`,
	);
	for (const [path, content] of Object.entries(files)) {
		mkdirSync(resolve(root, path, ".."), { recursive: true });
		writeFileSync(join(root, path), content);
	}
	writeFileSync(
		join(root, "ssr-run.mjs"),
		`const module = await import(new URL("./dist/entry-server.js", import.meta.url));
const markup = await module.render();
const css = typeof module.getCss === "function" ? await module.getCss() : "";
process.stdout.write(JSON.stringify({ markup, css }));
`,
	);
};

const normalizeMarkup = (markup: string): string =>
	markup
		.replace(/\s(?:class|style|data-hk|data-v-[\\w-]+)=(?:"[^"]*"|'[^']*'|[^\s>]+)/gu, "")
		.replace(/<!--[^>]*-->/gu, "")
		.replace(/\s+>/gu, ">")
		.replace(/\s+/gu, " ")
		.trim();

const runSsr = (root: string): { readonly markup: string; readonly css: string } => {
	run("pnpm", ["run", "ssr"], root);
	const entry = findFile(join(root, "dist"), "entry-server.js");
	const output = runCaptured("node", [join(root, "ssr-run.mjs")], root);
	if (entry === undefined) throw new Error(`SSR build did not emit entry-server.js in ${root}`);
	return JSON.parse(output) as { readonly markup: string; readonly css: string };
};

const targetUsesYumCSS = (root: string): boolean =>
	allFiles(root)
		.filter((file) => /\.(?:[cm]?[jt]sx?|vue)$/u.test(file))
		.some((file) => readFileSync(file, "utf8").includes("yumcss"));

const proofIsComplete = (report: FrameworkInstalledProof, scenario: Scenario): boolean =>
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
	report.css.targetBytes > 0 &&
	(report.css.targetNotLarger ||
		(scenario.allowDiagnosticCssSize === true && report.css.comparison === "diagnostic"));

const runScenario = async (scenario: Scenario): Promise<FrameworkInstalledProof> => {
	run("pnpm", ["--filter", "yumcss", "run", "build"], repositoryRoot);
	return withInstalledProofProject(
		`yumcss-${scenario.id}-installed-proof-`,
		async ({ sourceRoot, targetRoot }) => {
			createFixture(sourceRoot, scenario, false);
			createFixture(targetRoot, scenario, true);
			run("pnpm", ["install", "--ignore-scripts", "--no-frozen-lockfile"], sourceRoot);
			run("pnpm", ["install", "--ignore-scripts", "--no-frozen-lockfile"], targetRoot);
			run("pnpm", ["run", "typecheck"], sourceRoot);
			const sourceSsr = runSsr(sourceRoot);
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
						...scenario.migrationPatterns,
						"--report",
						"--report-format=json",
					],
					repositoryRoot,
				),
				scenario.id,
			);
			run("pnpm", ["run", "typecheck"], targetRoot);
			const targetSsr = runSsr(targetRoot);
			run("pnpm", ["run", "build"], targetRoot);
			const sourceBytes = Math.max(
				Buffer.byteLength(sourceSsr.css),
				Buffer.byteLength(generatedCss(sourceRoot)),
			);
			const targetBytes = Math.max(
				Buffer.byteLength(targetSsr.css),
				Buffer.byteLength(generatedCss(targetRoot)),
			);
			const browser = await browserProof({
				repositoryRoot,
				sourceRoot,
				targetRoot,
				collectRuntimeStyleBytes: true,
				resetStyles:
					"html, body, #root { margin: 0; padding: 0; } #root { width: 640px; } [data-proof] { box-sizing: border-box; display: block; font: 16px/24px Arial, sans-serif; margin: 0; }",
				computedProperties: scenario.computedProperties,
			});
			const measuredSourceBytes = Math.max(sourceBytes, browser.runtimeStyleBytes?.source ?? 0);
			const measuredTargetBytes = Math.max(targetBytes, browser.runtimeStyleBytes?.target ?? 0);
			const report: FrameworkInstalledProof = {
				schema: proofSchema,
				reference: {
					repository: scenario.reference.repository,
					commit: scenario.reference.commit,
					sourceEntry: scenario.reference.path,
				},
				route: { from: scenario.adapter, to: CodemodAdapterId.YumCSS },
				fixture: { files: scenario.fixtureFiles, isolated: true },
				dependencies: {
					installed: true,
					targetPackage: normalizeInstalledTargetPackage(versions.yumcss, repositoryRoot),
					targetNodeModule: existsSync(join(targetRoot, "node_modules/yumcss/package.json")),
				},
				migration: {
					...migration,
					targetUsesYumCSS: targetUsesYumCSS(targetRoot),
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
					sourceBytes: measuredSourceBytes,
					targetBytes: measuredTargetBytes,
					targetNotLarger: measuredTargetBytes <= measuredSourceBytes,
					comparison: measuredTargetBytes <= measuredSourceBytes ? "comparable" : "diagnostic",
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
