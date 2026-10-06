import { expect, test } from "tstyche";
import {
	createSourceScannerContractSuite,
	createSourceScannerRegistry,
	parseSourceProgram,
	SOURCE_SCANNER,
	SOURCE_SCANNER_CONTRACT_SCHEMA,
	SOURCE_SCANNER_SERVICE,
	SOURCE_SCANNER_PLUGIN_SCHEMA,
	SOURCE_SCANNER_SCHEMA,
	SourceLanguageAdapterId,
	SourceRuntimeBoundary,
	type SourceDocument,
	type SourceLanguageAdapter,
	type SourceLanguage,
	type SourceScannerContractFixture,
	type SourceScannerContractResult,
	type SourceScannerPlugin,
	type SourceScanResult,
	type SourceScannerService,
} from "yumcss/source";
import {
	createSourceWorkspace,
	SOURCE_WORKSPACE_SCHEMA,
	type SourceWorkspace,
	type SourceWorkspaceFile,
	type SourceWorkspaceFileSystem,
	type SourceWorkspaceQuery,
} from "yumcss/source/workspace";
import {
	selectorClassMatches,
	splitSelectorList,
	type SelectorClassMatch,
} from "yumcss/css/selector-scan";
import {
	collectTwClasses,
	createTwClassCollector,
	runTwScan,
	type TwClassCollector,
	type TwCollectResult,
	type TwScanOptions,
	type TwScanResult,
} from "yumcss/tw/collect";
import {
	createInlineTwPluginCore,
	createYumCSSEngineContext,
	foldStackElements,
	yumcssExtractVite,
	yumcssVite,
	stackFoldVite,
	type InlineTwPluginCore,
	type YumCSSExtractViteOptions,
	type YumCSSEngineContext,
	type YumCSSViteOptions,
	type Resolver,
} from "yumcss/vite";
import {
	yumcssRollup,
	yumcssRollupCss,
	yumcssUnplugin,
	yumcssUnpluginCss,
	yumcssWebpack,
	yumcssWebpackCss,
	type YumCSSUnpluginCssOptions,
	type YumCSSUnpluginOptions,
} from "yumcss/unplugin";
import { createCss } from "yumcss/css";
import { createNamedAtomsStrategy } from "yumcss/css/named";
import { examplePreset } from "@yumcss/example-preset";

test("source scanner registry contracts support custom language adapters", () => {
	const document: SourceDocument = {
		file: "src/app.txt",
		source: "content",
		language: "txt",
		root: "/project",
		runtimeBoundary: SourceRuntimeBoundary.Shared,
	};
	const scan: SourceScanResult = {
		document,
		language: "txt",
		excluded: [],
		diagnostics: [],
		isExcluded: () => false,
	};
	const adapter: SourceLanguageAdapter = {
		schema: SOURCE_SCANNER_SCHEMA,
		id: "custom-text",
		languages: ["txt"],
		detect: (candidate) => candidate.language === "txt",
		scan: () => scan,
	};
	const plugin: SourceScannerPlugin = {
		schema: SOURCE_SCANNER_PLUGIN_SCHEMA,
		id: "custom-text-plugin",
		adapters: [adapter],
	};
	const registry = createSourceScannerRegistry([adapter]);
	const fixture: SourceScannerContractFixture = { adapter: adapter.id, document };
	const contract = createSourceScannerContractSuite();

	registry.register(adapter).registerPlugin(plugin);
	expect(registry.scan(document)).type.toBe<SourceScanResult>();
	expect(registry.detect(document)).type.toBe<SourceLanguageAdapter | undefined>();
	expect(registry.languageForFile("src/app.tsx")).type.toBe<SourceLanguage>();
	expect(registry.isSupportedFile("src/app.tsx")).type.toBe<boolean>();
	expect(registry.isScriptFile("src/app.tsx")).type.toBe<boolean>();
	expect(registry.isTypeScriptFile("src/app.tsx")).type.toBe<boolean>();
	expect(contract.run(registry, [fixture])).type.toBe<SourceScannerContractResult>();
	expect(
		parseSourceProgram({ file: "src/app.ts", source: "const value = 1", language: "typescript" }),
	).type.toHaveProperty("program");
	expect(SOURCE_SCANNER).type.toHaveProperty("scan");
	expect(SOURCE_SCANNER_CONTRACT_SCHEMA).type.toBe<"yumcss.source-scanner-contract/1">();
	expect(SourceLanguageAdapterId.ReactJsx).type.toBe<"jsx-react">();
});

test("source scanner service and workspace preserve filesystem boundaries", () => {
	const scanner: SourceScannerService = SOURCE_SCANNER_SERVICE;
	const fileSystem: SourceWorkspaceFileSystem = {
		readFile: () => "export const value = 1",
		stat: () => ({ isFile: () => true, isDirectory: () => false, mtimeMs: 1 }),
		glob: (_pattern, options) => [`${options.cwd}/src/app.ts`],
	};
	const query: SourceWorkspaceQuery = {
		includeUnsupported: true,
		exclude: (file) => file.endsWith(".generated.ts"),
	};
	const workspace: SourceWorkspace = createSourceWorkspace({ fileSystem, scanner });

	expect(workspace.schema).type.toBe<typeof SOURCE_WORKSPACE_SCHEMA>();
	expect(workspace.files(["src/**/*.ts"], "/project", query)).type.toBe<readonly string[]>();
	expect(workspace.read(["/project/src/app.ts"])).type.toBe<readonly SourceWorkspaceFile[]>();
	expect(workspace.collect(["src/**/*.ts"], "/project", query)).type.toBe<
		readonly SourceWorkspaceFile[]
	>();
	expect(workspace.forEach(["/project/src/app.ts"], () => undefined)).type.toBe<void>();
	expect(workspace.invalidate("/project/src/app.ts")).type.toBe<void>();
});

test("selector scanning exposes stable match and selector-list result types", () => {
	const matches: SelectorClassMatch[] = selectorClassMatches(":where(.button\\:active, .card)");

	expect(splitSelectorList(".button, :where(.card, .panel)")).type.toBe<string[]>();
	expect(matches).type.toBe<SelectorClassMatch[]>();
	expect(matches[0]).type.toBe<SelectorClassMatch | undefined>();
});

test("Tailwind collector contracts expose bounded async results", () => {
	const options: TwScanOptions = {
		twEntry: "/project/tw.ts",
		srcDir: "/project/src",
		outFile: "/project/tw.generated.ts",
	};
	const scanResult: TwScanResult = {
		outFile: options.outFile,
		classes: ["bg-red-500"],
	};
	const collectResult: TwCollectResult = {
		classes: scanResult.classes,
		unresolvedTokens: [],
	};
	const collector: TwClassCollector = createTwClassCollector();

	expect(collector.collect([], options.twEntry)).type.toBe<Promise<TwCollectResult>>();
	expect(collectTwClasses([], options.twEntry)).type.toBe<Promise<string[]>>();
	expect(runTwScan(options)).type.toBe<Promise<TwScanResult>>();
	expect(collectResult).type.toBe<TwCollectResult>();
});

test("Vite contracts keep shared engines, resolvers, options, and plugin hooks typed", () => {
	const resolver: Resolver = { resolve: () => null };
	const viteOptions: YumCSSViteOptions = {
		twSources: ["./tw", /tw/],
		cxSources: ["./cx"],
		exclude: [/node_modules/],
		css: {
			preset: examplePreset,
			className: createNamedAtomsStrategy("app"),
			cssSources: ["./css"],
		},
		onUnresolved: "warn",
		onTwCandidates: (candidates) => candidates.join(" "),
	};
	const cssOptions: YumCSSExtractViteOptions = {
		cssSources: ["./css"],
		exclude: [/node_modules/],
		include: [/src/],
		splitByRoute: [{ match: /dashboard/, name: "dashboard", html: "dashboard.html" }],
		inlineCritical: { capBytes: 4096 },
		debug: true,
		namespace: "app",
		transformDynamicClassName: true,
		root: "/project",
		virtualId: "yumcss:css",
		className: createNamedAtomsStrategy("app"),
	};
	const engine: YumCSSEngineContext = createYumCSSEngineContext({
		preset: examplePreset,
		className: createNamedAtomsStrategy("app"),
		debug: true,
	});
	const core: InlineTwPluginCore = createInlineTwPluginCore(viteOptions);
	const vitePlugin = yumcssVite(viteOptions);
	const cssPlugin = yumcssExtractVite(examplePreset, { ...cssOptions, engine });
	const css = createCss(examplePreset);

	expect(core.transform("", "/project/src/app.tsx", resolver)).type.toBe<
		Promise<{ code: string; map: null } | null>
	>();
	expect(core.resolveId("virtual:tw")).type.toBe<string | null>();
	expect(core.load("virtual:tw")).type.toBe<string | null>();
	expect(core.invalidate("/project/src/app.tsx")).type.toBe<void>();
	expect(vitePlugin.name).type.toBe<string>();
	expect(cssPlugin.name).type.toBe<string>();
	expect(engine.foldLiteralStyle({ color: "red" })).type.toBe<string | null>();
	expect(css.class({ $raw: { color: "red" } })).type.toBe<string>();
	expect(foldStackElements("<Stack gap={4} />", "/project/src/app.tsx", { engine })).type.toBe<{
		code: string;
		folded: number;
	}>();
	expect(stackFoldVite({ engine, classAttribute: "class" }).name).type.toBe<string>();
});

test("unplugin adapters expose the universal and bundler-specific factories", () => {
	const options: YumCSSUnpluginOptions = { twSources: ["./tw"] };
	const cssOptions: YumCSSUnpluginCssOptions = { preset: examplePreset, root: "/project" };

	expect(yumcssUnplugin).type.toHaveProperty("vite");
	expect(yumcssUnplugin).type.toHaveProperty("raw");
	expect(yumcssUnpluginCss).type.toHaveProperty("vite");
	expect(yumcssUnpluginCss).type.toHaveProperty("raw");
	expect(yumcssUnplugin.vite).type.toBeCallableWith(options);
	expect(yumcssUnpluginCss.vite).type.toBeCallableWith(cssOptions);
	expect(yumcssRollup).type.toBeCallableWith(options);
	expect(yumcssRollupCss).type.toBeCallableWith(cssOptions);
	expect(yumcssWebpack).type.toBeCallableWith(options);
	expect(yumcssWebpackCss).type.toBeCallableWith(cssOptions);
});
