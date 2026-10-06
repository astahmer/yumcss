/**
 * Public runtime API throughput evidence. These measurements cover the
 * authoring lanes and the supporting runtime/build contracts separately from
 * the small hot-path regression harness in runtime-benchmark.test.ts.
 */
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import { updatingSnapshots } from "./snapshot-state.ts";
import { createCx } from "../src/cx/index.ts";
import { createStylesheet } from "../src/css/create-stylesheet.ts";
import { createCss, createGeneratedCss } from "../src/css/create-css.ts";
import { createUnsafeCss } from "../src/unsafe/css.ts";
import { createNamedAtomsStrategy } from "../src/css/named-atoms-strategy.ts";
import { createPandaAdapter } from "../src/css/panda-adapter.ts";
import {
	createRuntimeCss,
	createRuntimeDesignCss,
	createRuntimeSheet,
} from "../src/css/runtime.ts";
import { createStyleXAdapter } from "../src/css/stylex-adapter.ts";
import { createUnoCssAdapter } from "../src/css/unocss-adapter.ts";
import { firstThatWorks } from "../src/css/first-that-works.ts";
import { createDesignCss } from "../src/design/index.ts";
import {
	createDesignObjectCss,
	createObjectBackend,
	createObjectCss,
	createObjectCx,
} from "../src/backends/object.ts";
import { createCssBackend } from "../src/backends/css.ts";
import { createOpentuiBackend } from "../src/backends/opentui.ts";
import { createReactStrictDomBackend } from "../src/backends/react-strict-dom.ts";
import { createRnBackend } from "../src/backends/react-native.ts";
import { createStyleBackendRegistry, STYLE_BACKENDS } from "../src/backends/registry.ts";
import { StyleBackendId } from "../src/backends/types.ts";
import {
	createDesignModuleRegistry,
	DesignStyleResolver,
	resolveDesignStyle,
} from "../src/design/resolve.ts";
import { createHostStyleRegistry } from "../src/host/index.ts";
import {
	createDesignCss as createOpenTuiDesignCss,
	createCx as createOpenTuiCx,
} from "../src/opentui.ts";
import {
	createDesignCss as createReactNativeDesignCss,
	createCx as createReactNativeCx,
} from "../src/rn.ts";
import {
	ReactStrictDomPlatform,
	createCss as createReactStrictDomCss,
	createDesignCss as createReactStrictDomDesignCss,
	createCx as createReactStrictDomCx,
} from "../src/react-strict-dom.ts";
import { stackClasses, stackStyle, createStackClassName } from "../src/stack/index.ts";
import { createYumCSSLibArtifact, createYumCSSLibCompatibility } from "../src/vite/lib-artifact.ts";
import { createSourceScannerRegistry, SOURCE_SCANNER_SERVICE } from "../src/source-scanner.ts";
import { createSourceWorkspace } from "../src/source-workspace.ts";
import { createCssExtractionService } from "../src/vite/css-extract.ts";
import { createInlineTwPluginCore, yumcssVite } from "../src/vite/index.ts";
import { createTwAdapter } from "../src/tw/adapter.ts";
import { createTw, tw } from "../src/tw/index.ts";
import { defaultPreset } from "../src/preset/default.ts";
import { examplePreset } from "@yumcss/example-preset";
import { define } from "../src/types/define-preset.export.ts";

const SNAPSHOT = resolve(import.meta.dirname, "snapshots", "runtime-api-benchmark.json.snap");
const SAMPLES = 5;
const WARMUP_ITERATIONS = 500;
const MIN_RUNTIME_THROUGHPUT_RATIO = 0.25;

type RuntimeCategory =
	| "css"
	| "design"
	| "composition"
	| "tailwind"
	| "layout"
	| "platform"
	| "adapter"
	| "backend"
	| "host"
	| "preset"
	| "build";

interface RuntimeScenarioDefinition {
	name: string;
	category: RuntimeCategory;
	description: string;
	iterations: number;
	run: () => void;
}

interface RuntimeScenarioRecord {
	name: string;
	category: RuntimeCategory;
	description: string;
	iterations: number;
	median: number;
	p10: number;
	p90: number;
}

interface RuntimeSnapshot {
	schema: "yumcss.runtime-api/1";
	source: "tests/runtime-api-benchmark.test.ts";
	updatedAt: string;
	samples: number;
	environment: {
		platform: NodeJS.Platform;
		arch: string;
		node: string;
	};
	scenarios: RuntimeScenarioRecord[];
}

const measure = (definition: RuntimeScenarioDefinition): RuntimeScenarioRecord => {
	for (let index = 0; index < WARMUP_ITERATIONS; index += 1) definition.run();
	const samples: number[] = [];
	for (let sample = 0; sample < SAMPLES; sample += 1) {
		const start = performance.now();
		for (let index = 0; index < definition.iterations; index += 1) definition.run();
		samples.push((definition.iterations / (performance.now() - start)) * 1_000);
	}
	samples.sort((left, right) => left - right);
	return {
		name: definition.name,
		category: definition.category,
		description: definition.description,
		iterations: definition.iterations,
		median: Math.round(samples[Math.floor(samples.length / 2)]!),
		p10: Math.round(samples[0]!),
		p90: Math.round(samples[samples.length - 1]!),
	};
};

const cssDefault = createCss(defaultPreset);
const cssPreset = createCss(examplePreset);
const cssGenerated = createGeneratedCss(examplePreset);
const cssUnsafe = createUnsafeCss({ conditions: { _hover: "&:hover" } });
const dss = createDesignCss(examplePreset);
const cssRuntimeSheet = createRuntimeSheet({ id: "runtime-api-css", autoMount: false });
const cssRuntime = createRuntimeCss(examplePreset, { sheet: cssRuntimeSheet });
const dssRuntimeSheet = createRuntimeSheet({ id: "runtime-api-dss", autoMount: false });
const dssRuntime = createRuntimeDesignCss(examplePreset, { sheet: dssRuntimeSheet });
const cx = createCx();
const cssCx = createCx({ css: cssDefault });
const twConfigured = createTw({
	variants: { sm: { join: ":" }, group: { join: "-" } },
	conflicts: {
		bg: { "*": ["background-color"] },
		p: { "*": ["padding"] },
		text: { "*": ["color"] },
	},
});
const unsafeGroup = cssUnsafe.group({ gap: (value: number) => ({ gap: value }) });
const unsafeInputGroup = cssUnsafe.group({
	banner: {
		$input: {} as { readonly color: string },
		color: cssUnsafe.input("color"),
	},
});

const styles = {
	display: "flex",
	alignItems: "center",
	gap: 4,
	padding: 8,
	$raw: {
		color: "blue.500",
		backgroundColor: "gray.50",
		_hover: { color: "blue.600" },
	},
	_hover: { padding: 12 },
} satisfies Parameters<typeof cssDefault>[0];
const presetStyles = {
	display: "flex",
	padding: 4,
	color: "$blue-500",
} satisfies Parameters<typeof cssPreset.class>[0];
const defaultStyles = {
	display: "grid",
	gap: 4,
	padding: 6,
	$raw: { color: "blue.600", backgroundColor: "gray.50" },
} satisfies Parameters<typeof cssDefault.class>[0];
const fallbackStyles = {
	padding: firstThatWorks("1rem", "0.5rem", 4),
} satisfies Parameters<typeof cssDefault.class>[0];
const generatedStyles = {
	display: "flex",
	padding: 8,
	color: "$blue-500",
	backgroundColor: "colorPalette.solid",
	colorPalette: "brand",
	_hover: { color: "$white" },
} satisfies Parameters<typeof cssGenerated.class>[0];
const unsafeStyles = {
	display: "flex",
	padding: 8,
	color: "tomato",
	_hover: { color: "blue" },
} satisfies Parameters<typeof cssUnsafe.class>[0];
const designStyles = {
	$frame: { fill: "$blue-500", corners: "md", pad: [4, 8] },
	$layout: { flow: "stackY", gap: 4, align: "center" },
	$text: { size: "lg", weight: "bold", color: "$gray-900" },
} satisfies Parameters<typeof dss.class>[0];
const runtimeStyles = {
	color: "$blue-500",
	padding: 12,
	_hover: { color: "$red-500", margin: 8 },
} satisfies Parameters<typeof cssRuntime.class>[0];
const twStyles = {
	display: "flex",
	bg: "blue-600",
	text: "white",
	p: "4",
	sm: { p: "6" },
	group: { hover: { opacity: "50" } },
};
const stackProps = { direction: "row" as const, gap: 4, align: "center" as const };
const mergedMap = cssDefault(styles);
const variableMap = cssDefault.vars({ color: "var(--runtime-color)", padding: 12 });
const atomClass = cssDefault.class(styles);
const unsafeMap = cssUnsafe(unsafeStyles);
const generatedMap = cssGenerated(generatedStyles);
const generatedVariables = cssGenerated.vars({ color: "var(--generated-color)", padding: 12 });
const dssMap = dss(designStyles);
const dssVariables = dss.vars({ $raw: { color: "var(--design-color)" } });
const runtimeMap = cssRuntime(runtimeStyles);
const dssRuntimeMap = dssRuntime(designStyles);
const dssGroup = dss.group({ card: designStyles });
const runtimeRule = { id: "runtime-api-rule", css: ".runtime-api-rule{color:red}", priority: 0 };
const cssBackend = createCssBackend();
const objectBackend = createObjectBackend({ name: "runtime-api" });
const objectCss = createObjectCss(objectBackend);
const objectDesignCss = createDesignObjectCss(examplePreset, objectBackend);
const rnBackend = createRnBackend({ name: "runtime-api-rn" });
const opentuiBackend = createOpentuiBackend({ name: "runtime-api-opentui", cellSize: 4 });
const rsdBackend = createReactStrictDomBackend();
const objectStyle = objectBackend.resolve({ color: "red", padding: 4 });
const objectCx = createObjectCx(objectBackend);
const designModuleRegistry = createDesignModuleRegistry();
const designResolver = new DesignStyleResolver(designModuleRegistry);
const nativeDss = createReactNativeDesignCss(examplePreset);
const nativeCx = createReactNativeCx();
const openTuiDss = createOpenTuiDesignCss(examplePreset);
const openTuiCx = createOpenTuiCx();
const platformDesignStyles = {
	$frame: { fill: "$blue-500", corners: "md", pad: [4, 8] },
	$layout: { flow: "stackY", gap: 4, align: "center" },
} satisfies Parameters<typeof nativeDss>[0];
const rsdCss = createReactStrictDomCss();
const rsdNativeCss = createReactStrictDomCss({ platform: ReactStrictDomPlatform.Native });
const rsdDss = createReactStrictDomDesignCss(examplePreset);
const rsdCx = createReactStrictDomCx();
const rsdNativeCx = createReactStrictDomCx({ platform: ReactStrictDomPlatform.Native });
const stackCss = createStackClassName(cssDefault);
const namedCss = createCss(examplePreset, { className: createNamedAtomsStrategy("bench") });
const adapterStyles = {
	display: "flex",
	padding: 4,
	color: "$blue-500",
} satisfies Parameters<typeof namedCss.class>[0];
const stylexCss = createCss(examplePreset, { className: createStyleXAdapter() });
const pandaCss = createCss(examplePreset, {
	className: createPandaAdapter({ conditions: examplePreset.conditions }),
});
const unoCss = createCss(examplePreset, {
	className: createUnoCssAdapter({ preset: examplePreset }),
});
const twAdapter = createTwAdapter({
	variants: { hover: {} },
	bridge: { color: { "#2563eb": "text-blue-600" } },
	preset: examplePreset,
});
const stylesheet = createStylesheet(examplePreset);
const hostRegistry = createHostStyleRegistry();
const compatibility = createYumCSSLibCompatibility(examplePreset);
const sourceDocument = {
	file: "runtime-api.ts",
	source: 'export const style = { color: "red" };',
	language: "typescript" as const,
};
const sourceRegistry = createSourceScannerRegistry();
const cssExtraction = createCssExtractionService({ matchers: ["css"], preset: examplePreset });
const artifact = createYumCSSLibArtifact({
	compatibility,
	sources: [{ path: "runtime-api.ts", hash: "runtime-api" }],
	tokens: [],
	web: "",
	atomic: [],
	vars: [],
});
const definedConditions = define.conditions({ base: "", _hover: "&:hover" });
const definedProperties = define.properties({ color: { $tokens: "colors" }, display: true });

const SCENARIOS: readonly RuntimeScenarioDefinition[] = [
	{
		name: "css.default.class",
		category: "css",
		description: "preset-bound default CSS class projection",
		iterations: 30_000,
		run: () => void cssDefault.class(defaultStyles),
	},
	{
		name: "css.default.compose",
		category: "css",
		description: "preset-bound declaration-map composition",
		iterations: 30_000,
		run: () => void cssDefault(styles, defaultStyles),
	},
	{
		name: "css.preset.class",
		category: "css",
		description: "custom preset-bound CSS class projection",
		iterations: 30_000,
		run: () => void cssPreset.class(presetStyles),
	},
	{
		name: "css.default.vars",
		category: "css",
		description: "preset-bound CSS variable carrier",
		iterations: 50_000,
		run: () => void cssDefault.vars({ color: "var(--default-color)", padding: 12 }),
	},
	{
		name: "css.default.props",
		category: "css",
		description: "preset-bound CSS host-props projection",
		iterations: 30_000,
		run: () => void cssDefault.props(mergedMap, variableMap),
	},
	{
		name: "css.default.raw",
		category: "css",
		description: "preset-bound CSS raw merge projection",
		iterations: 50_000,
		run: () => void cssDefault.raw(defaultStyles, { padding: 8 }),
	},
	{
		name: "css.first-that-works",
		category: "css",
		description: "CSS fallback-chain class projection",
		iterations: 30_000,
		run: () => void cssDefault.class(fallbackStyles),
	},
	{
		name: "css.generated.class",
		category: "css",
		description: "generated CSS facade class projection",
		iterations: 30_000,
		run: () => void cssGenerated.class(generatedStyles),
	},
	{
		name: "css.generated.vars",
		category: "css",
		description: "generated CSS variable carrier",
		iterations: 50_000,
		run: () => void cssGenerated.vars({ color: "var(--generated-color)", padding: 12 }),
	},
	{
		name: "css.generated.props",
		category: "css",
		description: "generated CSS host-props projection",
		iterations: 30_000,
		run: () => void cssGenerated.props(generatedMap, generatedVariables),
	},
	{
		name: "css.generated.raw",
		category: "css",
		description: "generated CSS raw merge projection",
		iterations: 50_000,
		run: () => void cssGenerated.raw(generatedStyles),
	},
	{
		name: "css.unsafe.class",
		category: "css",
		description: "open CSS class projection",
		iterations: 30_000,
		run: () => void cssUnsafe.class(unsafeStyles),
	},
	{
		name: "css.unsafe.vars",
		category: "css",
		description: "open CSS variable carrier",
		iterations: 50_000,
		run: () => void cssUnsafe.vars({ color: "tomato", padding: "var(--padding)" }),
	},
	{
		name: "css.unsafe.props",
		category: "css",
		description: "open CSS host-props projection",
		iterations: 30_000,
		run: () => void cssUnsafe.props(unsafeMap),
	},
	{
		name: "css.unsafe.raw",
		category: "css",
		description: "open CSS raw merge projection",
		iterations: 50_000,
		run: () => void cssUnsafe.raw(unsafeStyles, { padding: 12 }),
	},
	{
		name: "css.unsafe.group",
		category: "css",
		description: "open CSS parameterized group member",
		iterations: 30_000,
		run: () => void unsafeGroup.gap(12),
	},
	{
		name: "css.unsafe.input",
		category: "css",
		description: "open CSS named runtime input group",
		iterations: 30_000,
		run: () => void unsafeInputGroup.banner({ color: "tomato" }),
	},
	{
		name: "css.runtime.class",
		category: "css",
		description: "runtime CSS class registration and sheet flush",
		iterations: 20_000,
		run: () => void cssRuntime.class(runtimeStyles),
	},
	{
		name: "css.runtime.vars",
		category: "css",
		description: "runtime CSS variable carrier registration",
		iterations: 30_000,
		run: () => void cssRuntime.vars({ color: "tomato", padding: 12 }),
	},
	{
		name: "css.runtime.props",
		category: "css",
		description: "runtime CSS host-props projection",
		iterations: 30_000,
		run: () => void cssRuntime.props(runtimeMap),
	},
	{
		name: "css.runtime.raw",
		category: "css",
		description: "runtime CSS raw merge projection",
		iterations: 50_000,
		run: () => void cssRuntime.raw(runtimeStyles),
	},
	{
		name: "css.runtime.sheet",
		category: "css",
		description: "runtime CSS sheet registration",
		iterations: 1_000_000,
		run: () => void cssRuntimeSheet.register([runtimeRule]),
	},
	{
		name: "dss.class",
		category: "design",
		description: "design vocabulary class projection",
		iterations: 20_000,
		run: () => void dss.class(designStyles),
	},
	{
		name: "dss.compose",
		category: "design",
		description: "design vocabulary declaration-map composition",
		iterations: 20_000,
		run: () => void dss(designStyles, { $frame: { pad: 4 } }),
	},
	{
		name: "dss.vars",
		category: "design",
		description: "design vocabulary variable carrier",
		iterations: 30_000,
		run: () => void dss.vars({ $raw: { color: "var(--design-color)" } }),
	},
	{
		name: "dss.props",
		category: "design",
		description: "design vocabulary host-props projection",
		iterations: 30_000,
		run: () => void dss.props(dssMap, dssVariables),
	},
	{
		name: "dss.raw",
		category: "design",
		description: "design vocabulary raw merge projection",
		iterations: 30_000,
		run: () => void dss.raw(designStyles),
	},
	{
		name: "dss.runtime.class",
		category: "design",
		description: "runtime design vocabulary class registration",
		iterations: 20_000,
		run: () => void dssRuntime.class(designStyles),
	},
	{
		name: "dss.runtime.props",
		category: "design",
		description: "runtime design host-props projection",
		iterations: 30_000,
		run: () => void dssRuntime.props(dssRuntimeMap),
	},
	{
		name: "dss.runtime.raw",
		category: "design",
		description: "runtime design raw merge projection",
		iterations: 30_000,
		run: () => void dssRuntime.raw(designStyles),
	},
	{
		name: "dss.runtime.sheet",
		category: "design",
		description: "runtime design sheet serialization",
		iterations: 2_000_000,
		run: () => void dssRuntimeSheet.css(),
	},
	{
		name: "dss.group",
		category: "design",
		description: "design vocabulary reusable group member",
		iterations: 30_000,
		run: () => void dssGroup.card,
	},
	{
		name: "design.resolve",
		category: "design",
		description: "direct design vocabulary resolution",
		iterations: 30_000,
		run: () => void resolveDesignStyle(designStyles, examplePreset.tokens),
	},
	{
		name: "design.resolver",
		category: "design",
		description: "registry-backed reusable design resolver",
		iterations: 30_000,
		run: () => void designResolver.resolve(designStyles, examplePreset.tokens),
	},
	{
		name: "design.registry",
		category: "design",
		description: "design module registry construction",
		iterations: 30_000,
		run: () => void createDesignModuleRegistry(),
	},
	{
		name: "cx.plain",
		category: "composition",
		description: "plain class-string composition",
		iterations: 500_000,
		run: () => void cx("flex items-center gap-2", "grid gap-4"),
	},
	{
		name: "cx.atoms",
		category: "composition",
		description: "configured CSS atom conflict composition",
		iterations: 30_000,
		run: () => void cssCx(mergedMap, cssDefault({ $raw: { color: "blue.600" } })),
	},
	{
		name: "cx.vars",
		category: "composition",
		description: "class composition with variable carriers",
		iterations: 30_000,
		run: () => void cssCx.vars(variableMap, atomClass),
	},
	{
		name: "tw.configured",
		category: "tailwind",
		description: "metadata-aware configured tw compiler",
		iterations: 50_000,
		run: () => void twConfigured(twStyles),
	},
	{
		name: "tw.root",
		category: "tailwind",
		description: "root open tw compiler",
		iterations: 100_000,
		run: () => void tw(twStyles),
	},
	{
		name: "stack.classes",
		category: "layout",
		description: "renderer-agnostic Stack class mapping",
		iterations: 200_000,
		run: () => void stackClasses(stackProps),
	},
	{
		name: "stack.style",
		category: "layout",
		description: "renderer-agnostic Stack style mapping",
		iterations: 2_000_000,
		run: () => void stackStyle(stackProps),
	},
	{
		name: "stack.css",
		category: "layout",
		description: "Stack bound to the CSS class compiler",
		iterations: 30_000,
		run: () => void stackCss(stackProps),
	},
	{
		name: "react-native.dss",
		category: "platform",
		description: "React Native design style object",
		iterations: 30_000,
		run: () => void nativeDss(platformDesignStyles),
	},
	{
		name: "react-native.cx",
		category: "platform",
		description: "React Native style-object composition",
		iterations: 100_000,
		run: () => void nativeCx(nativeDss(platformDesignStyles)),
	},
	{
		name: "opentui.dss",
		category: "platform",
		description: "OpenTUI design style object",
		iterations: 30_000,
		run: () => void openTuiDss(platformDesignStyles),
	},
	{
		name: "opentui.cx",
		category: "platform",
		description: "OpenTUI style-object composition",
		iterations: 100_000,
		run: () => void openTuiCx(openTuiDss(platformDesignStyles)),
	},
	{
		name: "react-strict-dom.css",
		category: "platform",
		description: "React Strict DOM web CSS carrier",
		iterations: 30_000,
		run: () => void rsdCss({ color: "red", padding: "1rem" }),
	},
	{
		name: "react-strict-dom.native",
		category: "platform",
		description: "React Strict DOM native CSS carrier",
		iterations: 30_000,
		run: () => void rsdNativeCss({ color: "red", padding: 4 }),
	},
	{
		name: "react-strict-dom.dss",
		category: "platform",
		description: "React Strict DOM design carrier",
		iterations: 30_000,
		run: () => void rsdDss(designStyles),
	},
	{
		name: "react-strict-dom.cx",
		category: "platform",
		description: "React Strict DOM web composition",
		iterations: 100_000,
		run: () => void rsdCx(rsdCss({ color: "red" })),
	},
	{
		name: "react-strict-dom.native-cx",
		category: "platform",
		description: "React Strict DOM native composition",
		iterations: 100_000,
		run: () => void rsdNativeCx(rsdNativeCss({ color: "red" })),
	},
	{
		name: "react-strict-dom.create",
		category: "platform",
		description: "React Strict DOM named style definitions",
		iterations: 30_000,
		run: () =>
			void rsdCss.create({
				card: { color: "red", padding: "1rem" },
				label: (color: string) => ({ color }),
			}),
	},
	{
		name: "adapter.named-atoms",
		category: "adapter",
		description: "sheet-backed named atom strategy",
		iterations: 30_000,
		run: () => void namedCss.class(adapterStyles),
	},
	{
		name: "adapter.stylex",
		category: "adapter",
		description: "StyleX-shaped class strategy",
		iterations: 30_000,
		run: () => void stylexCss.class(adapterStyles),
	},
	{
		name: "adapter.panda",
		category: "adapter",
		description: "Panda-shaped class strategy",
		iterations: 30_000,
		run: () => void pandaCss.class(adapterStyles),
	},
	{
		name: "adapter.unocss",
		category: "adapter",
		description: "UnoCSS candidate strategy",
		iterations: 30_000,
		run: () => void unoCss.class(adapterStyles),
	},
	{
		name: "adapter.tailwind",
		category: "adapter",
		description: "Tailwind utility class strategy",
		iterations: 100_000,
		run: () => void twAdapter.toClassName("color", "#2563eb"),
	},
	{
		name: "backend.css",
		category: "backend",
		description: "CSS backend declaration lowering",
		iterations: 100_000,
		run: () => void cssBackend.declare("color", "red"),
	},
	{
		name: "backend.object",
		category: "backend",
		description: "object backend style resolution",
		iterations: 100_000,
		run: () => void objectBackend.resolve({ color: "red", padding: 4 }),
	},
	{
		name: "backend.object-css",
		category: "backend",
		description: "object backend CSS projection",
		iterations: 100_000,
		run: () => void objectCss({ color: "red", padding: 4 }),
	},
	{
		name: "backend.object-design-css",
		category: "backend",
		description: "object backend design projection",
		iterations: 50_000,
		run: () => void objectDesignCss(designStyles),
	},
	{
		name: "backend.rn",
		category: "backend",
		description: "React Native backend declaration lowering",
		iterations: 100_000,
		run: () => void rnBackend.declare("padding", "4px"),
	},
	{
		name: "backend.opentui",
		category: "backend",
		description: "OpenTUI backend declaration lowering",
		iterations: 100_000,
		run: () => void opentuiBackend.declare("padding", "8px"),
	},
	{
		name: "backend.react-strict-dom",
		category: "backend",
		description: "React Strict DOM backend declaration lowering",
		iterations: 100_000,
		run: () => void rsdBackend.declare("color", "red"),
	},
	{
		name: "backend.registry.create",
		category: "backend",
		description: "empty backend registry construction",
		iterations: 50_000,
		run: () => void createStyleBackendRegistry(),
	},
	{
		name: "backend.object-cx",
		category: "backend",
		description: "object backend style merge",
		iterations: 100_000,
		run: () => void objectCx(objectStyle, { color: "blue" }),
	},
	{
		name: "backend.registry",
		category: "backend",
		description: "built-in backend registry lookup",
		iterations: 500_000,
		run: () => void STYLE_BACKENDS.get(StyleBackendId.Css),
	},
	{
		name: "host.registry",
		category: "host",
		description: "host adapter lookup and class prop projection",
		iterations: 2_000_000,
		run: () => void hostRegistry.get("react")?.classProps("button"),
	},
	{
		name: "build.stylesheet",
		category: "build",
		description: "pure stylesheet generation",
		iterations: 2_000,
		run: () => void stylesheet.generate([styles]),
	},
	{
		name: "build.lib-artifact",
		category: "build",
		description: "design-system artifact construction",
		iterations: 20_000,
		run: () =>
			void createYumCSSLibArtifact({
				compatibility,
				sources: artifact.sources,
				tokens: artifact.tokens,
				web: artifact.web,
				atomic: artifact.rules.atomic,
				vars: artifact.rules.vars,
			}),
	},
	{
		name: "build.source.scan",
		category: "build",
		description: "source scanner language and AST boundary",
		iterations: 10_000,
		run: () => void SOURCE_SCANNER_SERVICE.scan(sourceDocument),
	},
	{
		name: "build.source.registry",
		category: "build",
		description: "source scanner registry lookup",
		iterations: 200_000,
		run: () => void sourceRegistry.isScriptFile("runtime-api.ts"),
	},
	{
		name: "build.source.workspace",
		category: "build",
		description: "source workspace construction boundary",
		iterations: 20_000,
		run: () => void createSourceWorkspace(),
	},
	{
		name: "build.css-extraction",
		category: "build",
		description: "CSS extraction inspection",
		iterations: 10_000,
		run: () => void cssExtraction.inspect("const value = 1", "runtime-api.ts"),
	},
	{
		name: "build.vite-core",
		category: "build",
		description: "Vite transform core construction",
		iterations: 500,
		run: () => void createInlineTwPluginCore(),
	},
	{
		name: "build.vite-plugin",
		category: "build",
		description: "Vite plugin composition root construction",
		iterations: 500,
		run: () => void yumcssVite(),
	},
	{
		name: "preset.define",
		category: "preset",
		description: "unified preset builder calls",
		iterations: 100_000,
		run: () => {
			const tokens = define.tokens({ colors: { "$red-500": "#ef4444" } });
			void define.preset(
				{ config: {}, tokens },
				{ strict: true, conditions: definedConditions, properties: definedProperties },
			);
		},
	},
];

const buildSnapshot = (scenarios: readonly RuntimeScenarioRecord[]): RuntimeSnapshot => ({
	schema: "yumcss.runtime-api/1",
	source: "tests/runtime-api-benchmark.test.ts",
	updatedAt: new Date().toISOString().slice(0, 10),
	samples: SAMPLES,
	environment: { platform: process.platform, arch: process.arch, node: process.version },
	scenarios: [...scenarios],
});

test("public runtime API throughput stays within the recorded evidence band", async () => {
	const measured = SCENARIOS.map(measure);
	const snapshot = buildSnapshot(measured);
	const positive = measured.every(
		(scenario) => scenario.median > 0 && scenario.p10 > 0 && scenario.p90 >= scenario.p10,
	);
	expect(positive).toBe(true);

	if (updatingSnapshots()) {
		await expect(JSON.stringify(snapshot, null, "\t")).toMatchFileSnapshot(SNAPSHOT);
		return;
	}

	const baseline = JSON.parse(readFileSync(SNAPSHOT, "utf8")) as RuntimeSnapshot;
	const baselineByName = new Map(baseline.scenarios.map((scenario) => [scenario.name, scenario]));
	const measuredNames = new Set(measured.map((scenario) => scenario.name));
	const missing = measured.filter((scenario) => !baselineByName.has(scenario.name));
	const removed = baseline.scenarios.filter((scenario) => !measuredNames.has(scenario.name));
	expect(missing, "runtime API benchmark scenarios added; refresh with -u").toHaveLength(0);
	expect(removed, "runtime API benchmark scenarios removed; refresh with -u").toHaveLength(0);
	for (const scenario of measured) {
		const reference = baselineByName.get(scenario.name)!;
		expect(
			scenario.median,
			`${scenario.name} regressed from ${reference.median} to ${scenario.median} ops/sec`,
		).toBeGreaterThan(reference.median * MIN_RUNTIME_THROUGHPUT_RATIO);
	}
}, 120_000);
