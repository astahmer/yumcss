import { expect, test } from "tstyche";
import { createStylesheet, type PreparedStyle } from "../src/css/create-stylesheet.ts";
import { createCss } from "../src/css/create-css.ts";
import { createDesignCss } from "../src/design/index.ts";
import type { StyleObject } from "../src/types/typings.ts";
import {
	createRuntimeCss,
	createRuntimeDesignCss,
	createRuntimeSheet,
	RuntimeSemanticRuleKindTag,
	type RuntimeDeclaration,
	type RuntimeDocument,
	type RuntimeRule,
	type RuntimeSemanticRule,
	type RuntimeSheet,
	type RuntimeSheetOptions,
	type RuntimeSheetSnapshot,
} from "../src/css/runtime.ts";
import { examplePreset } from "@pandwind/example-preset";

const css = createCss(examplePreset);
const designCss = createDesignCss(examplePreset);
const compiled = css({ color: "$blue-500", padding: 4 });
const vars = css.vars({ color: "var(--runtime-color)" });
const props = css.props(compiled, vars, "external-class", [false, null, undefined]);
type PropsResult = {
	style: Record<string, string> | undefined;
	className: string | undefined;
	[key: string]: unknown;
};

test("CssFn callable and projections preserve their public result shapes", () => {
	expect(css).type.toBeCallableWith({ color: "$blue-500" });
	expect(compiled).type.toBe<Record<string, string>>();
	expect(css.class({ color: "$blue-500" })).type.toBe<string>();
	expect(css.raw({ color: "$blue-500" })).type.toBeAssignableTo<StyleObject>();
	expect(vars).type.toBeAssignableTo<{ class: string; style: Record<string, string> }>();
	expect(props).type.toBe<PropsResult>();
});

test("CssFn props accepts compiled maps, vars carriers, strings, arrays, and falsey values", () => {
	const input = [compiled, vars, "external-class", false, null, undefined] as const;
	expect(css.props(input)).type.toBe<PropsResult>();
});

test("CssFn group preserves static, parameterized, string, and named-input entries", () => {
	const styles = css.group({
		card: { borderRadius: "lg", padding: 4 },
		gap: (value: number) => ({ gap: value }),
		label: "label-class",
		banner: {
			$input: {} as { color: string },
			color: css.input("color"),
		},
	});

	expect(styles.card).type.toBe<Record<string, string>>();
	expect(styles.gap).type.toBeCallableWith(12);
	expect(styles.gap(12)).type.toBeAssignableTo<{
		class: string;
		style: Record<string, string>;
	}>();
	expect(styles.label).type.toBe<string>();
	expect(styles.banner).type.toBeCallableWith({ color: "tomato" });
	// @ts-expect-error Type 'number' is not assignable to type 'string'.
	styles.banner({ color: 12 });
	// @ts-expect-error Argument of type 'string' is not assignable to parameter of type 'number'.
	styles.gap("12");
});

test("design CssFn keeps the same projections with design-vocabulary inputs", () => {
	const compiledDesign = designCss({ $frame: { fill: "$blue-500", pad: 4 } });
	const groups = designCss.group({
		card: { $frame: { corners: "lg" } },
		pad: (value: number) => ({ $frame: { pad: value } }),
	});

	expect(compiledDesign).type.toBe<Record<string, string>>();
	expect(designCss.class({ $frame: { fill: "$blue-500" } })).type.toBe<string>();
	expect(designCss.raw({ $frame: { fill: "$blue-500" } })).type.toBeAssignableTo<StyleObject>();
	expect(designCss.vars({ $frame: { fill: "var(--runtime-fill)" } })).type.toBeAssignableTo<{
		class: string;
		style: Record<string, string>;
	}>();
	expect(designCss.props(compiledDesign)).type.toBe<PropsResult>();
	expect(groups.card).type.toBe<Record<string, string>>();
	expect(groups.pad).type.toBeCallableWith(8);
});

test("runtime CSS carries typed authoring plus a live RuntimeSheet", () => {
	const sheet = createRuntimeSheet({ id: "app", autoMount: false });
	const runtimeCss = createRuntimeCss(examplePreset, { sheet, namespace: "app" });
	const runtimeDesignCss = createRuntimeDesignCss(examplePreset, { sheet });

	expect(runtimeCss.sheet).type.toBe<RuntimeSheet>();
	expect(runtimeCss.class({ color: "$blue-500" })).type.toBe<string>();
	expect(runtimeCss({ color: "var(--runtime-color)" })).type.toBe<Record<string, string>>();
	expect(runtimeDesignCss.class({ $frame: { fill: "$blue-500", pad: 4 } })).type.toBe<string>();
	expect(runtimeCss.sheet.css()).type.toBe<string>();
});

test("runtime sheet contracts keep SSR, semantic rules, and DOM ports typed", () => {
	const element = {
		textContent: "",
		setAttribute: () => undefined,
		remove: () => undefined,
	};
	const document: RuntimeDocument = {
		querySelector: () => element,
		createElement: () => element,
		head: { appendChild: () => undefined },
	};
	const options: RuntimeSheetOptions = {
		id: "app",
		autoMount: false,
		document,
		nonce: "nonce",
		cascade: "layers",
	};
	const rule: RuntimeRule = { id: "button", css: ".button{color:red}", priority: 0 };
	const declaration: RuntimeDeclaration = { property: "opacity", value: 0.5 };
	const semanticRule: RuntimeSemanticRule = {
		kind: RuntimeSemanticRuleKindTag.Style,
		selector: ".button",
		declarations: [declaration],
	};
	const sheet = createRuntimeSheet(options);

	sheet.register([rule]);
	sheet.registerSemanticRules([semanticRule]);
	const snapshot: RuntimeSheetSnapshot = sheet.snapshot();
	sheet.hydrate(snapshot);

	expect(sheet.css()).type.toBe<string>();
	expect(sheet.mount()).type.toBe<boolean>();
	expect(sheet.unmount()).type.toBe<void>();
	expect(snapshot.rules).type.toBe<RuntimeRule[]>();
});

test("stylesheet compiler keeps prepared styles, generators, and policies typed", () => {
	const stylesheet = createStylesheet(examplePreset, { namespace: "app" }, { tokens: "used" });
	const prepared: PreparedStyle = { key: "color", value: "$blue-500", className: "app-color" };
	const rules = stylesheet.process([{ color: "$blue-500" }]);
	const preparedRules = stylesheet.processPrepared([prepared]);
	const variableRule = stylesheet.processVarKey("color");

	expect(rules).type.toBeAssignableTo<Map<string, { id: string; css: string; priority: number }>>();
	expect(preparedRules).type.toBeAssignableTo<
		Map<string, { id: string; css: string; priority: number }>
	>();
	expect(variableRule).type.toBeAssignableTo<
		{ id: string; css: string; priority: number } | undefined
	>();
	expect(stylesheet.gen.tokens()).type.toBe<string>();
	expect(stylesheet.gen.atomic()).type.toBe<string>();
	expect(stylesheet.gen.atomicEntries()).type.toBe<
		Array<{ id: string; css: string; priority: number }>
	>();
	expect(stylesheet.gen.varRules()).type.toBe<string>();
	expect(stylesheet.gen.varEntries()).type.toBe<
		Array<{ id: string; css: string; priority: number }>
	>();
	expect(stylesheet.generate([{ color: "$blue-500" }])).type.toBe<string>();
});
