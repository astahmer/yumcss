import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
// Regression harness loads the exact working-tree compiler instead of generated distribution artifacts.
import { createCss } from "../src/css/index.ts";
import { createStylesheet } from "../src/css/create-stylesheet.ts";
import { tailwindPreset } from "../src/preset/tailwindcss.ts";
import { createTw } from "../src/tw/index.ts";
import {
	createConditionsBucket,
	genCSSRule,
	parseCondition,
} from "../src/css/stylesheet-lowering.ts";
import { createInlineTwPluginCore } from "../src/vite/index.ts";
import { yumcssExtractVite } from "../src/vite/css.ts";
import { createCssExtractionService } from "../src/vite/css-extract.ts";
import { inlineCxCalls } from "../src/vite/cx-inline.ts";
import { inlineTwCalls } from "../src/vite/inline.ts";

const directories: string[] = [];
const temporaryDirectory = () => {
	const directory = mkdtempSync(join(tmpdir(), "yumcss-compiler-regression-"));
	directories.push(directory);
	return directory;
};
afterEach(() => {
	for (const directory of directories.splice(0)) rmSync(directory, { recursive: true });
});
const withoutImports = (code: string) => code.replace(/import[^;]+;/gu, "");

test("TW and CX folding preserve lexical bindings and still optimize unshadowed calls", () => {
	for (const name of ["tw", "cx"]) {
		const argument = name === "tw" ? "{p:4}" : '"hello"';
		const source = `import {${name}} from "./${name}"; const outer=${name}(${argument}); const render=(${name})=>${name}(${argument}); {const ${name}=()=>"local"; const nested=${name}(${argument});}`;
		const result =
			name === "tw"
				? inlineTwCalls(source, "app.ts", { variants: {} }, new Set([name]))
				: inlineCxCalls(source, "app.ts", { variants: {} }, new Set([name]));
		expect(result.inlined).toBe(1);
		expect(result.code).toContain(`render=(${name})=>${name}(${argument})`);
		expect(result.code).toContain(`nested=${name}(${argument})`);
		const render = new Function(name, `${withoutImports(result.code)};return render;`)(
			() => "outer",
		);
		expect(render(() => "caller")).toBe("caller");
	}
});

test("CSS plugin preserves shadowed direct and member calls and excludes them from extraction", async () => {
	const directory = temporaryDirectory();
	const css = createCss({ ...tailwindPreset, strict: false });
	const source =
		'import {css} from "./design"; const outer=css.class({color:"red"}); const render=(css)=>css.class({color:"blue"}); {const css={class:()=>"local"}; const nested=css.class({color:"green"});}';
	const plugin = yumcssExtractVite(css, { root: directory });
	const result = await plugin.transform.call(undefined, source, join(directory, "app.ts"));
	expect(result?.code).toContain('render=(css)=>css.class({color:"blue"})');
	expect(result?.code).toContain('nested=css.class({color:"green"})');
	const render = new Function("css", `${withoutImports(result!.code)};return render;`)(css);
	expect(render({ class: () => "caller" })).toBe("caller");
	const extraction = createCssExtractionService({
		preset: tailwindPreset,
		matchers: ["design"],
	}).extractFile(source, "app.ts");
	expect(extraction.sources.map(({ style }) => style)).toEqual([{ color: "red" }]);
});

test.each([
	'styles.color="blue";',
	'const alias=styles; alias.color="blue";',
	'const mutate=(value)=>{value.color="blue";}; mutate(styles);',
	'Object.assign(styles,{color:"blue"});',
	'for(styles.color of ["blue"]) {}',
	"for(styles.color in {blue:true}) {}",
])("mutable style objects stay runtime after %s", (mutation) => {
	const css = createCss({ ...tailwindPreset, strict: false });
	const service = createCssExtractionService({ preset: tailwindPreset, matchers: ["design"] });
	const source = `import {css} from "./design"; const styles={color:"red"}; ${mutation} const result=css.class(styles);`;
	const transformed = service.inline(source, "app.ts", service.findImports(source, "app.ts"));
	expect(transformed.inlined).toBe(0);
	const actual = new Function("css", `${withoutImports(transformed.code)}; return result;`)(css);
	expect(actual).toBe(new Function("css", 'return css.class({color:"blue"});')(css));
	expect(service.extractFile(source, "app.ts").sources).toHaveLength(0);
});

test.each([
	["as const", 'const styles=({color:"red"} as const); styles.color="blue";'],
	[
		"satisfies",
		'const styles=({color:"red"} satisfies Record<string,string>); styles.color="blue";',
	],
	["type assertion", 'const styles=(<Record<string,string>>{color:"red"}); styles.color="blue";'],
])("mutable style objects stay runtime when their initializer uses %s", (_name, setup) => {
	const service = createCssExtractionService({ preset: tailwindPreset, matchers: ["design"] });
	const source = `import {css} from "./design"; ${setup} const result=css.class(styles);`;
	const transformed = service.inline(source, "app.ts", service.findImports(source, "app.ts"));

	expect(transformed.inlined).toBe(0);
	expect(transformed.code).toBe(source);
	expect(service.extractFile(source, "app.ts").sources).toHaveLength(0);
});

test("CSS extraction preserves shadowed firstThatWorks calls in local bindings and style values", () => {
	const css = { class: (style: unknown) => style };
	const service = createCssExtractionService({ preset: tailwindPreset, matchers: ["design"] });
	const sources = [
		'import {css} from "./design"; import {firstThatWorks} from "yumcss/css"; function make(firstThatWorks){const value=firstThatWorks("red","blue"); return css.class({color:value});}',
		'import {css} from "./design"; import {firstThatWorks} from "yumcss/css"; function make(firstThatWorks){return css.class({color:firstThatWorks("red","blue")});}',
	];
	for (const source of sources) {
		const transformed = service.inline(source, "app.ts", service.findImports(source, "app.ts"));
		expect(transformed.inlined).toBe(0);
		expect(transformed.code).toBe(source);
		expect(service.extractFile(source, "app.ts").sources).toHaveLength(0);
		const make = new Function("css", `${withoutImports(source)}; return make;`)(css);
		expect(make((_first: string, second: string) => second)).toEqual({ color: "blue" });
	}
});

test("mutable local styles and nested object escapes stay runtime", () => {
	const service = createCssExtractionService({ preset: tailwindPreset, matchers: ["design"] });
	for (const source of [
		'import {css} from "./design"; const render=()=>{const styles={color:"red"}; styles.color="blue"; return css.class(styles);};',
		'import {css} from "./design"; const styles={_hover:{color:"red"}}; mutate(styles._hover); const result=css.class(styles);',
	])
		expect(service.inline(source, "app.ts", service.findImports(source, "app.ts")).inlined).toBe(0);
});

test("nested mutations through shallow copies keep the original style at runtime", () => {
	const source =
		'import {css} from "./design"; const styles={_hover:{color:"red"}}; const copy={...styles}; copy._hover.color="blue"; const result=css.class(styles);';
	const service = createCssExtractionService({ preset: tailwindPreset, matchers: ["design"] });
	const result = service.inline(source, "app.ts", service.findImports(source, "app.ts"));
	expect({ input: source, output: result.code }).toMatchInlineSnapshot(`
		{
		  "input": "import {css} from "./design"; const styles={_hover:{color:"red"}}; const copy={...styles}; copy._hover.color="blue"; const result=css.class(styles);",
		  "output": "import {css} from "./design"; const styles={_hover:{color:"red"}}; const copy={...styles}; copy._hover.color="blue"; const result=css.class(styles);",
		}
	`);
	expect(result.inlined).toBe(0);
	expect(result.code).toBe(source);
});

test("keeps nested style aliases stored in object properties on the runtime path", () => {
	const source =
		'import {css} from "./design"; const styles={_hover:{color:"red"}}; const holder={nested:styles._hover}; holder.nested.color="blue"; const result=css.class(styles);';
	const service = createCssExtractionService({ preset: tailwindPreset, matchers: ["design"] });
	const result = service.inline(source, "app.ts", service.findImports(source, "app.ts"));
	expect(result.inlined).toBe(0);
	expect(result.code).toBe(source);
	expect(service.extractFile(source, "app.ts").sources).toHaveLength(0);
});

test("extracts local styles built from immutable module palette values", () => {
	const source =
		'import {css} from "./design"; const palette={brand:"red"}; function render(){const localStyles={color:palette.brand}; return css.class(localStyles);}';
	const service = createCssExtractionService({ preset: tailwindPreset, matchers: ["design"] });
	const result = service.inline(source, "app.ts", service.findImports(source, "app.ts"));

	expect(result.inlined).toBe(1);
	expect(result.code).toBe(
		'import {css} from "./design"; const palette={brand:"red"}; function render(){const localStyles={color:palette.brand}; return "1nmpgqu";}',
	);
	expect(service.extractFile(source, "app.ts").sources.map(({ style }) => style)).toEqual([
		{ color: "red" },
	]);
});

test("destructuring assignments to nested style members stay on the runtime path", () => {
	const source =
		'import {css} from "./design"; const styles={_hover:{color:"red"}}; ({a:styles._hover.color}={a:"blue"}); const result=css.class(styles);';
	const service = createCssExtractionService({ preset: tailwindPreset, matchers: ["design"] });
	const result = service.inline(source, "app.ts", service.findImports(source, "app.ts"));

	expect(result.inlined).toBe(0);
	expect(result.code).toBe(source);
});

test("nested selector lists compose every conjunction instead of matching either condition", () => {
	const preset = {
		...tailwindPreset,
		conditions: { _first: "&:hover, &[data-first]", _second: "&:focus, &[data-second]" },
	};
	const sheet = createStylesheet(preset);
	sheet.process([{ _first: { _second: { color: "red" } } }]);
	const css = sheet.gen.atomicEntries()[0]!.css;
	const selector = css.slice(0, css.indexOf("{"));
	const selectors = selector.split(", ");
	expect(selectors).toHaveLength(4);
	for (const branch of selectors) {
		expect(branch).toMatch(/:hover|\[data-first\]/u);
		expect(branch).toMatch(/:focus|\[data-second\]/u);
	}
});

test("selector-list branches without ampersands remain relative to the generated class", () => {
	const input = ":checked, &[data-selected]";
	const conditions = createConditionsBucket({ className: ".generated" });
	parseCondition(input, conditions);
	const output = genCSSRule("color:red", conditions);
	expect({ input, output }).toMatchInlineSnapshot(`
		{
		  "input": ":checked, &[data-selected]",
		  "output": ".generated :checked, .generated[data-selected]{color:red}",
		}
	`);
	expect(output).toBe(".generated :checked, .generated[data-selected]{color:red}");
});

test("ampersands in selector comments do not escape the generated class scope", () => {
	const conditions = createConditionsBucket({ className: ".generated" });
	parseCondition("/* & */:hover", conditions);

	const output = genCSSRule("color:red", conditions);

	expect(output).toBe(".generated /* & */:hover{color:red}");
});

test.each(['& > [data-text="A&B"]', '[data-text="A&B"] &', '&:has([data-text="A&B"]) > *'])(
	"selector nesting preserves literal attribute ampersands in %s",
	(condition) => {
		const preset = { ...tailwindPreset, conditions: { _match: condition } };
		const css = createStylesheet(preset).generate([{ _match: { color: "red" } }]);
		expect(css).toContain('[data-text="A&B"]');
	},
);

test("each generated TW import compiles through its own metadata", async () => {
	const directory = temporaryDirectory();
	const firstPath = join(directory, "first", "tw.ts");
	const secondPath = join(directory, "second", "tw.ts");
	mkdirSync(join(directory, "first"));
	mkdirSync(join(directory, "second"));
	const firstConfig = { variants: {}, valueTokens: { p: { "4": "small" } } };
	const secondConfig = { variants: {}, valueTokens: { p: { "4": "large" } } };
	writeFileSync(firstPath, `export const tw=createTw(${JSON.stringify(firstConfig)});`);
	writeFileSync(secondPath, `export const tw=createTw(${JSON.stringify(secondConfig)});`);
	const source =
		'import {tw as first} from "./first/tw"; import {tw as second} from "./second/tw"; const values=[first({p:4}),second({p:4})];';
	const result = await createInlineTwPluginCore().transform(source, join(directory, "app.ts"), {
		resolve: (source) => ({ id: source === "./first/tw" ? firstPath : secondPath }),
	});
	expect(result).not.toBeNull();
	const values = new Function(`${withoutImports(result!.code)};return values;`)();
	expect(values).toEqual([createTw(firstConfig)({ p: 4 }), createTw(secondConfig)({ p: 4 })]);
	expect(values).toEqual(["p-small", "p-large"]);
});
