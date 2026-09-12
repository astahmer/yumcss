import { describe, expect, test } from "vitest";
import { createCss, type CssFn } from "../src/css/create-css.ts";
import {
	createRuntimeCss,
	createRuntimeDesignCss,
	createRuntimeSheet,
} from "../src/css/runtime.ts";
import { createStylesheet } from "../src/css/create-stylesheet.ts";
import { cssShorthands } from "../src/css/shorthands.ts";
import { createNamedAtomsStrategy } from "../src/css/named-atoms-strategy.ts";
import { createStyleXAdapter } from "../src/css/stylex-adapter.ts";
import { escapeIdentifier } from "../src/css/hash.ts";
import { examplePreset } from "@pandwind/example-preset";
import type {
	RuntimeDeclaration,
	RuntimeDocument,
	RuntimeRuleCanonicalizer,
	RuntimeRuleSerializer,
	RuntimeRuleStore,
	RuntimeStyleElement,
	RuntimeStyleElementSink,
} from "../src/css/runtime-sheet.ts";
import type { StyleObject } from "../src/types/typings.ts";

type RuntimeContractSurface = {
	document: RuntimeDocument;
	element: RuntimeStyleElement;
	declaration: RuntimeDeclaration;
	store: RuntimeRuleStore;
	canonicalizer: RuntimeRuleCanonicalizer;
	serializer: RuntimeRuleSerializer;
	sink: RuntimeStyleElementSink;
};

test("runtime contract surface remains type-addressable", () => {
	const surface = undefined as unknown as RuntimeContractSurface;
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

	test("marks runtime declarations important when requested", () => {
		const sheet = createRuntimeSheet({ autoMount: false });
		const css = createRuntimeCss(examplePreset, { sheet, important: true });

		css.class({ display: "none" });

		expect(sheet.css()).toContain("display:none !important");
	});

	test("runtime aliases are opt-in and share the configured stylesheet mapping", () => {
		const sheet = createRuntimeSheet({ autoMount: false });
		const css = createRuntimeCss(examplePreset, {
			sheet,
			propertyAliases: cssShorthands,
		});

		css.class({ bg: "red" } as never);
		css.vars({ bg: "blue" } as never);

		const output = sheet.css();
		expect(output).toContain("background:red");
		expect(output).toContain("background: var(--pw-c-background)");
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
		};
		const full = createStylesheet(examplePreset);
		full.process([styles]);
		const sheet = createRuntimeSheet({ autoMount: false });
		const runtime = createRuntimeCss(examplePreset, { sheet });

		runtime.class(styles);

		expect(sheet.snapshot()).toEqual({
			tokens: full.gen.tokens(),
			rules: full.gen.atomicEntries(),
		});
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

	test("shares the default sheet across module-scoped runtime CSS instances", () => {
		const first = createRuntimeCss(examplePreset);
		const second = createRuntimeCss(examplePreset);

		first.class({ color: "$blue-500" });
		second.class({ padding: 4 });

		expect(first.sheet).toBe(second.sheet);
		expect(first.sheet.css()).toContain("color:#3182ce");
		expect(first.sheet.css()).toContain("padding:4px");
	});

	test("adds var-inline rules to the same runtime sheet", () => {
		const sheet = createRuntimeSheet({ autoMount: false });
		const css = createRuntimeCss(examplePreset, { sheet });

		const result = css.vars({ color: "var(--external-color)" });

		expect(result.class).toBe("pw-color");
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
		const groups = (css as unknown as CssFn<StyleObject>).group({
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
			querySelector: () => styles[0] ?? null,
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
			"@property --brand-hue{syntax:<number>;inherits:false;initial-value:0}",
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
