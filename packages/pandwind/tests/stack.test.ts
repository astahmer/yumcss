/**
 * `<Stack>` erasure tests — mapping table, differential vs hand-written
 * classes, and the vite fold pass (static folds, dynamic stays runtime).
 */
import { describe, expect, test } from "vitest";
import { performance } from "node:perf_hooks";
import { createNamedAtomsStrategy } from "../src/css/named-atoms-strategy.ts";
import { createUnsafeCss } from "../src/unsafe/css.ts";
import { createStackClassName, stackClasses, stackStyle } from "../src/stack/index.ts";
import { createTwAdapter } from "../src/tw/adapter.ts";
import { createPandwindEngineContext } from "../src/vite/engine-context.ts";
import { foldStackElements, stackFoldVite } from "../src/vite/stack-fold.ts";
import { examplePreset } from "@pandwind/example-preset";

describe("stackClasses — mapping table", () => {
	test("bare flex when empty", () => {
		expect(stackClasses({})).toBe("flex");
	});

	test("deterministic order: flex → direction → gap → padding → align → justify", () => {
		expect(
			stackClasses({
				justify: "between",
				align: "center",
				padding: "6",
				gap: "4",
				direction: "column",
			}),
		).toBe("flex flex-col gap-4 p-6 items-center justify-between");
	});

	test("direction variants", () => {
		expect(stackClasses({ direction: "row" })).toBe("flex flex-row");
		expect(stackClasses({ direction: "column" })).toBe("flex flex-col");
		expect(stackClasses({ direction: "row-reverse" })).toBe("flex flex-row-reverse");
		expect(stackClasses({ direction: "column-reverse" })).toBe("flex flex-col-reverse");
	});

	test("unknown values pass through verbatim after the prefix", () => {
		expect(stackClasses({ gap: "3.5", padding: "px" })).toBe("flex gap-3.5 p-px");
	});

	test("numeric values stay available to both the Tailwind and CSS lanes", () => {
		expect(stackClasses({ gap: 4, padding: 6 })).toBe("flex gap-4 p-6");
		expect(
			stackStyle({
				direction: "column",
				gap: 4,
				padding: 6,
				align: "center",
				justify: "between",
			}),
		).toEqual({
			display: "flex",
			flexDirection: "column",
			gap: 4,
			padding: 6,
			alignItems: "center",
			justifyContent: "space-between",
		});
	});

	test("responsive and variant values use the same deterministic utility order", () => {
		expect(
			stackClasses({
				direction: { base: "column", md: "row" },
				gap: { base: 2, md: 4 },
				align: { _hover: "center" },
			}),
		).toBe("flex flex-col md:flex-row gap-2 md:gap-4 hover:items-center");
		expect(
			stackStyle({
				direction: { base: "column", md: "row" },
				gap: { md: 4 },
				align: { _hover: "center" },
			}),
		).toEqual({
			display: "flex",
			flexDirection: "column",
			md: { flexDirection: "row", gap: 4 },
			_hover: { alignItems: "center" },
		});
	});
});

test("createStackClassName delegates layout declarations to the supplied CSS compiler", () => {
	const css = createUnsafeCss({
		className: createNamedAtomsStrategy("app"),
	});
	const className = createStackClassName(css)({
		direction: "column",
		gap: 4,
		padding: "1rem",
		align: "center",
		justify: "between",
	});

	expect(className).toBe(
		"app-display-flex app-flexDirection-column app-gap-4px app-padding-1rem " +
			"app-alignItems-center app-justifyContent-space-between",
	);
});

test("createStackClassName also delegates to the Tailwind class strategy", () => {
	const css = createUnsafeCss({
		className: createTwAdapter({
			preset: examplePreset,
			variants: {},
			bridge: {
				display: { flex: "flex" },
				"flex-direction": { column: "flex-col" },
				gap: { "4px": "gap-4" },
				padding: { "1rem": "p-4" },
				"align-items": { center: "items-center" },
				"justify-content": { "space-between": "justify-between" },
			},
		}),
	});

	expect(
		createStackClassName(css)({
			direction: "column",
			gap: 4,
			padding: "1rem",
			align: "center",
			justify: "between",
		}),
	).toBe("flex flex-col gap-4 p-4 items-center justify-between");
});

describe("differential — folded output equals hand-written div classes", () => {
	const cases: Array<[Parameters<typeof stackClasses>[0], string]> = [
		[{ direction: "column", gap: "4" }, "flex flex-col gap-4"],
		[
			{ direction: "row", padding: "6", align: "center", justify: "end" },
			"flex flex-row p-6 items-center justify-end",
		],
	];
	for (const [props, handwritten] of cases) {
		test(`stackClasses(${JSON.stringify(props)}) === "${handwritten}"`, () => {
			expect(stackClasses(props)).toBe(handwritten);
		});
	}
});

describe("foldStackElements — vite fold pass", () => {
	test("static usage folds to a static div with identical classes", () => {
		const src = `import { Stack } from "pandwind/stack";\nexport const A = <Stack direction="column" gap={4}>hi</Stack>;`;
		const out = foldStackElements(src, "a.tsx");
		expect(out.folded).toBe(1);
		expect(out.code).toContain(`<div className="flex flex-col gap-4">hi</div>`);
		expect(out.code).not.toContain("Stack");
		expect(out.code).not.toContain('from "pandwind/stack"');
	});

	test("dynamic prop keeps the whole element runtime", () => {
		const src = `import { Stack } from "pandwind/stack";\nexport const B = <Stack gap={dyn}>hi</Stack>;`;
		const out = foldStackElements(src, "b.tsx");
		expect(out.folded).toBe(0);
		expect(out.code).toBe(src);
	});

	test("static responsive and variant props fold to prefixed classes", () => {
		const input =
			`<Stack direction={{ base: "column", md: "row" }} ` +
			`gap={{ base: 2, md: 4 }} align={{ _hover: "center" }} />`;
		expect(foldStackElements(input, "responsive.tsx")).toEqual({
			code: `<div className="flex flex-col md:flex-row gap-2 md:gap-4 hover:items-center" />`,
			folded: 1,
		});
	});

	test("dynamic nested responsive values keep the component runtime", () => {
		const input = `<Stack gap={{ base: dynamicGap, md: 4 }} />`;
		expect(foldStackElements(input, "dynamic-responsive.tsx")).toEqual({
			code: input,
			folded: 0,
		});
	});

	test("unknown attributes pass through onto the div; known literals still fold", () => {
		const src = `<Stack direction="row" onClick={handler} data-x="1"><span/></Stack>`;
		const out = foldStackElements(src, "c.tsx");
		expect(out.folded).toBe(1);
		expect(out.code).toContain(`onClick={handler}`);
		expect(out.code).toContain(`data-x="1"`);
		expect(out.code).toContain(`className="flex flex-row"`);
	});

	test("static renderer class attributes merge into the generated class", () => {
		const out = foldStackElements(`<Stack gap="2" className="custom" />`, "class.tsx");
		expect(out.code).toBe(`<div className="flex gap-2 custom" />`);
	});

	test("static renderer class attributes preserve whitespace", () => {
		const out = foldStackElements(
			`<Stack gap="2" className="custom with spaces" />`,
			"class-spaces.tsx",
		);
		expect(out.code).toBe(`<div className="flex gap-2 custom with spaces" />`);
	});

	test("dynamic renderer class attributes keep the component runtime", () => {
		const input = `<Stack gap="2" className={customClass} />`;
		expect(foldStackElements(input, "dynamic-class.tsx")).toEqual({ code: input, folded: 0 });
	});

	test("self-closing form folds", () => {
		const out = foldStackElements(`<Stack padding="2" />`, "d.tsx");
		expect(out.code).toBe(`<div className="flex p-2" />`);
	});

	test("configured folding uses the shared engine and records CSS declarations", () => {
		const engine = createPandwindEngineContext({
			preset: examplePreset,
			className: {
				name: "named-test",
				sheetBacked: true,
				toClassName: (key, value) => `app-${key}-${value}`,
			},
		});
		const source = "/src/configured-stack.tsx";
		const input = `<Stack direction="column" gap={4} align="center" />`;
		const out = foldStackElements(input, source, { engine });

		expect(out).toEqual({
			code: `<div className="app-display-flex app-flexDirection-column app-gap-4px app-alignItems-center" />`,
			folded: 1,
		});
		expect(engine.preparedStyles.get(source)).toEqual([
			{ key: "display", value: "flex", className: "app-display-flex" },
			{
				key: "flexDirection",
				value: "column",
				className: "app-flexDirection-column",
			},
			{ key: "gap", value: "4px", className: "app-gap-4px" },
			{ key: "alignItems", value: "center", className: "app-alignItems-center" },
		]);
	});

	test("configured folding preserves responsive conditions in the shared engine", () => {
		const engine = createPandwindEngineContext({
			preset: examplePreset,
			className: {
				name: "responsive",
				sheetBacked: true,
				toClassName: (key, value) => `app-${key}-${value}`,
			},
		});
		const source = "/src/responsive-stack.tsx";
		const input = `<Stack direction={{ base: "column", md: "row" }} gap={{ md: 4 }} />`;
		const out = foldStackElements(input, source, { engine });

		expect(out.folded).toBe(1);
		expect(out.code).toContain("app-flexDirection-column");
		expect(out.code).toContain("app-flexDirection__md-row");
		expect(out.code).toContain("app-gap__md-4px");
		expect(engine.preparedStyles.get(source)).toEqual([
			{ key: "display", value: "flex", className: "app-display-flex" },
			{ key: "flexDirection", value: "column", className: "app-flexDirection-column" },
			{ key: "flexDirection__md", value: "row", className: "app-flexDirection__md-row" },
			{ key: "gap__md", value: "4px", className: "app-gap__md-4px" },
		]);
	});

	test("configured folding stays conservative when the strategy refuses a declaration", () => {
		const engine = createPandwindEngineContext({
			preset: examplePreset,
			className: {
				name: "refusing",
				toClassName: () => {
					throw new Error("unrepresentable");
				},
			},
		});
		const source = "/src/refused-stack.tsx";
		const input = `<Stack gap={4} />`;

		expect(foldStackElements(input, source, { engine })).toEqual({ code: input, folded: 0 });
		expect(engine.preparedStyles.has(source)).toBe(false);
	});

	test("the Stack fold hook clears prepared declarations during HMR", () => {
		const engine = createPandwindEngineContext({ preset: examplePreset });
		const source = "/src/hmr-stack.tsx";
		const plugin = stackFoldVite({ engine });

		plugin.transform(`<Stack gap={4} />`, source);
		expect(engine.preparedStyles.has(source)).toBe(true);

		plugin.handleHotUpdate({ file: source, modules: [] });
		expect(engine.preparedStyles.has(source)).toBe(false);
	});

	test("the Stack fold hook ignores Vite query modules", () => {
		const plugin = stackFoldVite();

		expect(plugin.transform("<Stack gap={4} />", "/src/app.tsx?raw")).toBeNull();
	});

	test("direct Stack folding normalizes query-bearing source ids", () => {
		expect(foldStackElements("<Stack gap={4} />", "/src/app.tsx?direct")).toEqual({
			code: `<div className="flex gap-4" />`,
			folded: 1,
		});
	});

	test("Stack folding handles static Svelte and Astro markup", () => {
		const plugin = stackFoldVite();
		const svelte = plugin.transform(
			`<script>\nimport Stack from "pandwind/stack/svelte";\n</script>\n` +
				`<Stack direction={{ base: "column", md: "row" }} ` +
				`gap={{ base: 2, md: 4 }} class="custom with spaces" class:active={active}>\n` +
				`<span>content</span>\n</Stack>`,
			"/src/App.svelte",
		);
		expect(svelte?.code).toContain(
			`<div class="flex flex-col md:flex-row gap-2 md:gap-4 custom with spaces" class:active={active}>`,
		);
		expect(svelte?.code).toContain("class:active={active}");
		expect(svelte?.code).toContain("</div>");
		expect(svelte?.code).not.toContain("pandwind/stack/svelte");

		const astro = plugin.transform(
			`---\nimport Stack from "pandwind/stack/astro";\n---\n` +
				`<Stack gap={4} data-kind="demo" />`,
			"/src/App.astro",
		);
		expect(astro?.code).toContain(`<div class="flex gap-4" data-kind="demo"></div>`);
		expect(astro?.code).not.toContain("pandwind/stack/astro");
	});

	test("native Stack folding leaves dynamic props on the component", () => {
		const source = `<Stack gap={dynamicGap} />`;

		expect(stackFoldVite().transform(source, "/src/App.svelte")).toBeNull();
	});

	test("configured native folding uses the shared CSS engine", () => {
		const source = "/src/App.svelte";
		const engine = createPandwindEngineContext({
			preset: examplePreset,
			className: createNamedAtomsStrategy("app"),
		});
		const transformed = stackFoldVite({ engine }).transform(
			`<Stack direction={{ base: "column", md: "row" }} gap={4} />`,
			source,
		);

		expect(transformed?.code).toContain(
			`<div class="app-display-flex app-flexDirection-column app-flexDirection__md-row app-gap-4px"></div>`,
		);
		expect(engine.preparedStyles.get(source)).toEqual([
			{ key: "display", value: "flex", className: "app-display-flex" },
			{ key: "flexDirection", value: "column", className: "app-flexDirection-column" },
			{ key: "flexDirection__md", value: "row", className: "app-flexDirection__md-row" },
			{ key: "gap", value: "4px", className: "app-gap-4px" },
		]);
	});

	test("configured folding supports the renderer's `class` attribute spelling", () => {
		const out = foldStackElements(`<Stack gap={4} />`, "solid.tsx", {
			classAttribute: "class",
		});

		expect(out.code).toBe(`<div class="flex gap-4" />`);
	});

	test("mixed file: static folds, dynamic sibling untouched, import kept for the dynamic one", () => {
		const src = `import { Stack } from "pandwind/stack";\nexport const A = () => (<><Stack gap="2" /><Stack gap={g} /></>);`;
		const out = foldStackElements(src, "e.tsx");
		expect(out.folded).toBe(1);
		expect(out.code).toContain(`<div className="flex gap-2" />`);
		expect(out.code).toContain(`<Stack gap={g} />`);
		expect(out.code).toContain('from "pandwind/stack"');
	});

	test("scales source edits across large JSX files", () => {
		const sourceFor = (count: number): string =>
			`import { Stack } from "pandwind/stack";\nexport const view = <>${Array.from(
				{ length: count },
				(_, index) => `<Stack gap={${index % 8}} />`,
			).join("")}</>;`;
		const measureMedian = (source: string, count: number): number => {
			const samples: number[] = [];
			for (let sample = 0; sample < 3; sample++) {
				const started = performance.now();
				const result = foldStackElements(source, "/src/large-stack.tsx");
				samples.push(performance.now() - started);
				expect(result.folded).toBe(count);
				expect(result.code.match(/<div className=/gu)).toHaveLength(count);
			}
			return samples.toSorted((left, right) => left - right)[1]!;
		};
		const smallSource = sourceFor(200);
		const largeSource = sourceFor(2_000);

		measureMedian(smallSource, 200);
		const smallMs = measureMedian(smallSource, 200);
		const largeMs = measureMedian(largeSource, 2_000);

		expect(largeMs / smallMs, `${smallMs.toFixed(1)}ms -> ${largeMs.toFixed(1)}ms`).toBeLessThan(
			30,
		);
	});
});
