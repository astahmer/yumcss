import { expect, test } from "tstyche";
import { createCss } from "pandwind/css";
import { createUnsafeCss } from "pandwind/unsafe/css";
import { createNamedAtomsStrategy } from "pandwind/css/named";
import { createPandaAdapter } from "pandwind/css/panda";
import { createStyleXAdapter } from "pandwind/css/stylex";
import { createUnoCssAdapter } from "pandwind/css/unocss";
import type { ClassNameStrategy } from "pandwind/css";
import { createCx, type CxOptions } from "pandwind/cx";
import {
	createHostStyleRegistry,
	type HostStyleAdapter,
	type HostStylePlugin,
} from "pandwind/host";
import {
	createCssBackend,
	createObjectBackend,
	createObjectCss,
	createObjectCx,
	createOpentuiBackend,
	createReactStrictDomBackend,
	createRnBackend,
	createStyleBackendRegistry,
	ReactStrictDomPlatform,
	STYLE_BACKEND_SCHEMA,
	StyleBackendId,
	type BackendCapabilityContract,
	type StyleBackend,
	type StyleBackendFactory,
	type StyleBackendRegistry,
} from "pandwind/backends";
import { createDesignCss as createOpenTuiDesignCss } from "pandwind/opentui";
import {
	createCx as createRsdCx,
	createDesignCss as createRsdDesignCss,
} from "pandwind/react-strict-dom";
import { createDesignCss as createRnDesignCss } from "pandwind/react-native";
import { createStackClassName, stackClasses, stackStyle, type StackStyle } from "pandwind/stack";
import { createTw, createTwAdapter, tw, type TwOptions } from "pandwind/tw";
import {
	compileStyles,
	type TwConflictsMeta,
	type TwNestedStyles,
	type TwValueTokensMeta,
	type TwVariantsMeta,
} from "pandwind/tw/compile";
import { resolveVar, simplifyCalc, themeVariables } from "pandwind/tw";
import { define } from "pandwind/preset";
import type { StyleObject } from "pandwind/types/typings";
import type { Root } from "postcss";
import { examplePreset } from "@pandwind/example-preset";

declare const postcssRoot: Root;

test("preset builders preserve typed theme, condition, property, and token metadata", () => {
	const tokens = define.tokens({
		colors: { brand: "#2563eb", muted: "#64748b" },
		spacing: { sm: "0.5rem", md: "1rem" },
	});
	const conditions = define.conditions({ base: "", _dark: ".dark &" });
	const properties = define.properties({
		color: { $tokens: "colors" },
		padding: { $tokens: "spacing" },
	});
	const theme = define.theme({ config: {}, tokens });
	const preset = define.preset(theme, { strict: true, conditions, properties });
	const semanticTokens = tokens.defineSemanticTokens(conditions, {
		semantic: {
			surface: { base: "colors.brand", _dark: "colors.muted" },
		},
	});
	const colorPalettes = semanticTokens.defineColorPalettes({
		brand: { solid: "colors.brand", contrast: "colors.muted" },
	});

	expect(theme).type.toHaveProperty("config");
	expect(conditions).type.toBe<{ base: string; _dark: string }>();
	expect(properties).type.toHaveProperty("padding");
	expect(preset).type.toHaveProperty("tokens");
	expect(semanticTokens).type.toHaveProperty("semantic");
	expect(colorPalettes).type.toHaveProperty("brand");
});

test("class-name adapters implement the shared strategy contract", () => {
	const conditions = { _hover: "&:hover", _dark: ".dark &" };
	const strategies: ClassNameStrategy[] = [
		createNamedAtomsStrategy("app"),
		createStyleXAdapter({
			classNamePrefix: "x",
			debug: true,
			enableDebugClassNames: true,
			conditions,
		}),
		createPandaAdapter({
			propClasses: { backgroundColor: "bg" },
			prefix: "app",
			conditions,
		}),
		createUnoCssAdapter({ conditions, preset: examplePreset }),
		createTwAdapter({
			variants: { hover: {} },
			bridge: { color: { red: "text-red-500" } },
			preset: examplePreset,
		}),
	];
	const css = createCss(examplePreset, { className: strategies[0] });

	expect(strategies).type.toBe<ClassNameStrategy[]>();
	expect(strategies[0]!.name).type.toBe<string>();
	expect(strategies[0]!.toClassName("color", "red")).type.toBe<string | null>();
	expect(css.class({ color: "$red-500" })).type.toBe<string>();
});

test("host registry accepts custom framework adapters and plugin composition", () => {
	const adapter: HostStyleAdapter = {
		id: "custom",
		classProp: "class",
		styleProp: "style",
		supportsStyleObject: true,
		packageHints: ["custom-ui"],
		classProps: (className, existing) => ({
			class: [existing, className].filter(Boolean).join(" "),
		}),
		styleProps: (style) => ({ style }),
	};
	const plugin: HostStylePlugin = {
		schema: "pandwind.host-style-plugin/1",
		id: "custom",
		adapter,
	};
	const registry = createHostStyleRegistry([plugin]);

	expect(registry).type.toBeAssignableTo<{
		plugins: readonly HostStylePlugin[];
		adapters: readonly HostStyleAdapter[];
	}>();
	expect(registry.register(plugin)).type.toBe<typeof registry>();
	expect(registry.get("custom")).type.toBe<HostStyleAdapter | undefined>();
	expect(adapter.classProps("next", "previous")).type.toBe<Readonly<Record<string, string>>>();
	expect(adapter.styleProps({ color: "red" })).type.toBe<
		Readonly<Record<string, Readonly<Record<string, unknown>>>>
	>();
});

test("backend factories preserve target artifacts and registry contracts", () => {
	const cssBackend = createCssBackend({ cascade: "layers", namespace: "app" });
	const objectBackend = createObjectBackend({ name: "object" });
	const rnBackend = createRnBackend({ name: "rn", conditions: { dark: () => true } });
	const opentuiBackend = createOpentuiBackend({ name: "opentui", cellSize: 8 });
	const rsdBackend = createReactStrictDomBackend({ platform: ReactStrictDomPlatform.Native });
	const capabilities: BackendCapabilityContract = {
		schema: "pandwind.style-backend-capabilities/1",
		artifact: "style-object",
		unsupported: "diagnose",
		features: {
			declarations: "exact",
			conditions: "exact",
			"dynamic-values": "partial",
			"runtime-conditions": "partial",
			"unit-conversion": "exact",
			serialization: "exact",
			"stable-identity": "exact",
			ssr: "partial",
		},
	};
	const customFactory: StyleBackendFactory<{ prefix: string }, { value: string }> = {
		schema: STYLE_BACKEND_SCHEMA,
		id: "custom",
		capabilities,
		create: (options = { prefix: "custom" }): StyleBackend<{ value: string }> => ({
			name: options.prefix,
			capabilities,
			declare: (_key, value) => ({ value }),
		}),
	};
	const registry: StyleBackendRegistry = createStyleBackendRegistry([customFactory]);
	const customBackend = registry.create<{ value: string }>("custom", { prefix: "app" });

	expect(cssBackend.declare("color", "red")).type.toBe<string>();
	expect(objectBackend.declare("padding", "4px")).type.toBe<Record<string, unknown>>();
	expect(rnBackend.declare("padding", "4px")).type.toBe<Record<string, unknown>>();
	expect(opentuiBackend.declare("padding", "8px")).type.toBe<Record<string, unknown>>();
	expect(rsdBackend.declare("color", "red")).type.toBeAssignableTo<Record<string, unknown>>();
	expect(customBackend.declare("color", "red")).type.toBe<{ value: string }>();
	expect(registry.get("custom")).type.toBe<StyleBackendFactory | undefined>();
	expect(StyleBackendId.ReactNative).type.toBe<"react-native">();
});

test("object and platform surfaces retain their output contracts", () => {
	const objectBackend = createObjectBackend({ name: "object" });
	const objectCss = createObjectCss(objectBackend);
	const objectCx = createObjectCx(objectBackend);
	const rnCss = createRnDesignCss(examplePreset, { name: "rn" });
	const opentuiCss = createOpenTuiDesignCss(examplePreset, { cellSize: 8 });
	const rsdWeb = createRsdDesignCss(examplePreset);
	const rsdNative = createRsdDesignCss(examplePreset, { platform: ReactStrictDomPlatform.Native });
	const rsdCx = createRsdCx();

	expect(objectCss({ color: "red" })).type.toBeAssignableTo<Record<string, unknown>>();
	expect(objectCss.raw({ color: "red" })).type.toBeAssignableTo<Record<string, unknown>>();
	expect(objectCx({ color: "red" }, false)).type.toBeAssignableTo<Record<string, unknown>>();
	expect(rnCss({ $frame: { fill: "$red-500" } })).type.toBeAssignableTo<Record<string, unknown>>();
	expect(rnCss.raw({ $frame: { fill: "$red-500" } })).type.toBeAssignableTo<
		Record<string, unknown>
	>();
	expect(opentuiCss({ $frame: { fill: "$red-500" } })).type.toBeAssignableTo<
		Record<string, unknown>
	>();
	expect(opentuiCss.raw({ $frame: { fill: "$red-500" } })).type.toBeAssignableTo<
		Record<string, unknown>
	>();
	expect(rsdWeb({ $frame: { fill: "$red-500" } })).type.toHaveProperty("$$css");
	expect(rsdNative({ $frame: { fill: "$red-500" } })).type.toBeAssignableTo<
		Record<string, unknown>
	>();
	expect(rsdWeb.raw({ $raw: { color: "red" } })).type.toBeAssignableTo<StyleObject>();
	expect(rsdCx(rsdWeb({ $frame: { fill: "$red-500" } }))).type.toHaveProperty("$$css");
});

test("tw factory, compiler metadata, and adapter types stay composable", () => {
	const variants: TwVariantsMeta = { sm: {}, group: { join: "-" } };
	const conflicts: TwConflictsMeta = { bg: { "*": ["background-color"] } };
	const valueTokens: TwValueTokensMeta = { bg: { "#2563eb": "blue-500" } };
	const options: TwOptions = {
		variants,
		conflicts,
		wildcardValues: { bg: ["blue-500"] },
		valueTokens,
		compose: ["scale-x", "scale-y"],
	};
	const typedTw = createTw<{ bg: string; sm?: { bg: string } }>(options);
	const nested: TwNestedStyles = { bg: "blue-500", sm: { bg: "red-500" } };

	expect(typedTw({ bg: "blue-500", sm: { bg: "red-500" } })).type.toBe<string>();
	expect(
		compileStyles(nested, variants, conflicts, options.compose, valueTokens),
	).type.toBe<string>();
	expect(options).type.toBe<TwOptions>();
});

test("root tw, cx vars, theme helpers, and Stack helpers retain their contracts", () => {
	const css = createUnsafeCss();
	const cxOptions: CxOptions = { css, compose: ["scale"] };
	const cx = createCx(cxOptions);
	const vars = css.vars({ color: "tomato" });
	const style = stackStyle({ direction: "column", gap: 4, align: "center" });
	const className = createStackClassName(css)({ direction: "row", padding: 2 });

	expect(tw({ display: "flex", gap: "4" })).type.toBe<string>();
	expect(cx(vars, ["font-medium", false])).type.toBe<string>();
	expect(cx.vars(vars, "font-medium")).type.toBeAssignableTo<{
		class: string;
		style: Record<string, string>;
	}>();
	expect(themeVariables(postcssRoot)).type.toBe<Map<string, string>>();
	expect(resolveVar("var(--spacing)", new Map([["--spacing", "1rem"]]))).type.toBe<string>();
	expect(simplifyCalc("calc(1rem * 2)")).type.toBe<string>();
	expect(style).type.toBe<StackStyle>();
	expect(stackClasses({ direction: "column", gap: 4 })).type.toBe<string>();
	expect(className).type.toBe<string>();
});
