import { describe, expect, test, vi } from "vitest";
import { typeValue } from "./type-fixtures.ts";
import { createCss } from "../src/css/create-css.ts";
import {
	createRuntimeCss,
	createRuntimeDesignCss,
	createRuntimeSheet,
} from "../src/css/runtime.ts";
import { createStylesheet } from "../src/css/create-stylesheet.ts";
import {
	createConditionsBucket,
	genCSSRule,
	parseCondition,
} from "../src/css/stylesheet-lowering.ts";
import { createNamedAtomsStrategy } from "../src/css/named-atoms-strategy.ts";
import { createStyleXAdapter } from "../src/css/stylex-adapter.ts";
import { escapeIdentifier } from "../src/css/hash.ts";
import { firstThatWorks } from "../src/css/first-that-works.ts";
import { defaultPreset } from "../src/preset/default.ts";
import { define } from "../src/types/define-preset.export.ts";
import { examplePreset } from "@yumcss/example-preset";
import type {
	RuntimeDeclaration,
	RuntimeDocument,
	RuntimeRuleCanonicalizer,
	RuntimeRuleSerializer,
	RuntimeRuleStore,
	RuntimeStyleElement,
	RuntimeStyleElementSink,
} from "../src/css/runtime-sheet.ts";

type RuntimeContractSurface = {
	document: RuntimeDocument;
	element: RuntimeStyleElement;
	declaration: RuntimeDeclaration;
	store: RuntimeRuleStore;
	canonicalizer: RuntimeRuleCanonicalizer;
	serializer: RuntimeRuleSerializer;
	sink: RuntimeStyleElementSink;
};

test("shared runtime sheets retain each dynamic carrier namespace", () => {
	const sheet = createRuntimeSheet({ autoMount: false });
	const first = createRuntimeCss(defaultPreset, { sheet, namespace: "first" });
	const second = createRuntimeCss(defaultPreset, { sheet, namespace: "second" });
	const firstCarrier = first.vars({ color: "red" });
	const secondCarrier = second.vars({ color: "blue" });
	expect(firstCarrier.class).toBe("first-color");
	expect(secondCarrier.class).toBe("second-color");
	expect(sheet.css()).toContain(".first-color{color: var(--first-c-color)}");
	expect(sheet.css()).toContain(".second-color{color: var(--second-c-color)}");
	expect(sheet.snapshot().rules).toHaveLength(2);
	first.vars({ color: "green" });
	expect(sheet.snapshot().rules).toHaveLength(2);
	const hydrated = createRuntimeSheet({ autoMount: false });
	hydrated.hydrate(sheet.snapshot());
	createRuntimeCss(defaultPreset, { sheet: hydrated, namespace: "first" }).vars({ color: "black" });
	expect(hydrated.snapshot().rules).toHaveLength(2);
	expect(hydrated.css()).toContain(".second-color");
});

test("shared runtime sheets compose disjoint preset tokens and preserve hydration", () => {
	const firstPreset = define.preset(
		{ config: {}, tokens: { colors: { $first: "red" } } },
		{ strict: true, conditions: {}, properties: { color: { $tokens: "colors", $strict: false } } },
	);
	const secondPreset = define.preset(
		{ config: {}, tokens: { colors: { $second: "blue" } } },
		{ strict: true, conditions: {}, properties: { color: { $tokens: "colors", $strict: false } } },
	);
	const sheet = createRuntimeSheet({ autoMount: false });
	const first = createRuntimeCss(firstPreset, { sheet });
	const second = createRuntimeCss(secondPreset, { sheet });
	first.class({ color: "$first" });
	second.class({ color: "$second" });
	expect(sheet.snapshot().tokens).toContain(": red;");
	expect(sheet.snapshot().tokens).toContain(": blue;");
	const combined = sheet.css();
	createRuntimeCss(firstPreset, { sheet }).class({ color: "$first" });
	expect(sheet.css()).toBe(combined);
	const hydrated = createRuntimeSheet({ autoMount: false });
	hydrated.hydrate(sheet.snapshot());
	createRuntimeCss(firstPreset, { sheet: hydrated }).class({ color: "$first" });
	expect(hydrated.css()).toBe(combined);
});

test("shared runtime sheets reject conflicting definitions for one token variable", () => {
	const presetFor = (color: string) =>
		define.preset(
			{ config: {}, tokens: { colors: { $same: color } } },
			{
				strict: true,
				conditions: {},
				properties: { color: { $tokens: "colors", $strict: false } },
			},
		);
	const sheet = createRuntimeSheet({ autoMount: false });
	createRuntimeCss(presetFor("red"), { sheet }).class({ color: "$same" });
	const before = sheet.css();
	const conflicting = createRuntimeCss(presetFor("blue"), { sheet });

	expect(() => conflicting.class({ color: "$same" })).toThrow("conflicting runtime token variable");
	expect(sheet.css()).toBe(before);
});

test("runtime token manifests register across duplicate module instances", async () => {
	const firstRuntimeSheetModule = await vi.importActual<
		typeof import("../src/css/runtime-sheet.ts")
	>("../src/css/runtime-sheet.ts?copy=first");
	const secondRuntimeSheetModule = await vi.importActual<
		typeof import("../src/css/runtime-sheet.ts")
	>("../src/css/runtime-sheet.ts?copy=second");
	const sheet = firstRuntimeSheetModule.createRuntimeSheet({ autoMount: false });

	expect(() =>
		secondRuntimeSheetModule.registerRuntimeTokenManifest(
			sheet,
			new Map([["colors.$same", "same-token"]]),
			":root{--same:red}",
		),
	).not.toThrow();
});

test("runtime style registration can recover after a token conflict is cleared", () => {
	const presetFor = (color: string) =>
		define.preset(
			{ config: {}, tokens: { colors: { $same: color } } },
			{
				strict: true,
				conditions: {},
				properties: {
					color: { $tokens: "colors", $strict: false },
					backgroundColor: { $tokens: "colors", $strict: false },
				},
			},
		);
	const sheet = createRuntimeSheet({ autoMount: false });
	createRuntimeCss(presetFor("red"), { sheet }).class({ backgroundColor: "$same" });
	const conflicting = createRuntimeCss(presetFor("blue"), { sheet });

	expect(() => conflicting.class({ color: "$same" })).toThrow("conflicting runtime token variable");
	sheet.setTokens("");

	const className = conflicting.class({ color: "$same" });

	expect(className).toBeTruthy();
	expect(sheet.css()).toMatch(/[{;]color:var\(/u);
});

test("failed runtime style processing does not register preset tokens", () => {
	const sheet = createRuntimeSheet({ autoMount: false });
	const css = createRuntimeCss(examplePreset, {
		sheet,
		className: {
			name: "opaque",
			sheetBacked: false,
			toClassName: () => null,
		},
	});

	expect(() => css.class({ display: firstThatWorks("flex", "block") })).toThrow(
		"firstThatWorks requires the atomic stylesheet",
	);
	expect(sheet.snapshot().tokens).toBe("");
	expect(sheet.snapshot().rules).toEqual([]);
});

test("failed multi-property runtime calls discard declarations staged before the error", () => {
	const sheet = createRuntimeSheet({ autoMount: false });
	const css = createRuntimeCss(examplePreset, {
		sheet,
		className: {
			name: "opaque",
			sheetBacked: false,
			toClassName: () => null,
		},
	});

	expect(() => css.class({ color: "red", display: firstThatWorks("flex", "block") })).toThrow(
		"firstThatWorks requires the atomic stylesheet",
	);
	expect(sheet.snapshot().tokens).toBe("");
	expect(sheet.snapshot().rules).toEqual([]);

	css.class({ color: "blue" });
	expect(sheet.css()).not.toMatch(/color:red/u);
	expect(sheet.css()).toMatch(/color:blue/u);
	expect(sheet.snapshot().rules).toHaveLength(1);
});

test("empty runtime style calls do not claim conflicting token manifests", () => {
	const presetFor = (color: string) =>
		define.preset(
			{ config: {}, tokens: { colors: { $same: color } } },
			{
				strict: true,
				conditions: {},
				properties: { color: { $tokens: "colors", $strict: false } },
			},
		);
	const sheet = createRuntimeSheet({ autoMount: false });
	const red = createRuntimeCss(presetFor("red"), { sheet });
	const blue = createRuntimeCss(presetFor("blue"), { sheet });
	red.class({ color: "$same" });
	const before = sheet.css();

	expect(() => blue.class({})).not.toThrow();
	expect(() => blue.vars({})).not.toThrow();
	expect(sheet.css()).toBe(before);
	expect(() => blue.class({ color: "$same" })).toThrow("conflicting runtime token variable");
});

test("shared runtime sheets reject conflicts in conditional token definitions", () => {
	const presetFor = (dark: string) =>
		define.preset(
			{ config: {}, tokens: { colors: { $same: { base: "red", dark } } } },
			{
				strict: true,
				conditions: { dark: "@media (prefers-color-scheme: dark)" },
				properties: { color: { $tokens: "colors", $strict: false } },
			},
		);
	const sheet = createRuntimeSheet({ autoMount: false });
	createRuntimeCss(presetFor("black"), { sheet }).class({ color: "$same" });
	const before = sheet.css();
	const conflicting = createRuntimeCss(presetFor("white"), { sheet });

	expect(() => conflicting.class({ color: "$same" })).toThrow("conflicting runtime token variable");
	expect(sheet.css()).toBe(before);
});

test("shared runtime sheets reject conflicting custom property registrations", () => {
	const presetFor = (initialValue: string) =>
		define.preset(
			{ config: {}, tokens: {} },
			{
				strict: true,
				conditions: {},
				properties: { color: { $strict: false } },
				cssVariables: {
					progress: { syntax: "<number>", inherits: false, initialValue },
				},
			},
		);
	const sheet = createRuntimeSheet({ autoMount: false });
	createRuntimeCss(presetFor("0"), { sheet }).class({ color: "red" });
	const before = sheet.css();
	const conflicting = createRuntimeCss(presetFor("1"), { sheet });

	expect(() => conflicting.class({ color: "blue" })).toThrow("conflicting runtime token variable");
	expect(sheet.css()).toBe(before);
});

test("shared runtime sheets accept identical token definitions", () => {
	const preset = define.preset(
		{ config: {}, tokens: { colors: { $same: "red" } } },
		{
			strict: true,
			conditions: {},
			properties: { color: { $tokens: "colors", $strict: false } },
		},
	);
	const sheet = createRuntimeSheet({ autoMount: false });
	createRuntimeCss(preset, { sheet }).class({ color: "$same" });
	const before = sheet.css();
	createRuntimeCss(preset, { sheet }).class({ color: "$same" });

	expect(sheet.css()).toBe(before);
	expect(sheet.snapshot().tokenManifest).not.toHaveLength(0);
});

test("shared runtime sheets reject an unverified raw token prelude", () => {
	const preset = define.preset(
		{ config: {}, tokens: { colors: { $same: "red" } } },
		{
			strict: true,
			conditions: {},
			properties: { color: { $tokens: "colors", $strict: false } },
		},
	);
	const sheet = createRuntimeSheet({ autoMount: false });
	sheet.setTokens(":root{--foreign:red}");
	const css = createRuntimeCss(preset, { sheet });

	expect(() => css.class({ color: "$same" })).toThrow("unverified token prelude");
	expect(sheet.css()).toBe(":root{--foreign:red}");
});

test("disjoint runtime tokens are appended even when one value contains their prelude", () => {
	const secondPreset = define.preset(
		{ config: {}, tokens: {} },
		{
			strict: true,
			conditions: {},
			properties: { color: { $strict: false } },
			cssVariables: { new: "red" },
		},
	);
	const secondPrelude = createStylesheet(secondPreset).gen.tokens();
	const firstPreset = define.preset(
		{ config: {}, tokens: {} },
		{
			strict: true,
			conditions: {},
			properties: { color: { $strict: false } },
			cssVariables: { payload: secondPrelude },
		},
	);
	const sheet = createRuntimeSheet({ autoMount: false });
	createRuntimeCss(firstPreset, { sheet }).class({ color: "red" });
	createRuntimeCss(secondPreset, { sheet }).class({ color: "blue" });

	expect(sheet.snapshot().tokens.split(secondPrelude)).toHaveLength(3);
});

test("runtime token declarations are revalidated after a sheet token reset", () => {
	const preset = define.preset(
		{ config: {}, tokens: { colors: { $same: "red" } } },
		{
			strict: true,
			conditions: {},
			properties: { color: { $tokens: "colors", $strict: false } },
		},
	);
	const sheet = createRuntimeSheet({ autoMount: false });
	const css = createRuntimeCss(preset, { sheet });
	css.class({ color: "$same" });
	const rulesBeforeReset = sheet.snapshot().rules;
	sheet.setTokens(":root{--manual:red}");

	expect(() => css.class({ color: "$same" })).toThrow("unverified token prelude");
	expect(sheet.snapshot().tokens).toBe(":root{--manual:red}");
	expect(sheet.snapshot().rules).toEqual(rulesBeforeReset);
});

test("hydration rejects an empty manifest beside an unverified token prelude", () => {
	const preset = define.preset(
		{ config: {}, tokens: { colors: { $same: "red" } } },
		{
			strict: true,
			conditions: {},
			properties: { color: { $tokens: "colors", $strict: false } },
		},
	);
	const sheet = createRuntimeSheet({ autoMount: false });
	sheet.hydrate({
		tokens: ":root{--foreign:red}",
		rules: [],
		tokenManifest: [],
	});
	const css = createRuntimeCss(preset, { sheet });

	expect(() => css.class({ color: "$same" })).toThrow("unverified token prelude");
	expect(sheet.css()).toBe(":root{--foreign:red}");
});

test("runtime contract surface remains type-addressable", () => {
	const surface = typeValue<RuntimeContractSurface>();
	expect(surface).toBeUndefined();
});

test("runtime sheet caches ordering and serialization until its state changes", () => {
	let orderCalls = 0;
	const sheet = createRuntimeSheet(
		{ autoMount: false },
		{
			ordering: {
				order: (rules) => {
					orderCalls++;
					return Array.from(rules.values());
				},
			},
		},
	);

	sheet.register([{ id: "a", css: ".a{color:red}", priority: 1 }]);
	expect(sheet.css()).toBe(".a{color:red}");
	expect(sheet.css()).toBe(".a{color:red}");
	expect(sheet.snapshot().rules).toHaveLength(1);
	expect(orderCalls).toBe(1);

	sheet.register([{ id: "a", css: ".a{color:red}", priority: 1 }]);
	expect(sheet.css()).toBe(".a{color:red}");
	expect(orderCalls).toBe(1);

	sheet.register([{ id: "b", css: ".b{color:blue}", priority: 2 }]);
	expect(sheet.css()).toContain(".b{color:blue}");
	expect(orderCalls).toBe(2);
});

test("lazy sheets defer serialization until they are read or mounted", () => {
	let orderCalls = 0;
	const sheet = createRuntimeSheet(
		{ autoMount: false },
		{
			ordering: {
				order: (rules) => {
					orderCalls++;
					return Array.from(rules.values());
				},
			},
		},
	);

	sheet.register([{ id: "a", css: ".a{color:red}", priority: 1 }]);
	sheet.register([{ id: "b", css: ".b{color:blue}", priority: 2 }]);

	expect(orderCalls).toBe(0);
	expect(sheet.css()).toContain(".a{color:red}");
	expect(orderCalls).toBe(1);
});

test("runtime sheets snapshot caller-owned rules before ordering and serialization", () => {
	const sheet = createRuntimeSheet({ autoMount: false });
	sheet.register([{ id: "first", css: ".first{color:red}", priority: 1 }]);
	sheet.css();
	const nextRule = { id: "next", css: ".next{color:blue}", priority: 2 };
	sheet.register([nextRule]);
	nextRule.css = ".next{color:green}";

	expect(sheet.css()).toContain(".next{color:blue}");
	const storedRule = sheet.snapshot().rules.find((rule) => rule.id === "next");
	if (storedRule === undefined) throw new Error("registered rule missing from runtime sheet");
	expect(Reflect.set(storedRule, "css", ".next{color:green}")).toBe(false);
	expect(sheet.css()).toContain(".next{color:blue}");
});

test("priority sheets insert new rules without changing deterministic order", () => {
	const sheet = createRuntimeSheet({ autoMount: false });

	sheet.register([{ id: "z", css: ".z{color:red}", priority: 1 }]);
	expect(sheet.css()).toBe(".z{color:red}");

	sheet.register([{ id: "a", css: ".a{color:blue}", priority: 1 }]);
	expect(sheet.css()).toBe(".a{color:blue}\n.z{color:red}");

	sheet.register([{ id: "root", css: ".root{display:block}", priority: 0 }]);
	expect(sheet.css()).toBe(".root{display:block}\n.a{color:blue}\n.z{color:red}");

	sheet.register([{ id: "a", css: ".a{color:green}", priority: 1 }]);
	expect(sheet.css()).toBe(".root{display:block}\n.a{color:green}\n.z{color:red}");
});

test("mounted sheets can insert newly ordered rules without a full update", () => {
	const inserted: Array<{ id: string; index: number; existingRuleCount: number }> = [];
	let updates = 0;
	const sheet = createRuntimeSheet(
		{ autoMount: false },
		{
			sink: {
				mount: () => true,
				update: () => {
					updates++;
				},
				insert: (rule, index, existingRuleCount) => {
					inserted.push({ id: rule.id, index, existingRuleCount });
					return true;
				},
				unmount: () => undefined,
			},
		},
	);

	sheet.mount();
	sheet.register([
		{ id: "z", css: ".z{color:red}", priority: 1 },
		{ id: "a", css: ".a{color:blue}", priority: 1 },
	]);

	expect(inserted).toEqual([
		{ id: "a", index: 0, existingRuleCount: 0 },
		{ id: "z", index: 1, existingRuleCount: 1 },
	]);
	expect(updates).toBe(0);
});

test("the DOM sink uses CSSOM insertion when the host exposes a stylesheet", () => {
	const cssRules: string[] = [];
	let textWrites = 0;
	let textContent = "";
	const style = {
		tagName: "STYLE",
		textContent: "",
		sheet: {
			cssRules,
			insertRule: (rule: string, index: number) => {
				cssRules.splice(index, 0, rule);
				return index;
			},
		},
		setAttribute: () => undefined,
		nonce: undefined as string | undefined,
		remove: () => undefined,
	};
	Object.defineProperty(style, "textContent", {
		get: () => textContent,
		set: (value: string) => {
			textWrites++;
			textContent = value;
			cssRules.splice(0, cssRules.length, ...(value === "" ? [] : value.split("\n")));
		},
	});
	const document = {
		querySelector: () => null,
		createElement: () => style,
		head: { appendChild: () => undefined },
	};
	const sheet = createRuntimeSheet({ document });

	sheet.register([{ id: "z", css: ".z{color:red}", priority: 1 }]);
	sheet.register([{ id: "a", css: ".a{color:blue}", priority: 1 }]);
	sheet.setTokens(":root{--token:red}");
	sheet.register([{ id: "b", css: ".b{color:green}", priority: 1 }]);

	expect(textWrites).toBe(2);
	expect(cssRules).toEqual([
		":root{--token:red}",
		".a{color:blue}",
		".b{color:green}",
		".z{color:red}",
	]);
	expect(sheet.css()).toBe(":root{--token:red}\n.a{color:blue}\n.b{color:green}\n.z{color:red}");
});

describe("runtime CSS-in-JS sheet", () => {
	test("collects preset-bound css() rules for SSR without a DOM", () => {
		const sheet = createRuntimeSheet({ autoMount: false });
		const css = createRuntimeCss(examplePreset, { sheet });

		const className = css.class({ color: "$blue-500" });

		expect(className).toMatch(/^[a-z0-9]+$/);
		expect(sheet.css()).toContain("color:#3182ce");
		expect(sheet.snapshot().rules).toHaveLength(1);
	});

	test("keeps preset tokens when a tokenless preset shares the runtime sheet", () => {
		const sheet = createRuntimeSheet({ autoMount: false });
		const tokenfulCss = createRuntimeCss(examplePreset, { sheet });
		const tokenPrelude = createStylesheet(examplePreset).gen.tokens();

		tokenfulCss.class({ color: "$blue-500" });
		const css = createRuntimeCss(defaultPreset, { sheet });
		css.class({ padding: 4 });

		expect(tokenPrelude).not.toBe("");
		expect(sheet.css()).toContain(tokenPrelude);
	});

	test("supports StyleX-like priority specificity for runtime declarations", () => {
		const css = createRuntimeCss(examplePreset, { cascade: "specificity" });

		css.class({ display: "none" });

		expect(css.sheet.css()).toContain(":not(#\\#)");
		expect(css.sheet.css()).not.toContain("!important");
	});

	test("supports a native cascade layer for runtime declarations", () => {
		const css = createRuntimeCss(examplePreset, { cascade: "layers", debug: true });

		css.class({ display: "none" });

		const output = css.sheet.css();
		expect(output.startsWith("@layer yumcss{")).toBe(true);
		expect(output).toContain(".display__none{display:none}");
	});

	test("supports a named native cascade layer for runtime declarations", () => {
		const css = createRuntimeCss(examplePreset, {
			cascade: { mode: "layers", layer: "app.utilities" },
			debug: true,
		});

		css.class({ display: "none" });

		expect(css.sheet.css().startsWith("@layer app.utilities{")).toBe(true);
	});

	test("keeps non-selector semantic rules valid with specificity precedence", () => {
		const sheet = createRuntimeSheet({ autoMount: false, cascade: "specificity" });

		sheet.registerSemanticRules([
			{
				kind: "font-face",
				declarations: [
					{ property: "font-family", value: "Inter" },
					{ property: "src", value: "url(inter.woff2)" },
				],
			},
		]);

		expect(sheet.css()).toBe("@font-face{font-family:Inter;src:url(inter.woff2)}");
	});

	test("returns the same classes that sheet-backed strategies emit", () => {
		for (const strategy of [createNamedAtomsStrategy("runtime"), createStyleXAdapter()]) {
			const sheet = createRuntimeSheet({ autoMount: false });
			const css = createRuntimeCss(examplePreset, { sheet, className: strategy });
			const className = css.class({ color: "red", _hover: { color: "blue" } });

			expect(className.split(" ")).toHaveLength(2);
			for (const classToken of className.split(" ")) {
				expect(sheet.css()).toContain(`.${escapeIdentifier(classToken)}`);
			}
		}
	});

	test("runtime lowering stays byte-identical to the full stylesheet path", () => {
		const styles = {
			color: "$blue-500",
			padding: 4,
			_hover: { color: "$red-500" },
			"&.is-open": { "& .child": { color: "red" } },
		};
		const full = createStylesheet(examplePreset);
		full.process([styles]);
		const sheet = createRuntimeSheet({ autoMount: false });
		const runtime = createRuntimeCss(examplePreset, { sheet });

		runtime.class(styles);

		expect(sheet.snapshot().tokens).toBe(full.gen.tokens());
		expect(sheet.snapshot().rules).toEqual(full.gen.atomicEntries());
		const nestedRule = [...full.gen.atomicEntries().values()].find((rule) =>
			rule.css.includes(".child"),
		);
		expect(nestedRule?.css).toContain(".is-open .child{color:red}");
		expect(nestedRule?.css).not.toContain(".child.is-open");
	});

	test("deduplicates repeated declarations and preserves generated ordering", () => {
		const sheet = createRuntimeSheet({ autoMount: false });
		const css = createRuntimeCss(examplePreset, { sheet });

		const first = css.class({ color: "$blue-500" });
		const second = css.class({ color: "$blue-500" });

		expect(second).toBe(first);
		expect(sheet.snapshot().rules).toHaveLength(1);
	});

	test("batches and registers only newly discovered runtime rules", () => {
		let updates = 0;
		const sheet = createRuntimeSheet(
			{ autoMount: false },
			{
				sink: {
					mount: () => true,
					update: () => {
						updates++;
					},
					unmount: () => undefined,
				},
			},
		);
		const css = createRuntimeCss(examplePreset, { sheet });
		expect(sheet.mount()).toBe(true);
		const before = updates;

		css.class({ color: "$blue-500", padding: 4 });
		const firstUpdateCount = updates - before;
		css.class({ color: "$blue-500", padding: 4 });

		// One update installs the token prelude and one installs both atomic
		// rules. Repeating the same call does not touch the sheet.
		expect(firstUpdateCount).toBe(2);
		expect(updates).toBe(firstUpdateCount);
	});

	test("isolates default runtime sheets across server renders", () => {
		const first = createRuntimeCss(examplePreset);
		const second = createRuntimeCss(examplePreset);

		first.class({ color: "$blue-500" });
		second.class({ padding: 4 });

		expect(first.sheet).not.toBe(second.sheet);
		expect(first.sheet.css()).toContain("color:#3182ce");
		expect(first.sheet.css()).not.toContain("padding:4px");
		expect(second.sheet.css()).toContain("padding:4px");
	});

	test("shares default runtime sheets across browser module instances", () => {
		const sharedSheetsKey = Symbol.for("yumcss.runtime.default-sheet");
		const browserGlobal = globalThis as typeof globalThis & {
			[sharedSheetsKey]?: unknown;
		};
		const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
		const existingSheets = browserGlobal[sharedSheetsKey];
		const document = {
			querySelector: () => null,
			createElement: () => ({
				tagName: "STYLE",
				textContent: "",
				setAttribute: () => undefined,
				remove: () => undefined,
			}),
			head: { appendChild: () => undefined },
		};
		Object.defineProperty(globalThis, "document", { configurable: true, value: document });
		Reflect.deleteProperty(globalThis, sharedSheetsKey);
		try {
			const first = createRuntimeCss(examplePreset);
			const second = createRuntimeCss(examplePreset);
			first.class({ color: "$blue-500" });
			second.class({ padding: 4 });

			expect(first.sheet).toBe(second.sheet);
			expect(first.sheet.css()).toContain("color:#3182ce");
			expect(first.sheet.css()).toContain("padding:4px");
		} finally {
			if (documentDescriptor !== undefined)
				Object.defineProperty(globalThis, "document", documentDescriptor);
			else Reflect.deleteProperty(globalThis, "document");
			if (existingSheets === undefined) Reflect.deleteProperty(globalThis, sharedSheetsKey);
			else browserGlobal[sharedSheetsKey] = existingSheets;
		}
	});

	test("adds var-inline rules to the same runtime sheet", () => {
		const sheet = createRuntimeSheet({ autoMount: false });
		const css = createRuntimeCss(examplePreset, { sheet });

		const result = css.vars({ color: "var(--external-color)" });

		expect(result.class).toBe("pw-color");
		expect(sheet.css()).toContain(".pw-color");
	});

	test("failed var batches do not poison later rule registration", () => {
		const tokens = define.tokens({ colors: { "blue.500": "#3182ce" } });
		const colorPalettes = tokens.defineColorPalettes({ brand: "colors.blue" });
		const preset = define.preset(
			{ config: {}, tokens },
			{
				strict: true,
				conditions: { base: "" },
				properties: { color: { $tokens: "colors", $strict: false } },
				colorPalettes,
			},
		);
		const sheet = createRuntimeSheet({ autoMount: false });
		const css = createRuntimeCss(preset, { sheet });

		expect(() => css.vars({ color: "red", colorPalette: "brand" } as never)).toThrow(
			"colorPalette is a static palette selector",
		);
		const retry = css.vars({ color: "blue" });

		expect(retry.class).toBe("pw-color");
		expect(sheet.css()).toContain(".pw-color");
	});

	test("dynamic groups bind input values through runtime custom properties", () => {
		const sheet = createRuntimeSheet({ autoMount: false });
		const css = createRuntimeCss(examplePreset, { sheet });
		const groups = css.group({
			button: {
				$input: { background: {} as string },
				backgroundColor: css.input("background"),
				color: "$white",
			},
		});

		const props = css.props(groups.button({ background: "#0284c7" }));

		expect(props.style).toEqual({ "--background": "#0284c7" });
		expect(sheet.css()).toContain("background-color:var(--background)");
		expect(props.className).toBeDefined();
	});

	test("runtime function groups register their var rules", () => {
		const sheet = createRuntimeSheet({ autoMount: false });
		const css = createRuntimeCss(examplePreset, { sheet });
		const groups = css.group({
			item: (padding: number) => ({ padding }),
		});

		const props = css.props(groups.item(8));

		expect(props.style).toEqual({ "--pw-c-padding": "8px" });
		expect(sheet.css()).toContain(".pw-padding");
	});

	test("runtime CSS keeps namespaced carriers aligned with its sheet", () => {
		const sheet = createRuntimeSheet({ autoMount: false });
		const css = createRuntimeCss(examplePreset, { sheet, namespace: "checkout" });

		const output = css.vars({ color: "red", _hover: { color: "blue" } });

		expect(output).toMatchObject({
			class: "checkout-hover:color checkout-color",
			style: {
				"--checkout-c-color": "red",
				"--checkout-c-color_hover": "blue",
			},
		});
		expect(sheet.css()).toContain("color: var(--checkout-c-color_hover, var(--checkout-c-color))");
	});

	test("createCss and createRuntimeCss share input output; only runtime adds a sheet", () => {
		const css = createCss(examplePreset);
		const sheet = createRuntimeSheet({ autoMount: false });
		const runtimeCss = createRuntimeCss(examplePreset, { sheet });
		const createInputGroup = (engine: typeof css) =>
			engine.group({
				button: {
					$input: { background: {} as string },
					backgroundColor: engine.input("background"),
					color: "$white",
				},
			});

		const staticProps = css.props(createInputGroup(css).button({ background: "#0284c7" }));
		const runtimeProps = runtimeCss.props(
			createInputGroup(runtimeCss).button({ background: "#0284c7" }),
		);

		expect("sheet" in css).toBe(false);
		expect(runtimeProps).toEqual(staticProps);
		expect(sheet.css()).toContain("background-color:var(--background)");
	});

	test("design css shares the preset-bound runtime path", () => {
		const sheet = createRuntimeSheet({ autoMount: false });
		const dss = createRuntimeDesignCss(examplePreset, { sheet });

		dss.class({ $text: { color: "$blue-500" } });

		expect(sheet.snapshot().rules).toHaveLength(1);
	});

	test("hydrates an SSR snapshot before registering new rules", () => {
		const server = createRuntimeSheet({ autoMount: false });
		server.setTokens(":root { --server-token: red; }");
		server.register([{ id: "a", css: ".a{color:red}", priority: 1 }]);

		const client = createRuntimeSheet({ autoMount: false });
		client.hydrate(server.snapshot());
		client.register([{ id: "b", css: ".b{color:blue}", priority: 2 }]);

		expect(client.css()).toBe(":root { --server-token: red; }\n.a{color:red}\n.b{color:blue}");
	});

	test("mounts into an explicit document and updates one style element", () => {
		const styles: Array<{
			tagName: string;
			textContent: string;
			nonce?: string;
			attributes: Map<string, string>;
			setAttribute: (name: string, value: string) => void;
			remove: () => void;
		}> = [];
		const document = {
			querySelector: (selector: string) => {
				const id = selector.match(/data-yumcss-sheet="([^"]+)"/)?.[1];
				return styles.find((style) => style.attributes.get("data-yumcss-sheet") === id) ?? null;
			},
			createElement: () => {
				const style = {
					tagName: "STYLE",
					textContent: "",
					attributes: new Map<string, string>(),
					setAttribute: (name: string, value: string) => style.attributes.set(name, value),
					remove: () => styles.splice(styles.indexOf(style), 1),
				};
				styles.push(style);
				return style;
			},
			head: { appendChild: () => undefined },
		};
		const sheet = createRuntimeSheet({ autoMount: false, document, nonce: "test" });

		sheet.register([{ id: "a", css: ".a{color:red}", priority: 1 }]);
		expect(sheet.mount()).toBe(true);
		expect(styles[0]?.textContent).toBe(".a{color:red}");
		expect(styles[0]?.nonce).toBe("test");

		sheet.register([{ id: "b", css: ".b{color:blue}", priority: 2 }]);
		expect(styles[0]?.textContent).toBe(".a{color:red}\n.b{color:blue}");

		const secondSheet = createRuntimeSheet({ autoMount: false, document });
		secondSheet.register([{ id: "separate", css: ".separate{color:green}", priority: 1 }]);
		expect(secondSheet.mount()).toBe(true);
		expect(styles).toHaveLength(2);
		expect(styles[0]?.textContent).toBe(".a{color:red}\n.b{color:blue}");
		expect(styles[1]?.textContent).toBe(".separate{color:green}");
		expect(styles[0]?.attributes.get("data-yumcss-sheet")).toBe("yumcss");
		expect(styles[1]?.attributes.get("data-yumcss-sheet")).toBe("yumcss-2");

		sheet.unmount();
		expect(styles).toHaveLength(1);
		expect(styles[0]?.textContent).toBe(".separate{color:green}");
	});

	test("registers semantic rules with stable IDs and preserves rich CSS order", () => {
		const server = createRuntimeSheet({ autoMount: false });
		server.registerSemanticRules([
			{
				kind: "global",
				selector: "body",
				declarations: [{ property: "margin", value: 0 }],
				priority: 1,
			},
			{
				kind: "keyframes",
				name: "fade",
				children: [
					{ kind: "style", selector: "from", declarations: [{ property: "opacity", value: 0 }] },
					{ kind: "style", selector: "to", declarations: [{ property: "opacity", value: 1 }] },
				],
				priority: 2,
			},
			{
				kind: "supports",
				name: "(display: grid)",
				children: [
					{
						kind: "style",
						selector: ".grid",
						declarations: [{ property: "display", value: "grid" }],
					},
				],
				priority: 3,
			},
			{
				kind: "style",
				selector: ".card",
				conditions: ["@container (min-width: 28rem)"],
				declarations: [{ property: "padding", value: "2rem" }],
				priority: 4,
			},
		]);

		expect(server.css()).toBe(
			"body{margin:0}\n@keyframes fade{from{opacity:0}to{opacity:1}}\n@supports (display: grid){.grid{display:grid}}\n@container (min-width: 28rem){.card{padding:2rem}}",
		);
		expect(new Set(server.snapshot().rules.map((rule) => rule.id)).size).toBe(4);

		const client = createRuntimeSheet({ autoMount: false });
		client.hydrate(server.snapshot());
		client.registerSemanticRules([
			{
				kind: "global",
				selector: "body",
				declarations: [{ property: "margin", value: 0 }],
				priority: 1,
			},
		]);
		expect(client.css()).toBe(server.css());
	});

	test("serializes relative selector branches like stylesheet lowering", () => {
		const sheet = createRuntimeSheet({ autoMount: false });
		sheet.registerSemanticRules([
			{
				kind: "style",
				selector: ".generated",
				conditions: [":checked, &[data-selected]"],
				declarations: [{ property: "color", value: "red" }],
			},
		]);

		expect(sheet.css()).toBe(".generated :checked, .generated[data-selected]{color:red}");
	});

	test("serializes bare type selectors in selector lists like stylesheet lowering", () => {
		const input = "button, &:focus";
		const conditions = createConditionsBucket({ className: ".generated" });
		parseCondition(input, conditions);
		const compiled = genCSSRule("color:red", conditions);
		const sheet = createRuntimeSheet({ autoMount: false });
		sheet.registerSemanticRules([
			{
				kind: "style",
				selector: ".generated",
				conditions: [input],
				declarations: [{ property: "color", value: "red" }],
			},
		]);

		expect(sheet.css()).toBe(compiled);
		expect(compiled).toBe(".generated button, .generated:focus{color:red}");
	});

	test("deduplicates identical semantic rules registered in separate batches", () => {
		const sheet = createRuntimeSheet({ autoMount: false });
		const rule = {
			kind: "global" as const,
			selector: "body",
			declarations: [{ property: "margin", value: 0 }],
		};

		sheet.registerSemanticRules([{ ...rule, priority: 1 }]);
		sheet.registerSemanticRules([{ ...rule, priority: 9 }]);

		expect(sheet.snapshot().rules).toHaveLength(1);
		expect(sheet.css()).toBe("body{margin:0}");
	});

	test("keeps distinct semantic rules when their short hashes collide", () => {
		const sheet = createRuntimeSheet({ autoMount: false });
		sheet.registerSemanticRules([
			{
				kind: "style",
				selector: ".ciz7p9zt61",
				declarations: [{ property: "color", value: "red" }],
			},
			{
				kind: "style",
				selector: ".c45hnhaukb",
				declarations: [{ property: "color", value: "red" }],
			},
		]);

		expect(sheet.snapshot().rules).toHaveLength(2);
		expect(sheet.css()).toBe(".ciz7p9zt61{color:red}\n.c45hnhaukb{color:red}");
	});

	test("covers font-face, layers, custom properties, and conditional selectors", () => {
		const sheet = createRuntimeSheet({ autoMount: false });
		sheet.registerSemanticRules([
			{
				kind: "font-face",
				declarations: [
					{ property: "font-family", value: "Inter" },
					{ property: "src", value: "url(inter.woff2)" },
				],
			},
			{
				kind: "layer",
				layer: "components",
				children: [
					{
						kind: "style",
						selector: ".card",
						conditions: ["hover"],
						declarations: [{ property: "color", value: "red" }],
					},
				],
			},
			{
				kind: "property",
				name: "--brand-hue",
				declarations: [
					{ property: "syntax", value: "<number>" },
					{ property: "inherits", value: false },
					{ property: "initial-value", value: 0 },
				],
			},
		]);
		expect(sheet.css()).toContain("@font-face{font-family:Inter;src:url(inter.woff2)}");
		expect(sheet.css()).toContain("@layer components{.card:hover{color:red}}");
		expect(sheet.css()).toContain(
			'@property --brand-hue{syntax:"<number>";inherits:false;initial-value:0}',
		);
	});

	test("serializes semantic camelCase declarations as valid CSS properties", () => {
		const sheet = createRuntimeSheet({ autoMount: false });
		sheet.registerSemanticRules([
			{
				kind: "keyframes",
				name: "typing",
				children: [
					{
						kind: "style",
						selector: "from",
						declarations: [
							{ property: "gridTemplateColumns", value: "1fr" },
							{ property: "borderInlineEndColor", value: "transparent" },
						],
					},
				],
			},
		]);

		expect(sheet.css()).toBe(
			"@keyframes typing{from{grid-template-columns:1fr;border-inline-end-color:transparent}}",
		);
	});
});

describe("runtime-sheet dynamic values (plan-057 T8)", () => {
	test("repeated dynamic values dedupe into one var rule per key", () => {
		const sheet = createRuntimeSheet({ autoMount: false });
		const css = createRuntimeCss(examplePreset, { sheet });

		const first = css.vars({ color: "#3182ce" });
		const second = css.vars({ color: "#ff0000" });
		const third = css.vars({ color: "#111827" });

		// Same carrier class for the same property, regardless of value:
		expect(first.class).toBe("pw-color");
		expect(second.class).toBe("pw-color");
		expect(third.class).toBe("pw-color");
		expect(sheet.css().match(/\.pw-color\b/g)).toHaveLength(1);

		// Per-key identity survives interleaved registration:
		css.vars({ _hover: { color: "#2563eb" } });
		css.vars({ _hover: { color: "#dc2626" } });
		expect(sheet.css().match(/\.pw-hover\\:color\b/g)).toHaveLength(1);
	});

	test("var toggle rules resolve condition-specific custom properties with base fallback", () => {
		const sheet = createRuntimeSheet({ autoMount: false });
		const css = createRuntimeCss(examplePreset, { sheet });

		css.vars({ color: "#3182ce", _hover: { color: "#1d4ed8" } });

		const rules = sheet.css();
		expect(rules).toContain(".pw-color");
		expect(rules).toContain(".pw-hover\\:color");
		// The toggle rule resolves through the hover var first, base var last:
		expect(rules).toContain("color: var(--pw-c-color_hover, var(--pw-c-color))");
	});

	test("deep condition paths chain every prefix with the base fallback", () => {
		const sheet = createRuntimeSheet({ autoMount: false });
		const css = createRuntimeCss(examplePreset, { sheet });

		css.vars({ _dark: { _hover: { color: "#1d4ed8" } } });

		expect(sheet.css()).toContain(
			"color: var(--pw-c-color_dark_hover, var(--pw-c-color_dark, var(--pw-c-color)))",
		);
	});

	test("hydrated snapshots keep deduped var rules and accept new registrations", () => {
		const server = createRuntimeSheet({ autoMount: false });
		const css = createRuntimeCss(examplePreset, { sheet: server });
		css.vars({ color: "#3182ce" });
		css.vars({ color: "#ff0000" });

		const client = createRuntimeSheet({ autoMount: false });
		client.hydrate(server.snapshot());
		const before = client.css();

		const clientCss = createRuntimeCss(examplePreset, { sheet: client });
		clientCss.vars({ color: "#111827" });
		expect(client.css()).toBe(before);
		expect(clientCss.vars({ color: "#16a34a" }).class).toBe("pw-color");
		expect(client.css().match(/\.pw-color\b/g)).toHaveLength(1);
	});
});
