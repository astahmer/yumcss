import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { expect, test } from "vitest";
import { runAdapterMigration } from "../src/swap/adapter-migration.ts";
import {
	BuiltinHostFramework,
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
	type AdapterGeneratedFile,
} from "../src/swap/index.ts";

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

const typecheckGeneratedProject = (
	componentSource: string,
	componentTag: "button" | "div" = "div",
	consumerAttributes = "",
): string => {
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
			`const cardRef = createRef<HTML${componentTag === "button" ? "Button" : "Div"}Element>();\n` +
			`export const App = () => <Card title="Reusable" className="consumer-class" style={{ display: "block" }} ref={cardRef} ${consumerAttributes}>content</Card>;`,
		);
		writeFileSync(
			secondConsumerFile,
			'import { Card } from "./components";\n' +
			'export const CardPreview = () => <Card aria-label="Preview">preview</Card>;',
		);
		writeFileSync(join(directory, "components.ts"), 'export { Card } from "./Card";');
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
					files: [componentFile, consumerFile, secondConsumerFile, join(directory, "components.ts"), declarationsFile],
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

const typecheckPandwindProject = (
	componentSource: string,
	generatedFiles: readonly AdapterGeneratedFile[],
): string => {
	const projectRoot = resolve(process.cwd(), "../../benchmarks/styling-tsc");
	const directory = mkdtempSync(join(projectRoot, ".codemod-pandwind-component-"));
	const sourceDirectory = join(directory, "src");
	const componentFile = join(sourceDirectory, "Card.tsx");
	const consumerFile = join(sourceDirectory, "App.tsx");
	const configFile = join(directory, "tsconfig.json");
	try {
		mkdirSync(sourceDirectory, { recursive: true });
		writeFileSync(componentFile, componentSource);
		writeFileSync(
			consumerFile,
			'import { createRef } from "react";\n' +
			'import { Card } from "./Card";\n' +
			'const divRef = createRef<HTMLDivElement>();\n' +
			'const anchorRef = createRef<HTMLAnchorElement>();\n' +
			'export const App = () => <>\n' +
				'<Card ref={divRef} title="Card">Card</Card>\n' +
				'<Card as="a" href="/card" ref={anchorRef}>Link</Card>\n' +
				"</>;\n",
		);
		for (const generatedFile of generatedFiles) {
			const generatedPath = join(directory, generatedFile.path);
			mkdirSync(dirname(generatedPath), { recursive: true });
			writeFileSync(generatedPath, generatedFile.content);
		}
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
					include: ["src/**/*.tsx", "__pandwind/**/*.tsx"],
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

const renderGeneratedProject = (
	componentSource: string,
	stylesheet: string,
	consumerAttributes = "",
	generatedFiles: readonly AdapterGeneratedFile[] = [],
	additionalConsumer = "",
): string => {
	const projectRoot = resolve(process.cwd(), "../../examples/showcase");
	const directory = mkdtempSync(join(projectRoot, ".codemod-css-modules-ssr-"));
	const sourceDirectory = join(directory, "src");
	const rendererFile = join(directory, "render.mjs");
	try {
		mkdirSync(sourceDirectory);
		writeFileSync(join(sourceDirectory, "Card.tsx"), componentSource);
		writeFileSync(join(sourceDirectory, "Card.module.css"), stylesheet);
		for (const generatedFile of generatedFiles) {
			const generatedPath = join(directory, generatedFile.path);
			mkdirSync(dirname(generatedPath), { recursive: true });
			writeFileSync(generatedPath, generatedFile.content);
		}
		writeFileSync(
			join(sourceDirectory, "App.tsx"),
			'import { createRef } from "react";\n' +
			'import { Card } from "./Card";\n' +
			'const cardRef = createRef();\n' +
			'export const App = () => <>\n' +
				`<Card title="Reusable" className="consumer-class" style={{ display: "block" }} $tone="private" ref={cardRef} ${consumerAttributes}>content</Card>\n` +
				`${additionalConsumer}\n` +
				"</>;\n",
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

test("styled-components -> Pandwind keeps a reusable polymorphic component and typed refs", () => {
	const source =
		'import styled from "styled-components";\n' +
		'export const Card = styled.div({ color: "red", padding: "1rem" });';
	const result = runAdapterMigration(source, {
		from: CodemodAdapterId.StyledComponents,
		to: CodemodAdapterId.Pandwind,
		file: "/project/src/Card.tsx",
		root: "/project",
		mode: "safe",
		readFile: () => undefined,
		adapterRegistry: catalog.registry,
		semantic: { source: { framework: BuiltinHostFramework.React } },
	});

	expect(result.converted).toBe(1);
	expect(result.skipped).toBe(0);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('from "../__pandwind/slot"');
	expect(result.generatedFiles).toHaveLength(1);
	expect(result.generatedFiles[0]?.path).toBe("__pandwind/slot.tsx");
	expect(result.generatedFiles[0]?.content).toContain("forwardRef<unknown, PandwindSlotRuntimeProps>");
	expect(result.generatedFiles[0]?.content).toContain("PandwindSlotComponent<DefaultComponent>");
	expect(result.generatedFiles[0]?.content).toContain("createElement(Component");
	expect(result.code).toMatchInlineSnapshot(`
		"import { createUnsafeCss } from "pandwind/unsafe/css";
		import { createCx } from "pandwind/cx";
		import { __pandwindSlot } from "../__pandwind/slot";
		const cx = createCx();
		const css = createUnsafeCss();
		export const Card = __pandwindSlot({ defaultComponent: "div", style: css.class({ color: "red", padding: "1rem" }), stableClass: "pw-1vtnp7w", inheritedClass: undefined, classAttribute: "className", attrs: {}, joinClass: cx });"
	`);
	expect(result.generatedFiles[0]?.content).toMatchInlineSnapshot(`
		"import { createElement, forwardRef } from "react";
		import type { ComponentPropsWithoutRef, ComponentRef, CSSProperties, ElementType, ReactElement, Ref } from "react";

		type PandwindSlotProps<Component extends ElementType> = Omit<ComponentPropsWithoutRef<Component>, "as" | "className"> & {
			readonly as?: Component;
			readonly className?: string;
			readonly ref?: Ref<ComponentRef<Component>>;
		};
		type PandwindSlotComponent<DefaultComponent extends ElementType> = <Component extends ElementType = DefaultComponent>(
			props: PandwindSlotProps<Component>,
		) => ReactElement | null;
		type PandwindSlotRuntimeProps = Record<string, unknown> & {
			readonly as?: ElementType;
			readonly className?: string;
			readonly style?: CSSProperties;
		};
		type PandwindSlotOptions<DefaultComponent extends ElementType> = {
			readonly defaultComponent: DefaultComponent;
			readonly style: string;
			readonly stableClass: string;
			readonly inheritedClass?: string;
			readonly classAttribute: string;
			readonly attrs: Readonly<Record<string, unknown>> & {
				readonly as?: ElementType;
				readonly className?: string;
				readonly style?: CSSProperties;
			};
			readonly joinClass: (...values: (string | undefined)[]) => string;
		};
		const isPandwindSlotElementType = (value: unknown): value is ElementType =>
			typeof value === "string" ||
			typeof value === "function" ||
			typeof value === "symbol" ||
			(typeof value === "object" && value !== null);

		export const __pandwindSlot = <DefaultComponent extends ElementType>({
			defaultComponent,
			style,
			stableClass,
			inheritedClass,
			classAttribute,
			attrs,
			joinClass,
		}: PandwindSlotOptions<DefaultComponent>) => {
			const component = forwardRef<unknown, PandwindSlotRuntimeProps>((props, ref) => {
				const Component = isPandwindSlotElementType(props.as) ? props.as : defaultComponent;
				const { as: _as, ...rest } = props;
				const { as: _attrsAs, ...attrsProps } = attrs;
				const attrsClassName = typeof attrs.className === "string" ? attrs.className : undefined;
				const propsClassName = typeof props.className === "string" ? props.className : undefined;
				return createElement(Component, {
					...rest,
					...attrsProps,
					ref,
					[classAttribute]: joinClass(
						style,
						stableClass,
						inheritedClass,
						attrsClassName,
						propsClassName,
					),
				});
			});
			return Object.assign(component as unknown as PandwindSlotComponent<DefaultComponent>, {
				__pandwindClassName: stableClass,
			});
		};
		"
	`);
	expect(typecheckPandwindProject(result.code, result.generatedFiles)).toBe("");
	const html = JSON.parse(
		renderGeneratedProject(
			result.code,
			"",
			"",
			result.generatedFiles,
			'<Card as="a" href="/card" ref={cardRef}>Link</Card>',
		),
	);
	expect(html).toContain('<div title="Reusable"');
	expect(html).toContain('<a href="/card"');
	expect(html).toContain(">Link</a>");
});

test("styled-components -> Pandwind preserves attrs-selected hosts as a typed residual", () => {
	const source =
		'import styled from "styled-components";\n' +
		'export const Card = styled.div.attrs({ as: "a" })({ color: "red" });';
	const result = runAdapterMigration(source, {
		from: CodemodAdapterId.StyledComponents,
		to: CodemodAdapterId.Pandwind,
		file: "/project/src/Card.tsx",
		root: "/project",
		mode: "safe",
		readFile: () => undefined,
		adapterRegistry: catalog.registry,
		semantic: { source: { framework: BuiltinHostFramework.React } },
	});

	expect(result.converted).toBe(0);
	expect(result.skipped).toBe(1);
	expect(result.code).toContain('styled.div.attrs({ as: "a" })');
	expect(result.residuals).toEqual([
		expect.objectContaining({
			kind: "host-framework",
			hint: "Pandwind preserves attrs-selected hosts until the concrete host and its ref type can be verified",
		}),
	]);
	expect(result.code).toMatchInlineSnapshot(`
		"import styled from "styled-components";
		// pandwind:migrate-skip (route: styled-components -> pandwind | lowering-residual: host-framework | available: static, named-map, residual)
		export const Card = styled.div.attrs({ as: "a" })({ color: "red" });"
	`);
});

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
		      "content": ".root { color: red; padding: 1rem; }
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

test("styled-components -> CSS Modules preserves literal DOM attrs and their precedence", () => {
	const source =
		'import styled from "styled-components";\n' +
		'export const Card = styled.button.attrs({ type: "button", "aria-label": "Saved" })({ color: "red" });';
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
		export const Card = __pandwindCardForwardRef<__pandwindCardComponentRef<"button">, __pandwindCardComponentProps<"button">>(({ className, ...props }, ref) => (<button {...Object.fromEntries([...Object.entries(props), ...Object.entries(({ type: "button", "aria-label": "Saved" }))].filter(([key]) => !key.startsWith("$")))} ref={ref} className={[__pandwindCardStyles.root, className].filter(Boolean).join(" ")} />));",
		  "converted": 1,
		  "generatedFiles": [
		    {
		      "content": ".root { color: red; }
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
	expect(result.code).toContain('Object.entries(({ type: "button", "aria-label": "Saved" }))');
	expect(result.code).toContain('import __pandwindCardStyles from "./Card.module.css";');
	expect(result.generatedFiles).toHaveLength(1);
	expect(result.generatedFiles[0]?.content).toBe(".root { color: red; }\n");
	expect(typecheckGeneratedProject(result.code, "button", 'type="submit" aria-label="Caller"')).toBe("");
	const html = JSON.parse(
		renderGeneratedProject(
			result.code,
			result.generatedFiles[0]?.content ?? "",
			'type="submit" aria-label="Caller"',
		),
	);
	expect(html).toContain("<button");
	expect(html).toContain('type="button"');
	expect(html).toContain('aria-label="Saved"');
	expect(html).not.toContain('type="submit"');
	expect(html).not.toContain('aria-label="Caller"');
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
		'export const Card = styled.button.attrs({ className: "caller-class" })({ color: "red" });';
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
	expect(attrs.code).toContain('export const Card = styled.button.attrs({ className: "caller-class" })({ color: "red" });');
	expect({
		polymorphic: polymorphic.residuals,
		attrs: attrs.residuals,
	}).toMatchInlineSnapshot(`
		{
		  "attrs": [
		    {
		      "hint": "components: component subject: styled.button.attrs({ className: "caller-class" }); framework-semantics: react",
		      "kind": "capability",
		      "text": "styled.button.attrs({ className: "caller-class" })({ color: "red" })",
		    },
		    {
		      "hint": "attrs must be a literal object of supported DOM attributes without class, style, or polymorphic props",
		      "kind": "capability",
		      "text": "styled.button.attrs({ className: "caller-class" })",
		    },
		    {
		      "hint": "css-modules can emit only static React styled intrinsics with literal DOM attrs and without polymorphic as props",
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
		  "css": ".root { padding: 8px; margin: 0; opacity: 0.5; line-height: 1.25; font-weight: 700; z-index: 2; --custom: 3; box-flex: 1px; box-flex-group: 1px; box-ordinal-group: 1px; flex-positive: 1px; flex-negative: 1px; flex-order: 1px; -ms-grid-row: 1px; -ms-grid-row-span: 1px; -ms-grid-column: 1px; -ms-grid-column-span: 1px; }
		",
		  "residuals": [],
		}
	`);
});

test("styled-components -> CSS Modules preserves authored declaration precedence", () => {
	const source =
		'import styled from "styled-components";\n' +
		'export const Card = styled.div({ marginTop: "2px", margin: "1px" });';
	const result = migrate(source);
	const css = result.generatedFiles[0]?.content;

	expect(result.converted).toBe(1);
	expect(result.residuals).toEqual([]);
	expect(css).toBe(".root { margin-top: 2px; margin: 1px; }\n");
	expect({ css, residuals: result.residuals }).toMatchInlineSnapshot(`
		{
		  "css": ".root { margin-top: 2px; margin: 1px; }
		",
		  "residuals": [],
		}
	`);
});
