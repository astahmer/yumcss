import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "vitest";
import { runAdapterMigration } from "../src/swap/adapter-migration.ts";
import { BuiltinHostFramework, CodemodAdapterId, createBuiltinCodemodCatalog } from "../src/swap/index.ts";

const catalog = createBuiltinCodemodCatalog();
const root = "/virtual/css-modules-project";

const migrate = (source: string) =>
	runAdapterMigration(source, {
		from: CodemodAdapterId.StyledComponents,
		to: CodemodAdapterId.CssModules,
		file: "src/Card.tsx",
		root,
		mode: "safe",
		readFile: () => undefined,
		adapterRegistry: catalog.registry,
		semantic: { source: { framework: BuiltinHostFramework.React } },
	});

const typecheckGeneratedProject = (componentSource: string): string => {
	const projectRoot = resolve(process.cwd(), "../../benchmarks/styling-tsc");
	const directory = mkdtempSync(join(projectRoot, ".codemod-css-modules-"));
	const componentFile = join(directory, "Card.tsx");
	const consumerFile = join(directory, "App.tsx");
	const secondConsumerFile = join(directory, "CardPreview.tsx");
	const declarationsFile = join(directory, "css-modules.d.ts");
	const configFile = join(directory, "tsconfig.json");
	try {
		writeFileSync(componentFile, componentSource);
		writeFileSync(
			consumerFile,
			'import { createRef } from "react";\n' +
				'import { Card } from "./Card";\n' +
				"const cardRef = createRef<HTMLDivElement>();\n" +
				'export const App = () => <Card title="Reusable" className="consumer-class" style={{ display: "block" }} ref={cardRef}>content</Card>;',
		);
		writeFileSync(
			secondConsumerFile,
			'import { Card } from "./Card";\n' +
			'export const CardPreview = () => <Card aria-label="Preview">preview</Card>;',
		);
		writeFileSync(
			declarationsFile,
			'declare module "*.module.css" { const classes: Readonly<Record<string, string>>; export default classes; }',
		);
		writeFileSync(
			configFile,
			JSON.stringify(
				{
					compilerOptions: {
						jsx: "react-jsx",
						module: "ESNext",
						moduleResolution: "Bundler",
						noEmit: true,
						skipLibCheck: true,
						strict: true,
						target: "ESNext",
					},
					files: [componentFile, consumerFile, secondConsumerFile, declarationsFile],
				},
				null,
				2,
			),
		);
		try {
			return execFileSync("pnpm", ["exec", "tsc", "--project", configFile], {
				cwd: projectRoot,
				encoding: "utf8",
			});
		} catch (error) {
			if (error instanceof Error && "stdout" in error && "stderr" in error)
				throw new Error(`${String(error.stdout)}${String(error.stderr)}`, { cause: error });
			throw error;
		}
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
};

const renderGeneratedProject = (componentSource: string, stylesheet: string): string => {
	const projectRoot = resolve(process.cwd(), "../../examples/showcase");
	const directory = mkdtempSync(join(projectRoot, ".codemod-css-modules-ssr-"));
	const sourceDirectory = join(directory, "src");
	const rendererFile = join(directory, "render.mjs");
	try {
		mkdirSync(sourceDirectory);
		writeFileSync(join(sourceDirectory, "Card.tsx"), componentSource);
		writeFileSync(join(sourceDirectory, "Card.module.css"), stylesheet);
		writeFileSync(
			join(sourceDirectory, "App.tsx"),
			'import { createRef } from "react";\n' +
				'import { Card } from "./Card";\n' +
				'const cardRef = createRef();\n' +
				'export const App = () => <Card title="Reusable" className="consumer-class" style={{ display: "block" }} $tone="private" ref={cardRef}>content</Card>;',
		);
		writeFileSync(
			rendererFile,
			`import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const projectRoot = process.argv[2];
const vite = await createServer({
	appType: "custom",
	configFile: false,
	logLevel: "silent",
	root: projectRoot,
	server: { middlewareMode: true },
});

try {
	const { App } = await vite.ssrLoadModule("/src/App.tsx");
	console.log(JSON.stringify(renderToStaticMarkup(createElement(App))));
} finally {
	await vite.close();
}`,
		);
		try {
			return execFileSync("pnpm", ["exec", "node", rendererFile, directory], {
				cwd: projectRoot,
				encoding: "utf8",
			}).trim();
		} catch (error) {
			if (error instanceof Error && "stdout" in error && "stderr" in error)
				throw new Error(`${String(error.stdout)}${String(error.stderr)}`, { cause: error });
			throw error;
		}
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
};

test("styled-components -> CSS Modules keeps a reusable React component export", () => {
	const source =
		'import styled from "styled-components";\n' +
		'export const Card = styled.div({ color: "red", padding: "1rem" });';
	const result = migrate(source);

	expect({
		code: result.code,
		converted: result.converted,
		generatedFiles: result.generatedFiles,
		residuals: result.residuals,
	}).toMatchInlineSnapshot(`
		{
		  "code": "import __pandwindCardStyles from "./Card.module.css";
		import { forwardRef as __pandwindCardForwardRef } from "react";
		import type { ComponentRef as __pandwindCardComponentRef, ComponentPropsWithoutRef as __pandwindCardComponentProps } from "react";
		export const Card = __pandwindCardForwardRef<__pandwindCardComponentRef<"div">, __pandwindCardComponentProps<"div">>(({ className, ...props }, ref) => (<div {...Object.fromEntries(Object.entries(props).filter(([key]) => !key.startsWith("$")))} ref={ref} className={[__pandwindCardStyles.root, className].filter(Boolean).join(" ")} />));",
		  "converted": 1,
		  "generatedFiles": [
		    {
		      "content": ".root { padding: 1rem; color: red; }
		",
		      "path": "src/Card.module.css",
		      "purpose": "CSS Modules styles for a migrated React component",
		    },
		  ],
		  "residuals": [],
		}
	`);
	expect(result.converted).toBe(1);
	expect(result.skipped).toBe(0);
	expect(result.residuals).toEqual([]);
	expect(result.code).toMatch(/export const Card = __pandwindCardForwardRef/u);
	expect(result.code).toContain('import __pandwindCardStyles from "./Card.module.css";');
	expect(result.code).toContain("__pandwindCardComponentProps<\"div\">");
	expect(result.code).toContain("ref");
	expect(result.generatedFiles).toHaveLength(1);
	expect(result.generatedFiles[0]).toMatchObject({ path: "src/Card.module.css" });
	expect(result.generatedFiles[0]?.content).toContain(".root {");
	expect(result.generatedFiles[0]?.content).toContain("padding: 1rem;");
	expect(result.code).not.toContain("styled-components");
	expect(typecheckGeneratedProject(result.code)).toBe("");
	const stylesheet = result.generatedFiles[0]?.content ?? "";
	const html = JSON.parse(renderGeneratedProject(result.code, stylesheet));
	expect(html).toContain('title="Reusable"');
	expect(html).toMatch(/class="[^"]+ consumer-class"/u);
	expect(html).toContain('style="display:block"');
	expect(html).not.toContain("$tone");
	expect(html).toContain(">content</div>");
	const rerun = migrate(result.code);
	expect(rerun.changed).toBe(false);
	expect(rerun.generatedFiles).toEqual([]);
});

test("styled-components -> CSS Modules preserves dynamic component styles as a residual", () => {
	const source =
		'import styled from "styled-components";\n' +
		"export const Card = styled.div({ color: (props) => props.color });";
	const result = migrate(source);

	expect(result.converted).toBe(0);
	expect(result.skipped).toBeGreaterThan(0);
	expect(result.generatedFiles).toEqual([]);
	expect(result.residuals).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				kind: "capability",
				hint: expect.stringContaining("dynamic values need"),
			}),
		]),
	);
	expect(result.code).toContain('export const Card = styled.div({ color: (props) => props.color });');
	expect(result.code).toContain("pandwind:migrate-skip");
	expect({ converted: result.converted, residuals: result.residuals }).toMatchInlineSnapshot(`
		{
		  "converted": 0,
		  "residuals": [
		    {
		      "hint": "function-values: dynamic: (props) => props.color",
		      "kind": "capability",
		      "text": "styled.div({ color: (props) => props.color })",
		    },
		    {
		      "hint": "dynamic values need a target runtime or verified CSS variable carrier",
		      "kind": "capability",
		      "text": "styled.div",
		    },
		  ],
		}
	`);
});

test("styled-components -> CSS Modules preserves polymorphic and attrs components as residuals", () => {
	const polymorphicSource =
		'import styled from "styled-components";\n' +
		'export const Card = styled.div({ color: "red" });\n' +
		'export const App = () => <Card as="a" href="/">link</Card>;';
	const attrsSource =
		'import styled from "styled-components";\n' +
		'export const Card = styled.button.attrs({ type: "button" })({ color: "red" });';
	const polymorphic = migrate(polymorphicSource);
	const attrs = migrate(attrsSource);

	for (const result of [polymorphic, attrs]) {
		expect(result.converted).toBe(0);
		expect(result.generatedFiles).toEqual([]);
		expect(result.code).toContain("pandwind:migrate-skip");
		expect(result.residuals.length).toBeGreaterThan(0);
	}
	expect(polymorphic.code).toContain('export const App = () => <Card as="a" href="/">link</Card>;');
	expect(polymorphic.code).not.toContain('<div as="a"');
	expect(attrs.code).toContain('export const Card = styled.button.attrs({ type: "button" })({ color: "red" });');
	expect({
		polymorphic: polymorphic.residuals,
		attrs: attrs.residuals,
	}).toMatchInlineSnapshot(`
		{
		  "attrs": [
		    {
		      "hint": "components: component subject: styled.button.attrs({ type: "button" }); framework-semantics: react",
		      "kind": "capability",
		      "text": "styled.button.attrs({ type: "button" })({ color: "red" })",
		    },
		    {
		      "hint": "styled-components attrs semantics need a target-specific precedence projection",
		      "kind": "capability",
		      "text": "styled.button.attrs({ type: "button" })",
		    },
		    {
		      "hint": "css-modules can emit only static React styled intrinsics without attrs or polymorphic as props",
		      "kind": "capability",
		      "text": "Card",
		    },
		  ],
		  "polymorphic": [
		    {
		      "hint": "components: component subject: styled.div; framework-semantics: react",
		      "kind": "capability",
		      "text": "styled.div({ color: "red" })",
		    },
		    {
		      "hint": "the component has polymorphic as usage",
		      "kind": "capability",
		      "text": "styled.div",
		    },
		  ],
		}
	`);
});

test("styled-components -> CSS Modules preserves a component in a malformed source file", () => {
	const source =
		'import styled from "styled-components";\n' +
		'export const Card = styled.div({ color: "red" });\n' +
		"const unfinished = { /* unfinished component file */";
	const result = migrate(source);

	expect(result.converted).toBe(0);
	expect(result.generatedFiles).toEqual([]);
	expect(result.code).toContain('export const Card = styled.div({ color: "red" });');
	expect(result.code).toContain("unfinished component file");
	expect(result.code).not.toContain("__pandwindCardForwardRef");
	expect(result.residuals).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				kind: "capability",
				hint: "the source file contains parse errors",
			}),
		]),
	);
	expect({ converted: result.converted, residuals: result.residuals }).toMatchInlineSnapshot(`
		{
		  "converted": 0,
		  "residuals": [
		    {
		      "hint": "components: component subject: styled.div; framework-semantics: react",
		      "kind": "capability",
		      "text": "styled.div({ color: "red" })",
		    },
		    {
		      "hint": "the source file contains parse errors",
		      "kind": "capability",
		      "text": "styled.div",
		    },
		  ],
		}
	`);
});

test("styled-components -> CSS Modules preserves source numeric unit semantics", () => {
	const source =
		'import styled from "styled-components";\n' +
		'export const Card = styled.div({ padding: 8, margin: 0, opacity: 0.5, lineHeight: 1.25, fontWeight: 700, zIndex: 2, "--custom": 3, boxFlex: 1, boxFlexGroup: 1, boxOrdinalGroup: 1, flexPositive: 1, flexNegative: 1, flexOrder: 1, msGridRow: 1, msGridRowSpan: 1, msGridColumn: 1, msGridColumnSpan: 1 });';
	const result = migrate(source);
	const css = result.generatedFiles[0]?.content;

	expect(result.converted).toBe(1);
	expect(result.residuals).toEqual([]);
	expect(css).toContain("padding: 8px;");
	expect(css).toContain("margin: 0;");
	expect(css).toContain("opacity: 0.5;");
	expect(css).toContain("line-height: 1.25;");
	expect(css).toContain("font-weight: 700;");
	expect(css).toContain("z-index: 2;");
	expect(css).toContain("--custom: 3;");
	expect(css).toContain("box-flex: 1px;");
	expect(css).toContain("box-flex-group: 1px;");
	expect(css).toContain("box-ordinal-group: 1px;");
	expect(css).toContain("flex-positive: 1px;");
	expect(css).toContain("flex-negative: 1px;");
	expect(css).toContain("flex-order: 1px;");
	expect(css).toContain("-ms-grid-row: 1px;");
	expect(css).toContain("-ms-grid-row-span: 1px;");
	expect(css).toContain("-ms-grid-column: 1px;");
	expect(css).toContain("-ms-grid-column-span: 1px;");
	expect({ css, residuals: result.residuals }).toMatchInlineSnapshot(`
		{
		  "css": ".root { --custom: 3; margin: 0; padding: 8px; -ms-grid-column: 1px; -ms-grid-column-span: 1px; -ms-grid-row: 1px; -ms-grid-row-span: 1px; box-flex: 1px; box-flex-group: 1px; box-ordinal-group: 1px; flex-negative: 1px; flex-order: 1px; flex-positive: 1px; font-weight: 700; line-height: 1.25; opacity: 0.5; z-index: 2; }
		",
		  "residuals": [],
		}
	`);
});
